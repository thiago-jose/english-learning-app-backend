import { Audio, AudioStatus } from '../../domain/entities/Audio';
import { IAudioMapper } from './IAudioMapper';
import { AudioDynamoDBItem } from './types';

export class AudioMapper implements IAudioMapper {
  toDomain(item: AudioDynamoDBItem): Audio {
    return Audio.fromJSON({
      id: item.id,
      userId: item.userId,
      fileName: item.fileName,
      contentType: item.contentType,
      fileSize: item.fileSize,
      duration: item.duration,
      s3Key: item.s3Key,
      uploadedAt: new Date(item.uploadedAt),
      status: item.status as AudioStatus,
      transcriptionId: item.transcriptionId,
      processingError: item.processingError,
      processedAt: item.processedAt ? new Date(item.processedAt) : undefined,
    });
  }

  toDynamoDB(audio: Audio): AudioDynamoDBItem {
    const json = audio.toJSON();

    return {
      id: json.id,
      userId: json.userId,
      fileName: json.fileName,
      contentType: json.contentType,
      fileSize: json.fileSize,
      duration: json.duration,
      s3Key: json.s3Key,
      uploadedAt: json.uploadedAt.toISOString(),
      status: json.status,
      transcriptionId: json.transcriptionId,
      processingError: json.processingError,
      processedAt: json.processedAt?.toISOString(),
    };
  }
}
