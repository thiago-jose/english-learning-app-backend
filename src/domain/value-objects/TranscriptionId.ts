import { v4 as uuidv4 } from 'uuid';

export class TranscriptionId {
  private readonly value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TranscriptionId cannot be empty');
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error('TranscriptionId must be a valid UUID');
    }
    
    this.value = value;
  }

  static create(): TranscriptionId {
    return new TranscriptionId(uuidv4());
  }

  static fromString(value: string): TranscriptionId {
    return new TranscriptionId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TranscriptionId): boolean {
    return this.value === other.value;
  }

  // For JSON serialization
  toJSON(): string {
    return this.value;
  }
}