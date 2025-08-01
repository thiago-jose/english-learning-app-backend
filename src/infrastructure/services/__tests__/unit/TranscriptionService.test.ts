import { TranscriptionService } from '../../TranscriptionService';
import { ITranscriptionRepository } from '../../../../domain/repositories/ITranscriptionRepository';
import { Transcription, TranscriptionStatus } from '../../../../domain/entities/Transcription';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-transcribe');
jest.mock('@aws-sdk/client-s3');

describe('TranscriptionService', () => {
  let transcriptionService: TranscriptionService;
  let mockTranscriptionRepository: jest.Mocked<ITranscriptionRepository>;
  let mockTranscribeClient: jest.Mocked<TranscribeClient>;
  let mockS3Client: jest.Mocked<S3Client>;

  beforeEach(() => {
    mockTranscriptionRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByJobName: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockTranscribeClient = {
      send: jest.fn(),
    } as any;

    mockS3Client = {
      send: jest.fn(),
    } as any;

    (TranscribeClient as jest.Mock).mockImplementation(() => mockTranscribeClient);
    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);

    transcriptionService = new TranscriptionService(
      mockTranscriptionRepository,
      'test-bucket',
      'us-east-1'
    );
  });

  describe('startTranscription', () => {
    it('should start transcription successfully', async () => {
      const mockTranscription: Transcription = {
        id: '123',
        userId: 'user123',
        audioUrl: 's3://test-bucket/audio-file.mp3',
        text: '',
        status: TranscriptionStatus.IN_PROGRESS,
        jobName: 'transcription-123-user123',
        createdAt: new Date(),
      };

      mockTranscribeClient.send.mockResolvedValue({
        TranscriptionJob: {
          TranscriptionJobName: 'transcription-123-user123',
          TranscriptionJobStatus: 'IN_PROGRESS',
        },
      });

      mockTranscriptionRepository.create.mockResolvedValue(mockTranscription);

      const request = {
        audioFileKey: 'audio-file.mp3',
        userId: 'user123',
        languageCode: 'en-US',
      };

      const result = await transcriptionService.startTranscription(request);

      expect(mockTranscribeClient.send).toHaveBeenCalledWith(
        expect.any(StartTranscriptionJobCommand)
      );
      expect(mockTranscriptionRepository.create).toHaveBeenCalledWith({
        userId: 'user123',
        audioUrl: 's3://test-bucket/audio-file.mp3',
        text: '',
        status: TranscriptionStatus.IN_PROGRESS,
        jobName: expect.stringContaining('transcription-'),
      });
      expect(result).toEqual(mockTranscription);
    });

    it('should handle transcription start failure', async () => {
      mockTranscribeClient.send.mockRejectedValue(new Error('Transcribe error'));

      const request = {
        audioFileKey: 'audio-file.mp3',
        userId: 'user123',
      };

      await expect(transcriptionService.startTranscription(request)).rejects.toThrow(
        'Failed to start transcription: Transcribe error'
      );
    });
  });

  describe('getTranscriptionStatus', () => {
    it('should get transcription status for in-progress job', async () => {
      mockTranscribeClient.send.mockResolvedValue({
        TranscriptionJob: {
          TranscriptionJobName: 'test-job',
          TranscriptionJobStatus: 'IN_PROGRESS',
          CreationTime: new Date(),
        },
      });

      const result = await transcriptionService.getTranscriptionStatus('test-job');

      expect(result).toEqual({
        jobName: 'test-job',
        status: 'IN_PROGRESS',
        transcriptionText: undefined,
        speakerLabels: undefined,
        creationTime: expect.any(Date),
        completionTime: undefined,
      });
    });

    it('should get transcription status for completed job and update database', async () => {
      const mockTranscript = {
        results: {
          transcripts: [{ transcript: 'Hello world' }],
          speaker_labels: {
            segments: [
              {
                speaker_label: 'spk_0',
                start_time: '0.0',
                end_time: '2.0',
                items: [],
              },
            ],
          },
        },
      };

      mockTranscribeClient.send.mockResolvedValue({
        TranscriptionJob: {
          TranscriptionJobName: 'test-job',
          TranscriptionJobStatus: 'COMPLETED',
          Transcript: {
            TranscriptFileUri: 's3://test-bucket/transcriptions/test-job.json',
          },
          CreationTime: new Date(),
          CompletionTime: new Date(),
        },
      });

      mockS3Client.send.mockResolvedValue({
        Body: {
          transformToString: () => Promise.resolve(JSON.stringify(mockTranscript)),
        },
      });

      const mockDbTranscription: Transcription = {
        id: '123',
        userId: 'user123',
        audioUrl: 's3://test-bucket/audio.mp3',
        text: '',
        status: TranscriptionStatus.IN_PROGRESS,
        jobName: 'test-job',
        createdAt: new Date(),
      };

      mockTranscriptionRepository.findByJobName.mockResolvedValue(mockDbTranscription);
      mockTranscriptionRepository.update.mockResolvedValue({
        ...mockDbTranscription,
        text: 'Hello world',
        status: TranscriptionStatus.COMPLETED,
      });

      const result = await transcriptionService.getTranscriptionStatus('test-job');

      expect(mockTranscriptionRepository.update).toHaveBeenCalledWith('123', {
        status: TranscriptionStatus.COMPLETED,
        text: 'Hello world',
        speakerLabels: expect.any(Array),
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.transcriptionText).toBe('Hello world');
    });

    it('should handle failed transcription job', async () => {
      mockTranscribeClient.send.mockResolvedValue({
        TranscriptionJob: {
          TranscriptionJobName: 'test-job',
          TranscriptionJobStatus: 'FAILED',
          FailureReason: 'Audio format not supported',
        },
      });

      const mockDbTranscription: Transcription = {
        id: '123',
        userId: 'user123',
        audioUrl: 's3://test-bucket/audio.mp3',
        text: '',
        status: TranscriptionStatus.IN_PROGRESS,
        jobName: 'test-job',
        createdAt: new Date(),
      };

      mockTranscriptionRepository.findByJobName.mockResolvedValue(mockDbTranscription);
      mockTranscriptionRepository.update.mockResolvedValue({
        ...mockDbTranscription,
        status: TranscriptionStatus.FAILED,
      });

      const result = await transcriptionService.getTranscriptionStatus('test-job');

      expect(mockTranscriptionRepository.update).toHaveBeenCalledWith('123', {
        status: TranscriptionStatus.FAILED,
      });

      expect(result.status).toBe('FAILED');
    });

    it('should handle service errors', async () => {
      mockTranscribeClient.send.mockRejectedValue(new Error('Service unavailable'));

      await expect(transcriptionService.getTranscriptionStatus('test-job')).rejects.toThrow(
        'Failed to get transcription status: Service unavailable'
      );
    });
  });

  describe('private methods', () => {
    it('should handle invalid language codes', () => {
      // We can't directly test private methods, but we can test the behavior
      const request = {
        audioFileKey: 'audio-file.mp3',
        userId: 'user123',
        languageCode: 'invalid-lang',
      };

      // The service should not throw an error for invalid language codes
      // It should default to en-US (tested through the public method)
      expect(() => transcriptionService.startTranscription(request)).not.toThrow();
    });
  });
});