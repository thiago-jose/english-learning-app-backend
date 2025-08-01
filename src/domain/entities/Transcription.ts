export interface Transcription {
  id: string;
  userId: string;
  audioUrl: string;
  text: string;
  status: TranscriptionStatus;
  jobName?: string;
  speakerLabels?: SpeakerLabel[];
  createdAt: Date;
  updatedAt?: Date;
}

export enum TranscriptionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface SpeakerLabel {
  speaker: string;
  startTime: number;
  endTime: number;
  items: SpeakerItem[];
}

export interface SpeakerItem {
  start_time: string;
  end_time: string;
  type: string;
  alternatives: {
    confidence: string;
    content: string;
  }[];
}
