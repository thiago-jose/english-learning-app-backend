import { Audio, AudioStatus } from '../../domain/entities/Audio';
import { IAudioRepository } from '../../domain/repositories/IAudioRepository';
import { TranscriptionService } from '../../infrastructure/services/TranscriptionService';
import { BedrockService } from '../../infrastructure/services/BedrockService';
import { WordService, CreateWordRequest } from './WordService';
import { AudioId } from '../../domain/value-objects/AudioId';
import { UserId } from '../../domain/value-objects/UserId';
import { TranscriptionId } from '../../domain/value-objects/TranscriptionId';

// Processing goals enum
export enum ProcessingGoal {
  ENGLISH_LEARNING = 'ENGLISH_LEARNING',
  TRANSCRIPTION_ONLY = 'TRANSCRIPTION_ONLY',
  SUMMARIZATION = 'SUMMARIZATION',           // Future
  GENERAL_ANALYSIS = 'GENERAL_ANALYSIS',     // Future
}

// Request/Response interfaces
export interface ProcessAudioRequest {
  audioId: string;
  userId: string;
  goal: ProcessingGoal;
  options?: ProcessingOptions;
}

export interface ProcessingOptions {
  languageCode?: string;
  speakerLabels?: boolean;
  maxSpeakers?: number;
}

export interface ProcessAudioResponse {
  success: boolean;
  message: string;
  transcriptionId: string;
  status: AudioStatus;
  goal: ProcessingGoal;
  estimatedCompletionTime?: string;
}

export interface GetProcessingResultRequest {
  audioId: string;
  userId: string;
}

export interface ProcessingResultResponse {
  audioId: string;
  goal: ProcessingGoal;
  status: AudioStatus;
  transcriptionText?: string;
  results?: ProcessingResult;
  error?: string;
  completedAt?: string;
}

export interface ProcessingResult {
  // For ENGLISH_LEARNING goal
  extractedWords?: ExtractedWordResult[];
  
  // For future goals
  summary?: string;
  analysis?: any;
  
  // Common fields
  transcriptionText: string;
  processingTime?: number;
}

export interface ExtractedWordResult {
  wordId: string;
  word: string;
  meaning: string;
  usageExample: string;
  pronunciation?: string;
  difficulty: string;
  category?: string;
}

export class AudioProcessingService {
  constructor(
    private audioRepository: IAudioRepository,
    private transcriptionService: TranscriptionService,
    private bedrockService: BedrockService,
    private wordService: WordService
  ) {}

  async processAudio(request: ProcessAudioRequest): Promise<ProcessAudioResponse> {
    const audioId = AudioId.fromString(request.audioId);
    const userId = UserId.fromString(request.userId);

    // Find and validate audio
    const audio = await this.audioRepository.findByIdAndUserId(audioId, userId);
    if (!audio) {
      throw new Error('Audio file not found or access denied');
    }

    // Check if audio is in a processable state
    if (audio.status !== AudioStatus.UPLOADED && audio.status !== AudioStatus.FAILED) {
      throw new Error(`Cannot process audio in status: ${audio.status}`);
    }

    // Validate processing goal
    this.validateProcessingGoal(request.goal);

    try {
      // Start transcription
      const transcriptionResult = await this.transcriptionService.startTranscription({
        audioFileKey: audio.s3Key,
        userId: request.userId,
        languageCode: request.options?.languageCode || 'en-US',
        speakerLabels: request.options?.speakerLabels ?? true,
        maxSpeakers: request.options?.maxSpeakers,
      });

      const transcriptionId = TranscriptionId.fromString(transcriptionResult.id);

      // Update audio status and transcription ID
      audio.startProcessing(transcriptionId);
      await this.audioRepository.update(audio);

      // Start goal-specific processing asynchronously
      // In a real implementation, this would be handled by a queue/event system
      this.processAsyncByGoal(request, transcriptionResult.id).catch((error) => {
        console.error('Async processing failed:', error);
        this.markAudioAsFailed(audioId, error.message);
      });

      return {
        success: true,
        message: `Audio processing started with goal: ${request.goal}`,
        transcriptionId: transcriptionResult.id,
        status: AudioStatus.PROCESSING,
        goal: request.goal,
        estimatedCompletionTime: this.calculateEstimatedCompletion(request.goal),
      };
    } catch (error) {
      // Mark audio as failed
      audio.markAsFailed(error instanceof Error ? error.message : 'Failed to start processing');
      await this.audioRepository.update(audio);
      throw error;
    }
  }

  async getProcessingResult(request: GetProcessingResultRequest): Promise<ProcessingResultResponse> {
    const audioId = AudioId.fromString(request.audioId);
    const userId = UserId.fromString(request.userId);

    // Find and validate audio
    const audio = await this.audioRepository.findByIdAndUserId(audioId, userId);
    if (!audio) {
      throw new Error('Audio file not found or access denied');
    }

    const response: ProcessingResultResponse = {
      audioId: request.audioId,
      goal: this.getAudioProcessingGoal(audio), // This would need to be stored in audio metadata
      status: audio.status,
    };

    if (audio.status === AudioStatus.FAILED) {
      response.error = audio.processingError;
      return response;
    }

    if (audio.status === AudioStatus.PROCESSED && audio.transcriptionId) {
      // Get transcription results
      const transcriptionStatus = await this.transcriptionService.getTranscriptionStatus(
        audio.transcriptionId.toString()
      );

      if (transcriptionStatus.transcriptionText) {
        response.transcriptionText = transcriptionStatus.transcriptionText;
        response.completedAt = audio.processedAt?.toISOString();

        // Get goal-specific results
        response.results = await this.getGoalSpecificResults(
          response.goal,
          request.userId,
          transcriptionStatus.transcriptionText
        );
      }
    }

    return response;
  }

