import { Audio } from '../../domain/entities/Audio';
import { AudioId } from '../../domain/value-objects/AudioId';
import { UserId } from '../../domain/value-objects/UserId';
import { TranscriptionId } from '../../domain/value-objects/TranscriptionId';
import { IAudioRepository } from '../../domain/repositories/IAudioRepository';
import { AudioStorageService } from '../../infrastructure/services/AudioStorageService';
import { AudioStatus } from '../../domain/entities/Audio';

// Request/Response interfaces
export interface CreateAudioRequest {
  userId: string;
  fileName: string;
  contentType: string;
  fileSize?: number;
  duration?: number;
}

export interface CreateAudioResponse {
  audioId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface GetAudioRequest {
  audioId: string;
  userId: string;
}

export interface GetAudioResponse {
  audio: {
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  };
  downloadUrl: string;
  expiresIn: number;
}

export interface ListAudioRequest {
  userId: string;
  limit?: number;
  lastEvaluatedKey?: string;
  status?: string;
}

export interface ListAudioResponse {
  audioFiles: Array<{
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  }>;
  lastEvaluatedKey?: string;
  totalCount: number;
}

export interface DeleteAudioRequest {
  audioId: string;
  userId: string;
}

export interface DeleteAudioResponse {
  success: boolean;
  message: string;
}

export interface ProcessAudioRequest {
  audioId: string;
  userId: string;
}

export interface ProcessAudioResponse {
  success: boolean;
  message: string;
  transcriptionId: string;
  status: string;
}

export class AudioService {
  constructor(
    private audioRepository: IAudioRepository,
    private audioStorageService: AudioStorageService
  ) {}

  async createAudio(request: CreateAudioRequest): Promise<CreateAudioResponse> {
    // Validate request
    this.validateCreateRequest(request);

    const userId = UserId.fromString(request.userId);
    
    // Generate upload URL first to get the actual S3 key that will be used
    const uploadResult = await this.audioStorageService.generateUploadUrl({
      fileName: request.fileName,
      contentType: request.contentType,
      userId: request.userId,
      duration: request.duration,
    });

    // Create audio entity with the S3 key from AudioStorageService
    const audio = Audio.create({
      userId,
      fileName: request.fileName,
      contentType: request.contentType,
      fileSize: request.fileSize || 0,
      duration: request.duration,
      s3Key: uploadResult.audioFileKey, // Use the actual S3 key from storage service
    });

    // Save to repository
    await this.audioRepository.save(audio);

    return {
      audioId: audio.id.toString(),
      uploadUrl: uploadResult.uploadUrl,
      expiresIn: uploadResult.expiresIn,
    };
  }

  async getAudio(request: GetAudioRequest): Promise<GetAudioResponse> {
    const audioId = AudioId.fromString(request.audioId);
    const userId = UserId.fromString(request.userId);

    // Find audio by ID and user ID for security
    const audio = await this.audioRepository.findByIdAndUserId(audioId, userId);
    
    if (!audio) {
      throw new Error('Audio file not found or access denied');
    }

    // Generate download URL
    const downloadResult = await this.audioStorageService.generateDownloadUrl({
      audioFileKey: audio.s3Key,
      userId: request.userId,
    });

    const audioData = audio.toJSON();

    return {
      audio: {
        id: audioData.id,
        fileName: audioData.fileName,
        contentType: audioData.contentType,
        fileSize: audioData.fileSize,
        duration: audioData.duration,
        status: audioData.status,
        uploadedAt: audioData.uploadedAt.toISOString(),
        processedAt: audioData.processedAt?.toISOString(),
        transcriptionId: audioData.transcriptionId,
        processingError: audioData.processingError,
      },
      downloadUrl: downloadResult.downloadUrl,
      expiresIn: downloadResult.expiresIn,
    };
  }

  async listAudio(request: ListAudioRequest): Promise<ListAudioResponse> {
    const userId = UserId.fromString(request.userId);

    // Get audio files with optional status filter
    const result = request.status
      ? await this.audioRepository.findByUserIdAndStatus(
          userId,
          request.status,
          request.limit,
          request.lastEvaluatedKey
        )
      : await this.audioRepository.findByUserId(
          userId,
          request.limit,
          request.lastEvaluatedKey
        );

    // Get total count for the user
    const totalCount = await this.audioRepository.countByUserId(userId);

    const audioFiles = result.items.map(audio => {
      const audioData = audio.toJSON();
      return {
        id: audioData.id,
        fileName: audioData.fileName,
        contentType: audioData.contentType,
        fileSize: audioData.fileSize,
        duration: audioData.duration,
        status: audioData.status,
        uploadedAt: audioData.uploadedAt.toISOString(),
        processedAt: audioData.processedAt?.toISOString(),
        transcriptionId: audioData.transcriptionId,
        processingError: audioData.processingError,
      };
    });

    return {
      audioFiles,
      lastEvaluatedKey: result.lastEvaluatedKey,
      totalCount,
    };
  }

