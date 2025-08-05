import { v4 as uuidv4 } from 'uuid';

export class AudioId {
  private readonly value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('AudioId cannot be empty');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error('AudioId must be a valid UUID');
    }

    this.value = value;
  }

  static create(): AudioId {
    return new AudioId(uuidv4());
  }

  static fromString(value: string): AudioId {
    return new AudioId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: AudioId): boolean {
    return this.value === other.value;
  }

  // For JSON serialization
  toJSON(): string {
    return this.value;
  }
}
