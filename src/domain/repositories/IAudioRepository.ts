import { Audio } from '../entities/Audio';
import { AudioId } from '../value-objects/AudioId';
import { UserId } from '../value-objects/UserId';

export interface IAudioRepository {
  /**
   * Save an audio record to the repository
   */
  save(audio: Audio): Promise<void>;

  /**
   * Find an audio record by its ID
   */
  findById(audioId: AudioId): Promise<Audio | null>;

  /**
   * Find an audio record by ID, but only if it belongs to the specified user
   */
  findByIdAndUserId(audioId: AudioId, userId: UserId): Promise<Audio | null>;

  /**
   * Find all audio records for a specific user
   */
  findByUserId(
    userId: UserId,
    limit?: number,
    lastEvaluatedKey?: string
  ): Promise<{
    items: Audio[];
    lastEvaluatedKey?: string;
  }>;

  /**
   * Find audio records by status for a specific user
   */
  findByUserIdAndStatus(
    userId: UserId,
    status: string,
    limit?: number,
    lastEvaluatedKey?: string
  ): Promise<{
    items: Audio[];
    lastEvaluatedKey?: string;
  }>;

  /**
   * Update an existing audio record
   */
  update(audio: Audio): Promise<void>;

  /**
   * Delete an audio record by its ID
   */
  delete(audioId: AudioId): Promise<void>;

  /**
   * Check if an audio record exists and belongs to the specified user
   */
  existsByIdAndUserId(audioId: AudioId, userId: UserId): Promise<boolean>;

  /**
   * Count total audio files for a user
   */
  countByUserId(userId: UserId): Promise<number>;

  /**
   * Find audio records that need processing (status = UPLOADED or FAILED)
   */
  findProcessable(limit?: number): Promise<Audio[]>;
}
