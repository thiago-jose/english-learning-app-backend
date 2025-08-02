import {
  AudioStorageService,
  UploadAudioRequest,
  UploadAudioResponse,
} from '../../infrastructure/services/AudioStorageService';

export interface GenerateUploadUrlRequest {
  fileName: string;
  contentType: string;
  userId: string;
  duration?: number;
  fileSize?: number;
}

export interface GenerateUploadUrlResponse extends UploadAudioResponse {
  maxFileSize: number;
  maxDuration: number;
  supportedFormats: string[];
}

export class UploadAudioUseCase {
  constructor(private audioStorageService: AudioStorageService) {}

  async generateUploadUrl(request: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
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

    // Validate file name
    if (!request.fileName || request.fileName.trim().length === 0) {
      throw new Error('File name is required');
    }

    if (request.fileName.length > 255) {
      throw new Error('File name is too long (max 255 characters)');
    }

    const uploadRequest: UploadAudioRequest = {
      fileName: request.fileName,
      contentType: request.contentType,
      userId: request.userId,
      duration: request.duration,
    };

    const uploadResponse = await this.audioStorageService.generateUploadUrl(uploadRequest);

    return {
      ...uploadResponse,
      maxFileSize: this.audioStorageService.getMaxFileSizeBytes(),
      maxDuration: this.audioStorageService.getMaxDurationSeconds(),
      supportedFormats: this.audioStorageService.getSupportedContentTypes(),
    };
  }
}