  // Private methods for async processing
  private async processAsyncByGoal(request: ProcessAudioRequest, transcriptionId: string): Promise<void> {
    try {
      // Poll for transcription completion
      const transcriptionResult = await this.waitForTranscriptionCompletion(transcriptionId);

      if (!transcriptionResult.transcriptionText) {
        throw new Error('Transcription failed - no text produced');
      }

      // Process based on goal
      switch (request.goal) {
        case ProcessingGoal.ENGLISH_LEARNING:
          await this.processEnglishLearning(request, transcriptionResult.transcriptionText);
          break;
        case ProcessingGoal.TRANSCRIPTION_ONLY:
          await this.processTranscriptionOnly(request);
          break;
        default:
          throw new Error(`Processing goal ${request.goal} not yet implemented`);
      }

      // Mark audio as processed
      await this.markAudioAsProcessed(AudioId.fromString(request.audioId));
    } catch (error) {
      await this.markAudioAsFailed(
        AudioId.fromString(request.audioId),
        error instanceof Error ? error.message : 'Processing failed'
      );
    }
  }

  private async processEnglishLearning(request: ProcessAudioRequest, transcriptionText: string): Promise<void> {
    // Extract word from transcribed text
    const extractedWord = await this.bedrockService.processSpeechForWordExtraction(transcriptionText);

    if (!extractedWord) {
      throw new Error('Could not extract word from transcription. Try saying "save word [your word]"');
    }

    // Get word analysis from Bedrock
    const wordAnalysis = await this.bedrockService.analyzeWord(extractedWord);

    // Create word using WordService
    const createWordRequest: CreateWordRequest = {
      word: wordAnalysis.word,
      meaning: wordAnalysis.meaning,
      usageExample: wordAnalysis.usageExample,
      pronunciation: wordAnalysis.pronunciation,
      difficulty: wordAnalysis.difficulty,
      category: wordAnalysis.category,
      userId: request.userId,
      nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    };

    await this.wordService.createWord(createWordRequest);
  }

  private async processTranscriptionOnly(request: ProcessAudioRequest): Promise<void> {
    // For transcription only, we just need to ensure the transcription is complete
    // No additional processing required
    console.log(`Transcription-only processing completed for audio ${request.audioId}`);
  }

  private async waitForTranscriptionCompletion(transcriptionId: string): Promise<any> {
    // In a real implementation, this would be handled by polling or webhooks
    // For now, we'll implement a simple polling mechanism
    const maxAttempts = 30; // 5 minutes max
    const pollInterval = 10000; // 10 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.transcriptionService.getTranscriptionStatus(transcriptionId);

      if (status.status === 'COMPLETED') {
        return status;
      }

      if (status.status === 'FAILED') {
        throw new Error('Transcription job failed');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Transcription job timed out');
  }

  private async markAudioAsProcessed(audioId: AudioId): Promise<void> {
    const audio = await this.audioRepository.findById(audioId);
    if (audio) {
      audio.completeProcessing();
      await this.audioRepository.update(audio);
    }
  }

  private async markAudioAsFailed(audioId: AudioId, error: string): Promise<void> {
    const audio = await this.audioRepository.findById(audioId);
    if (audio) {
      audio.markAsFailed(error);
      await this.audioRepository.update(audio);
    }
  }

  private async getGoalSpecificResults(
    goal: ProcessingGoal,
    userId: string,
    transcriptionText: string
  ): Promise<ProcessingResult> {
    const baseResult: ProcessingResult = {
      transcriptionText,
    };

    switch (goal) {
      case ProcessingGoal.ENGLISH_LEARNING:
        // Get recently created words for this user
        const recentWords = await this.wordService.getUserWords({
          userId,
          limit: 10, // Get last 10 words
        });

        baseResult.extractedWords = recentWords.words.map((word) => ({
          wordId: word.id,
          word: word.word,
          meaning: word.meaning,
          usageExample: word.usageExample,
          pronunciation: word.pronunciation,
          difficulty: word.difficulty,
          category: word.category,
        }));
        break;

      case ProcessingGoal.TRANSCRIPTION_ONLY:
        // No additional results needed
        break;

      default:
        // Future goals would be implemented here
        break;
    }

    return baseResult;
  }

  private validateProcessingGoal(goal: ProcessingGoal): void {
    if (!Object.values(ProcessingGoal).includes(goal)) {
      throw new Error(`Invalid processing goal: ${goal}`);
    }

    // Check if goal is implemented
    if (goal === ProcessingGoal.SUMMARIZATION || goal === ProcessingGoal.GENERAL_ANALYSIS) {
      throw new Error(`Processing goal ${goal} is not yet implemented`);
    }
  }

  private calculateEstimatedCompletion(goal: ProcessingGoal): string {
    // Estimated completion times based on goal complexity
    const estimatedMinutes = goal === ProcessingGoal.ENGLISH_LEARNING ? 3 : 2;
    const completionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return completionTime.toISOString();
  }

  private getAudioProcessingGoal(audio: Audio): ProcessingGoal {
    // In a real implementation, this would be stored in audio metadata
    // For now, default to ENGLISH_LEARNING
    return ProcessingGoal.ENGLISH_LEARNING;
  }

  // Utility methods
  async getProcessingStats(userId: string): Promise<{
    totalProcessed: number;
    wordsExtracted: number;
    averageProcessingTime: number;
  }> {
    // This would be implemented based on business requirements
    const wordCount = await this.wordService.getUserWordCount(userId);

    return {
      totalProcessed: 0, // Would need to track this
      wordsExtracted: wordCount,
      averageProcessingTime: 0, // Would need to track this
    };
  }
}