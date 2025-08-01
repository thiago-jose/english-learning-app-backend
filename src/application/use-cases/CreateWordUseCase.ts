import { Word, WordDifficulty } from '../../domain/entities/Word';
import { IWordRepository } from '../../domain/repositories/IWordRepository';

export interface CreateWordRequest {
  word: string;
  meaning: string;
  usageExample: string;
  pronunciation?: string;
  difficulty?: WordDifficulty;
  category?: string;
  userId: string;
  nextReviewDate?: Date;
}

export class CreateWordUseCase {
  constructor(private wordRepository: IWordRepository) {}

  async execute(request: CreateWordRequest): Promise<Word> {
    const nextReviewDate = request.nextReviewDate || new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow by default

    const wordData: Omit<Word, 'id' | 'createdAt'> = {
      word: request.word.toLowerCase().trim(),
      meaning: request.meaning.trim(),
      usageExample: request.usageExample.trim(),
      pronunciation: request.pronunciation?.trim(),
      difficulty: request.difficulty || WordDifficulty.INTERMEDIATE,
      category: request.category?.trim(),
      nextReviewDate,
      reviewCount: 0,
      correctCount: 0,
      userId: request.userId,
    };

    return await this.wordRepository.create(wordData);
  }
}