  async deleteAudio(request: DeleteAudioRequest): Promise<DeleteAudioResponse> {
    const audioId = AudioId.fromString(request.audioId);
    const userId = UserId.fromString(request.userId);

    // Find audio by ID and user ID for security
    const audio = await this.audioRepository.findByIdAndUserId(audioId, userId);
    
    if (!audio) {
      throw new Error('Audio file not found or access denied');
    }

    try {
      // Delete from S3 first
      await this.audioStorageService.deleteAudioFile(audio.s3Key, request.userId);
      
      // Then delete from database
      await this.audioRepository.delete(audioId);

      return {
        success: true,
        message: 'Audio file deleted successfully',
      };
    } catch (error) {
      // If S3 deletion fails, we still want to clean up the database record
      // This prevents orphaned records
      try {
        await this.audioRepository.delete(audioId);
      } catch (dbError) {
        console.error('Failed to delete audio record from database:', dbError);
      }
      
      throw new Error(`Failed to delete audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processAudio(request: ProcessAudioRequest): Promise<ProcessAudioResponse> {
    const audioId = AudioId.fromString(request.audioId);
    const userId = UserId.fromString(request.userId);

    // Find audio by ID and user ID for security
    const audio = await this.audioRepository.findByIdAndUserId(audioId, userId);
    
    if (!audio) {
      throw new Error('Audio file not found or access denied');
    }

    // Check if audio is in a processable state
    if (audio.status !== AudioStatus.UPLOADED && audio.status !== AudioStatus.FAILED) {
      throw new Error(`Cannot process audio in status: ${audio.status}`);
    }

    // Generate transcription ID and start processing
    const transcriptionId = TranscriptionId.create();
    
    try {
      // Start processing (this will change status to PROCESSING)
      audio.startProcessing(transcriptionId);
      
      // Save updated audio
      await this.audioRepository.update(audio);

      // TODO: Here we would typically:
      // 1. Start AWS Transcribe job
      // 2. Set up callback or polling mechanism
      // 3. Process transcription results
      // 4. Extract words using AI (Bedrock)
      // 5. Update status to PROCESSED or FAILED
      
      return {
        success: true,
        message: 'Audio processing started successfully',
        transcriptionId: transcriptionId.toString(),
        status: audio.status,
      };
    } catch (error) {
      // If processing fails to start, mark as failed
      audio.markAsFailed(error instanceof Error ? error.message : 'Failed to start processing');
      await this.audioRepository.update(audio);
      
      throw error;
    }
  }

  // Additional utility methods
  async getAudiosByStatus(userId: string, status: AudioStatus, limit?: number): Promise<Audio[]> {
    const userIdObj = UserId.fromString(userId);
    const result = await this.audioRepository.findByUserIdAndStatus(userIdObj, status, limit);
    return result.items;
  }

  async getProcessableAudio(limit?: number): Promise<Audio[]> {
    return await this.audioRepository.findProcessable(limit);
  }

  async audioExists(audioId: string, userId: string): Promise<boolean> {
    const audioIdObj = AudioId.fromString(audioId);
    const userIdObj = UserId.fromString(userId);
    return await this.audioRepository.existsByIdAndUserId(audioIdObj, userIdObj);
  }

  // Private validation methods
  private validateCreateRequest(request: CreateAudioRequest): void {
    if (!request.fileName || request.fileName.trim().length === 0) {
      throw new Error('File name is required');
    }

    if (request.fileName.length > 255) {
      throw new Error('File name is too long (max 255 characters)');
    }

    if (!request.contentType) {
      throw new Error('Content type is required');
    }

    // Validate content type
    const supportedTypes = this.audioStorageService.getSupportedContentTypes();
    if (!supportedTypes.includes(request.contentType.toLowerCase())) {
      throw new Error(`Unsupported audio format. Supported formats: ${supportedTypes.join(', ')}`);
    }

    // Validate file size
    if (request.fileSize && request.fileSize > this.audioStorageService.getMaxFileSizeBytes()) {
      throw new Error(
        `File size exceeds maximum allowed size of ${this.audioStorageService.getMaxFileSizeBytes() / (1024 * 1024)}MB`
      );
    }

    // Validate duration
    if (request.duration && request.duration > this.audioStorageService.getMaxDurationSeconds()) {
      throw new Error(
        `Audio duration exceeds maximum allowed duration of ${this.audioStorageService.getMaxDurationSeconds()} seconds`
      );
    }

    if (!request.userId) {
      throw new Error('User ID is required');
    }
  }
}