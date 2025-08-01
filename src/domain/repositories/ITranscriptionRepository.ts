import { Transcription } from '../entities/Transcription';

export interface ITranscriptionRepository {
  create(transcription: Omit<Transcription, 'id' | 'createdAt'>): Promise<Transcription>;
  findById(id: string): Promise<Transcription | null>;
  findByUserId(userId: string): Promise<Transcription[]>;
  findByJobName(jobName: string): Promise<Transcription | null>;
  update(id: string, transcription: Partial<Transcription>): Promise<Transcription>;
  delete(id: string): Promise<void>;
}
