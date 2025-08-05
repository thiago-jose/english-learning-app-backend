import { Audio } from '../../domain/entities/Audio';
import { AudioDynamoDBItem } from './types';

export interface IAudioMapper {
  toDomain(item: AudioDynamoDBItem): Audio;
  toDynamoDB(audio: Audio): AudioDynamoDBItem;
}
