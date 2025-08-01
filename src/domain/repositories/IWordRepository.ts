import { Word } from '../entities/Word';

export interface IWordRepository {
  create(word: Omit<Word, 'id' | 'createdAt'>): Promise<Word>;
  findById(id: string): Promise<Word | null>;
  findByUserId(userId: string): Promise<Word[]>;
  findWordsForReview(userId: string, date?: Date): Promise<Word[]>;
  update(id: string, word: Partial<Word>): Promise<Word>;
  delete(id: string): Promise<void>;
}
