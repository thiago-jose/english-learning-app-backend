import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  LanguageCode,
} from '@aws-sdk/client-transcribe';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  Transcription,
  TranscriptionStatus,
  SpeakerLabel,
} from '../../domain/entities/Transcription';
import { ITranscriptionRepository } from '../../domain/repositories/ITranscriptionRepository';

export interface StartTranscriptionRequest {
  audioFileKey: string;
  userId: string;
  languageCode?: string;
  speakerLabels?: boolean;
  maxSpeakers?: number;
}

export interface TranscriptionJobStatus {
  jobName: string;
  status: string;
  transcriptionText?: string;
  speakerLabels?: SpeakerLabel[];
  creationTime?: Date;
  completionTime?: Date;
}

export class TranscriptionService {
  private readonly transcribeClient: TranscribeClient;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private transcriptionRepository: ITranscriptionRepository,
    bucketName: string,
    region: string = 'us-east-1'
  ) {
    this.transcribeClient = new TranscribeClient({ region });
    this.s3Client = new S3Client({ region });
    this.bucketName = bucketName;
  }

  async startTranscription(request: StartTranscriptionRequest): Promise<Transcription> {
    const jobName = `transcription-${Date.now()}-${request.userId}`;
    const mediaUri = `s3://${this.bucketName}/${request.audioFileKey}`;

    const params = {
      TranscriptionJobName: jobName,
      LanguageCode: this.getLanguageCode(request.languageCode || 'en-US'),
      Media: {
        MediaFileUri: mediaUri,
      },
      OutputBucketName: this.bucketName,
      OutputKey: `transcriptions/${jobName}.json`,
      Settings: {
        ShowSpeakerLabels: request.speakerLabels || true,
        MaxSpeakerLabels: request.maxSpeakers || 2,
        ShowAlternatives: true,
        MaxAlternatives: 3,
      },
    };

    try {
      const command = new StartTranscriptionJobCommand(params);
      await this.transcribeClient.send(command);

      // Create transcription record in database
      const transcription = await this.transcriptionRepository.create({
        userId: request.userId,
        audioUrl: mediaUri,
        text: '',
        status: TranscriptionStatus.IN_PROGRESS,
        jobName,
      });

      return transcription;
    } catch (error) {
      console.error('Error starting transcription job:', error);
      throw new Error(
        `Failed to start transcription: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getTranscriptionStatus(jobName: string): Promise<TranscriptionJobStatus> {
    try {
      const command = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName,
      });
      const result = await this.transcribeClient.send(command);

      const job = result.TranscriptionJob;
      let transcriptionText: string | undefined = undefined;
      let speakerLabels: SpeakerLabel[] = [];

      // If completed, fetch the actual transcription text and speaker labels
      if (job?.TranscriptionJobStatus === 'COMPLETED' && job.Transcript?.TranscriptFileUri) {
        const transcriptData = await this.fetchTranscriptionText(job.Transcript.TranscriptFileUri);
        transcriptionText = transcriptData?.transcript || undefined;
        speakerLabels = transcriptData?.speakerLabels || [];

        // Update the database record
        const dbTranscription = await this.transcriptionRepository.findByJobName(jobName);
        if (dbTranscription) {
          await this.transcriptionRepository.update(dbTranscription.id, {
            status: TranscriptionStatus.COMPLETED,
            text: transcriptionText || '',
            speakerLabels,
          });
        }
      } else if (job?.TranscriptionJobStatus === 'FAILED') {
        // Update the database record
        const dbTranscription = await this.transcriptionRepository.findByJobName(jobName);
        if (dbTranscription) {
          await this.transcriptionRepository.update(dbTranscription.id, {
            status: TranscriptionStatus.FAILED,
          });
        }
      }

      return {
        jobName: job?.TranscriptionJobName || jobName,
        status: job?.TranscriptionJobStatus || 'UNKNOWN',
        transcriptionText,
        speakerLabels,
        creationTime: job?.CreationTime,
        completionTime: job?.CompletionTime,
      };
    } catch (error) {
      console.error('Error getting transcription job status:', error);
      throw new Error(
        `Failed to get transcription status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fetchTranscriptionText(transcriptFileUri: string): Promise<{
    transcript: string;
    speakerLabels: SpeakerLabel[];
  } | null> {
    try {
      const s3UriMatch = transcriptFileUri.match(/s3:\/\/([^/]+)\/(.+)/);
      if (!s3UriMatch) {
        console.error('Invalid S3 URI format:', transcriptFileUri);
        return null;
      }

      const [, bucketName, key] = s3UriMatch;

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const transcriptData = await response.Body?.transformToString();

      if (!transcriptData) {
        return null;
      }

      const transcript = JSON.parse(transcriptData);

      const transcriptText = transcript.results?.transcripts?.[0]?.transcript || '';
      const speakerSegments = transcript.results?.speaker_labels?.segments || [];

      const speakerLabels: SpeakerLabel[] = speakerSegments.map((segment: any) => ({
        speaker: segment.speaker_label,
        startTime: parseFloat(segment.start_time),
        endTime: parseFloat(segment.end_time),
        items: segment.items || [],
      }));

      return {
        transcript: transcriptText,
        speakerLabels,
      };
    } catch (error) {
      console.error('Error fetching transcription text:', error);
      return null;
    }
  }

  private getLanguageCode(langCode: string): LanguageCode {
    if (Object.values(LanguageCode).includes(langCode as LanguageCode)) {
      return langCode as LanguageCode;
    }

    console.warn(`Invalid language code: ${langCode}, defaulting to en-US`);
    return LanguageCode.EN_US;
  }
}
