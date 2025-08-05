import { AudioId } from '../value-objects/AudioId';
import { UserId } from '../value-objects/UserId';
import { TranscriptionId } from '../value-objects/TranscriptionId';

export enum AudioStatus {
  UPLOADED = 'UPLOADED',       // File uploaded to S3
  PROCESSING = 'PROCESSING',   // Being transcribed/processed  
  PROCESSED = 'PROCESSED',     // Successfully processed
  FAILED = 'FAILED'           // Processing failed
}

export interface AudioProps {
  id?: AudioId;
  userId: UserId;
  fileName: string;
  contentType: string;
  fileSize: number;
  duration?: number;
  s3Key: string;
  uploadedAt?: Date;
  status?: AudioStatus;
  transcriptionId?: TranscriptionId;
  processingError?: string;
  processedAt?: Date;
}

export interface AudioJSON {
  id: string;
  userId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  duration?: number;
  s3Key: string;
  uploadedAt: Date;
  status: AudioStatus;
  transcriptionId?: string;
  processingError?: string;
  processedAt?: Date;
}

export class Audio {
  private readonly _id: AudioId;
  private readonly _userId: UserId;
  private readonly _fileName: string;
  private readonly _contentType: string;
  private readonly _fileSize: number;
  private readonly _duration?: number;
  private readonly _s3Key: string;
  private readonly _uploadedAt: Date;
  private _status: AudioStatus;
  private _transcriptionId?: TranscriptionId;
  private _processingError?: string;
  private _processedAt?: Date;

  constructor(props: AudioProps) {
    this._id = props.id || AudioId.create();
    this._userId = props.userId;
    this._fileName = this.validateFileName(props.fileName);
    this._contentType = this.validateContentType(props.contentType);
    this._fileSize = this.validateFileSize(props.fileSize);
    this._duration = props.duration;
    this._s3Key = props.s3Key;
    this._uploadedAt = props.uploadedAt || new Date();
    this._status = props.status || AudioStatus.UPLOADED;
    this._transcriptionId = props.transcriptionId;
    this._processingError = props.processingError;
    this._processedAt = props.processedAt;
  }

  // Getters
  get id(): AudioId {
    return this._id;
  }

  get userId(): UserId {
    return this._userId;
  }

  get fileName(): string {
    return this._fileName;
  }

  get contentType(): string {
    return this._contentType;
  }

  get fileSize(): number {
    return this._fileSize;
  }

  get duration(): number | undefined {
    return this._duration;
  }

  get s3Key(): string {
    return this._s3Key;
  }

  get uploadedAt(): Date {
    return this._uploadedAt;
  }

  get status(): AudioStatus {
    return this._status;
  }

  get transcriptionId(): TranscriptionId | undefined {
    return this._transcriptionId;
  }

  get processingError(): string | undefined {
    return this._processingError;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  // Domain methods
  startProcessing(transcriptionId: TranscriptionId): void {
    if (this._status !== AudioStatus.UPLOADED) {
      throw new Error(`Cannot start processing audio in status: ${this._status}`);
    }
    
    this._status = AudioStatus.PROCESSING;
    this._transcriptionId = transcriptionId;
    this._processingError = undefined;
  }

  completeProcessing(): void {
    if (this._status !== AudioStatus.PROCESSING) {
      throw new Error(`Cannot complete processing audio in status: ${this._status}`);
    }
    
    this._status = AudioStatus.PROCESSED;
    this._processedAt = new Date();
    this._processingError = undefined;
  }

  failProcessing(error: string): void {
    if (this._status !== AudioStatus.PROCESSING) {
      throw new Error(`Cannot fail processing audio in status: ${this._status}`);
    }
    
    this._status = AudioStatus.FAILED;
    this._processingError = error;
  }

  markAsFailed(error: string): void {
    this._status = AudioStatus.FAILED;
    this._processingError = error;
  }

  // Business rules validation
  isProcessable(): boolean {
    return this._status === AudioStatus.UPLOADED || this._status === AudioStatus.FAILED;
  }

  isProcessed(): boolean {
    return this._status === AudioStatus.PROCESSED;
  }

  canBeDeleted(): boolean {
    // Audio can be deleted in any status except when actively processing
    return this._status !== AudioStatus.PROCESSING;
  }

  belongsToUser(userId: UserId): boolean {
    return this._userId.equals(userId);
  }

  // Factory methods
  static create(props: {
    userId: UserId;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    s3Key: string;
  }): Audio {
    return new Audio({
      userId: props.userId,
      fileName: props.fileName,
      contentType: props.contentType,
      fileSize: props.fileSize,
      duration: props.duration,
      s3Key: props.s3Key,
    });
  }

  static fromJSON(json: AudioJSON): Audio {
    return new Audio({
      id: AudioId.fromString(json.id),
      userId: UserId.fromString(json.userId),
      fileName: json.fileName,
      contentType: json.contentType,
      fileSize: json.fileSize,
      duration: json.duration,
      s3Key: json.s3Key,
      uploadedAt: json.uploadedAt,
      status: json.status,
      transcriptionId: json.transcriptionId ? TranscriptionId.fromString(json.transcriptionId) : undefined,
      processingError: json.processingError,
      processedAt: json.processedAt,
    });
  }

  toJSON(): AudioJSON {
    return {
      id: this._id.toString(),
      userId: this._userId.toString(),
      fileName: this._fileName,
      contentType: this._contentType,
      fileSize: this._fileSize,
      duration: this._duration,
      s3Key: this._s3Key,
      uploadedAt: this._uploadedAt,
      status: this._status,
      transcriptionId: this._transcriptionId?.toString(),
      processingError: this._processingError,
      processedAt: this._processedAt,
    };
  }

  // Private validation methods
  private validateFileName(fileName: string): string {
    if (!fileName || fileName.trim().length === 0) {
      throw new Error('File name cannot be empty');
    }
    
    if (fileName.length > 255) {
      throw new Error('File name cannot exceed 255 characters');
    }
    
    // Basic file name sanitization
    const sanitized = fileName.trim();
    if (sanitized !== fileName) {
      throw new Error('File name cannot have leading or trailing whitespace');
    }
    
    return sanitized;
  }

  private validateContentType(contentType: string): string {
    const supportedTypes = [
      'audio/mpeg',
      'audio/mp3',  
      'audio/wav',
      'audio/mp4',
      'audio/m4a',
      'audio/ogg',
      'audio/webm'
    ];
    
    if (!supportedTypes.includes(contentType)) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    
    return contentType;
  }

  private validateFileSize(fileSize: number): number {
    if (fileSize <= 0) {
      throw new Error('File size must be greater than 0');
    }
    
    const maxSizeBytes = 100 * 1024 * 1024; // 100MB
    if (fileSize > maxSizeBytes) {
      throw new Error(`File size cannot exceed ${maxSizeBytes} bytes`);
    }
    
    return fileSize;
  }
}