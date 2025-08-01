import { Word } from '../../domain/entities/Word';
import { IWordRepository } from '../../domain/repositories/IWordRepository';

export interface ReviewWordRequest {
  wordId: string;
  isCorrect: boolean;
  userId: string;
}

export class ReviewWordUseCase {
  constructor(private wordRepository: IWordRepository) {}

  async execute(request: ReviewWordRequest): Promise<Word> {
    const word = await this.wordRepository.findById(request.wordId);

    if (!word) {
      throw new Error('Word not found');
    }

    if (word.userId !== request.userId) {
      throw new Error('Unauthorized: Word does not belong to user');
    }

    const reviewCount = (word.reviewCount || 0) + 1;
    const correctCount = (word.correctCount || 0) + (request.isCorrect ? 1 : 0);

    // Calculate next review date based on spaced repetition algorithm
    const nextReviewDate = this.calculateNextReviewDate(
      request.isCorrect,
      reviewCount,
      correctCount
    );

    const updatedWord: Partial<Word> = {
      reviewCount,
      correctCount,
      nextReviewDate,
    };

    return await this.wordRepository.update(request.wordId, updatedWord);
  }

  private calculateNextReviewDate(
    isCorrect: boolean,
    reviewCount: number,
    correctCount: number
  ): Date {
    const now = new Date();
    let daysToAdd: number;

    if (!isCorrect) {
      // If incorrect, review again tomorrow
      daysToAdd = 1;
    } else {
      // Spaced repetition: increase interval based on correct answers
      const successRate = correctCount / reviewCount;

      if (reviewCount === 1) {
        daysToAdd = 3; // First correct answer: 3 days
      } else if (successRate >= 0.8) {
        // High success rate: longer intervals
        daysToAdd = Math.min(30, Math.pow(2, reviewCount - 1) * 3);
      } else if (successRate >= 0.6) {
        // Medium success rate: moderate intervals
        daysToAdd = Math.min(14, reviewCount * 2);
      } else {
        // Low success rate: shorter intervals
        daysToAdd = Math.min(7, reviewCount);
      }
    }

    return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  }
}
