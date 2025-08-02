import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadAudioRequest {
  fileName: string;
  contentType: string;
  userId: string;
  duration?: number;
}

export interface UploadAudioResponse {
  audioFileKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface GenerateDownloadUrlRequest {
  audioFileKey: string;
  userId: string;
}

export interface GenerateDownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}

export class AudioStorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly defaultExpirationTime = 3600; // 1 hour

  constructor(bucketName: string, region: string = 'us-east-1') {
    this.s3Client = new S3Client({ region });
    this.bucketName = bucketName;
  }

  async generateUploadUrl(request: UploadAudioRequest): Promise<UploadAudioResponse> {
    const timestamp = Date.now();
    const fileExtension = this.getFileExtension(request.contentType);
    const audioFileKey = `audio-files/${request.userId}/${timestamp}-${this.sanitizeFileName(request.fileName)}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: audioFileKey,
      ContentType: request.contentType,
      Metadata: {
        userId: request.userId,
        originalFileName: request.fileName,
        uploadedAt: new Date().toISOString(),
        ...(request.duration && { duration: request.duration.toString() }),
      },
    });

    try {
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.defaultExpirationTime,
      });

      return {
        audioFileKey,
        uploadUrl,
        expiresIn: this.defaultExpirationTime,
      };
    } catch (error) {
      console.error('Error generating upload URL:', error);
      throw new Error(
        `Failed to generate upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async generateDownloadUrl(
    request: GenerateDownloadUrlRequest
  ): Promise<GenerateDownloadUrlResponse> {
    // Verify the file belongs to the user
    if (!this.isUserFile(request.audioFileKey, request.userId)) {
      throw new Error('Unauthorized: File does not belong to user');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: request.audioFileKey,
    });

    try {
      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.defaultExpirationTime,
      });

      return {
        downloadUrl,
        expiresIn: this.defaultExpirationTime,
      };
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw new Error(
        `Failed to generate download URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async uploadAudioBuffer(
    audioBuffer: Buffer,
    request: UploadAudioRequest
  ): Promise<{ audioFileKey: string }> {
    const timestamp = Date.now();
    const fileExtension = this.getFileExtension(request.contentType);
    const audioFileKey = `audio-files/${request.userId}/${timestamp}-${this.sanitizeFileName(request.fileName)}${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: audioFileKey,
      Body: audioBuffer,
      ContentType: request.contentType,
      Metadata: {
        userId: request.userId,
        originalFileName: request.fileName,
        uploadedAt: new Date().toISOString(),
        ...(request.duration && { duration: request.duration.toString() }),
      },
    });

    try {
      await this.s3Client.send(command);
      return { audioFileKey };
    } catch (error) {
      console.error('Error uploading audio buffer:', error);
      throw new Error(
        `Failed to upload audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteAudioFile(audioFileKey: string, userId: string): Promise<void> {
    // Verify the file belongs to the user
    if (!this.isUserFile(audioFileKey, userId)) {
      throw new Error('Unauthorized: File does not belong to user');
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: audioFileKey,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      console.error('Error deleting audio file:', error);
      throw new Error(
        `Failed to delete audio file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getAudioFileMetadata(
    audioFileKey: string,
    userId: string
  ): Promise<Record<string, string> | null> {
    // Verify the file belongs to the user
    if (!this.isUserFile(audioFileKey, userId)) {
      throw new Error('Unauthorized: File does not belong to user');
    }

    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: audioFileKey,
    });

    try {
      const response = await this.s3Client.send(command);

      // Create a flattened metadata object with all relevant information
      const metadata: Record<string, string> = {
        'content-type': response.ContentType || 'application/octet-stream',
        'content-length': (response.ContentLength || 0).toString(),
        'last-modified': response.LastModified?.toISOString() || new Date().toISOString(),
        ...(response.Metadata || {}), // Include any custom metadata
      };

      return metadata;
    } catch (error) {
      console.error('Error getting audio file metadata:', error);
      return null;
    }
  }

  private getFileExtension(contentType: string): string {
    const extensionMap: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/mp4': '.mp4',
      'audio/m4a': '.m4a',
      'audio/wav': '.wav',
      'audio/wave': '.wav',
      'audio/x-wav': '.wav',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/flac': '.flac',
      'audio/aac': '.aac',
    };

    return extensionMap[contentType.toLowerCase()] || '.mp3';
  }

  private sanitizeFileName(fileName: string): string {
    // Remove file extension and sanitize
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    return (
      nameWithoutExt
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'audio'
    );
  }

  private isUserFile(audioFileKey: string, userId: string): boolean {
    // Check if the file path contains the user ID
    return audioFileKey.startsWith(`audio-files/${userId}/`);
  }

  getSupportedContentTypes(): string[] {
    return [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
      'audio/flac',
      'audio/aac',
    ];
  }

  getMaxFileSizeBytes(): number {
    return 100 * 1024 * 1024; // 100MB
  }

  getMaxDurationSeconds(): number {
    return 600; // 10 minutes
  }
}
