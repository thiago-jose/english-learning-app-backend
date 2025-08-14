import { Word, WordDifficulty } from '../../domain/entities/Word';
import { IWordRepository } from '../../domain/repositories/IWordRepository';

// Request/Response interfaces
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

export interface GetWordRequest {
  wordId: string;
  userId: string;
}

export interface GetUserWordsRequest {
  userId: string;
  forReview?: boolean;
  reviewDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ReviewWordRequest {
  wordId: string;
  isCorrect: boolean;
  userId: string;
}

export interface UpdateWordRequest {
  wordId: string;
  userId: string;
  data: {
    word?: string;
    meaning?: string;
    usageExample?: string;
    pronunciation?: string;
    difficulty?: WordDifficulty;
    category?: string;
  };
}

export interface DeleteWordRequest {
  wordId: string;
  userId: string;
}

// Response types
export interface WordResponse {
  id: string;
  word: string;
  meaning: string;
  usageExample: string;
  pronunciation?: string;
  difficulty: WordDifficulty;
  category?: string;
  nextReviewDate: string;
  reviewCount: number;
  correctCount: number;
  userId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ListWordsResponse {
  words: WordResponse[];
  totalCount: number;
  hasMore?: boolean;
}

export interface DeleteWordResponse {
  success: boolean;
  message: string;
}

export interface ReviewWordsResponse extends ListWordsResponse {
  reviewDate: string;
}

export class WordService {
  constructor(private wordRepository: IWordRepository) {}

  async createWord(request: CreateWordRequest): Promise<WordResponse> {
    // Validate request
    this.validateCreateRequest(request);

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

    const createdWord = await this.wordRepository.create(wordData);
    return this.mapWordToResponse(createdWord);
  }

  async getWord(request: GetWordRequest): Promise<WordResponse> {
    const word = await this.wordRepository.findById(request.wordId);

    if (!word) {
      throw new Error('Word not found');
    }

    // Validate user access
    this.validateUserAccess(request.userId, word.userId);

    return this.mapWordToResponse(word);
  }

  async getUserWords(request: GetUserWordsRequest): Promise<ListWordsResponse> {
    let words: Word[];

    if (request.forReview) {
      words = await this.wordRepository.findWordsForReview(
        request.userId,
        request.reviewDate || new Date()
      );
    } else {
      words = await this.wordRepository.findByUserId(request.userId);
    }

    // Apply pagination if requested
    let paginatedWords = words;
    let hasMore = false;

    if (request.limit && request.offset !== undefined) {
      const start = request.offset;
      const end = start + request.limit;
      paginatedWords = words.slice(start, end);
      hasMore = end < words.length;
    }

    const wordResponses = paginatedWords.map((word) => this.mapWordToResponse(word));

    return {
      words: wordResponses,
      totalCount: words.length,
      hasMore,
    };
  }

  async getWordsForReview(request: GetUserWordsRequest): Promise<ReviewWordsResponse> {
    const reviewDate = request.reviewDate || new Date();
    const words = await this.wordRepository.findWordsForReview(request.userId, reviewDate);

    // Apply pagination if requested
    let paginatedWords = words;
    let hasMore = false;

    if (request.limit && request.offset !== undefined) {
      const start = request.offset;
      const end = start + request.limit;
      paginatedWords = words.slice(start, end);
      hasMore = end < words.length;
    }

    const wordResponses = paginatedWords.map((word) => this.mapWordToResponse(word));

    return {
      words: wordResponses,
      totalCount: words.length,
      hasMore,
      reviewDate: reviewDate.toISOString(),
    };
  }

  async reviewWord(request: ReviewWordRequest): Promise<WordResponse> {
    const word = await this.wordRepository.findById(request.wordId);

    if (!word) {
      throw new Error('Word not found');
    }

    // Validate user access
    this.validateUserAccess(request.userId, word.userId);

    const reviewCount = (word.reviewCount || 0) + 1;
    const correctCount = (word.correctCount || 0) + (request.isCorrect ? 1 : 0);

    // Calculate next review date based on spaced repetition algorithm
    const nextReviewDate = this.calculateNextReviewDate(
      request.isCorrect,
      reviewCount,
      correctCount
    );

    const updatedWordData: Partial<Word> = {
      reviewCount,
      correctCount,
      nextReviewDate,
      updatedAt: new Date(),
    };

    const updatedWord = await this.wordRepository.update(request.wordId, updatedWordData);
    return this.mapWordToResponse(updatedWord);
  }

  async updateWord(request: UpdateWordRequest): Promise<WordResponse> {
    const word = await this.wordRepository.findById(request.wordId);

    if (!word) {
      throw new Error('Word not found');
    }

    // Validate user access
    this.validateUserAccess(request.userId, word.userId);

    // Validate update data
    this.validateUpdateRequest(request.data);

    const updateData: Partial<Word> = {
      ...request.data,
      updatedAt: new Date(),
    };

    // Clean and format word field if provided
    if (updateData.word) {
      updateData.word = updateData.word.toLowerCase().trim();
    }

    const updatedWord = await this.wordRepository.update(request.wordId, updateData);
    return this.mapWordToResponse(updatedWord);
  }

  async deleteWord(request: DeleteWordRequest): Promise<DeleteWordResponse> {
    const word = await this.wordRepository.findById(request.wordId);

    if (!word) {
      throw new Error('Word not found');
    }

    // Validate user access
    this.validateUserAccess(request.userId, word.userId);

    await this.wordRepository.delete(request.wordId);

    return {
      success: true,
      message: 'Word deleted successfully',
    };
  }

  // Utility methods
  async wordExists(wordId: string, userId: string): Promise<boolean> {
    try {
      const word = await this.wordRepository.findById(wordId);
      return word !== null && word.userId === userId;
    } catch (error) {
      return false;
    }
  }

  async getUserWordCount(userId: string): Promise<number> {
    const words = await this.wordRepository.findByUserId(userId);
    return words.length;
  }

  async getReviewCount(userId: string, date?: Date): Promise<number> {
    const words = await this.wordRepository.findWordsForReview(userId, date || new Date());
    return words.length;
  }

  // Private validation methods
  private validateCreateRequest(request: CreateWordRequest): void {
    if (!request.word || request.word.trim().length === 0) {
      throw new Error('Word is required');
    }

    if (!request.meaning || request.meaning.trim().length === 0) {
      throw new Error('Meaning is required');
    }

    if (!request.usageExample || request.usageExample.trim().length === 0) {
      throw new Error('Usage example is required');
    }

    if (!request.userId) {
      throw new Error('User ID is required');
    }

    // Length validations
    if (request.word.length > 100) {
      throw new Error('Word is too long (max 100 characters)');
    }

    if (request.meaning.length > 500) {
      throw new Error('Meaning is too long (max 500 characters)');
    }

    if (request.usageExample.length > 1000) {
      throw new Error('Usage example is too long (max 1000 characters)');
    }

    if (request.pronunciation && request.pronunciation.length > 200) {
      throw new Error('Pronunciation is too long (max 200 characters)');
    }

    if (request.category && request.category.length > 50) {
      throw new Error('Category is too long (max 50 characters)');
    }
  }

  private validateUpdateRequest(data: UpdateWordRequest['data']): void {
    if (data.word !== undefined) {
      if (!data.word || data.word.trim().length === 0) {
        throw new Error('Word cannot be empty');
      }
      if (data.word.length > 100) {
        throw new Error('Word is too long (max 100 characters)');
      }
    }

    if (data.meaning !== undefined) {
      if (!data.meaning || data.meaning.trim().length === 0) {
        throw new Error('Meaning cannot be empty');
      }
      if (data.meaning.length > 500) {
        throw new Error('Meaning is too long (max 500 characters)');
      }
    }

    if (data.usageExample !== undefined) {
      if (!data.usageExample || data.usageExample.trim().length === 0) {
        throw new Error('Usage example cannot be empty');
      }
      if (data.usageExample.length > 1000) {
        throw new Error('Usage example is too long (max 1000 characters)');
      }
    }

    if (data.pronunciation !== undefined && data.pronunciation.length > 200) {
      throw new Error('Pronunciation is too long (max 200 characters)');
    }

    if (data.category !== undefined && data.category.length > 50) {
      throw new Error('Category is too long (max 50 characters)');
    }
  }

  private validateUserAccess(requestingUserId: string, wordUserId: string): void {
    if (requestingUserId !== wordUserId) {
      throw new Error('Access denied. You can only access your own words.');
    }
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

  private mapWordToResponse(word: Word): WordResponse {
    return {
      id: word.id,
      word: word.word,
      meaning: word.meaning,
      usageExample: word.usageExample,
      pronunciation: word.pronunciation,
      difficulty: word.difficulty || WordDifficulty.INTERMEDIATE,
      category: word.category,
      nextReviewDate: word.nextReviewDate.toISOString(),
      reviewCount: word.reviewCount || 0,
      correctCount: word.correctCount || 0,
      userId: word.userId,
      createdAt: word.createdAt.toISOString(),
      updatedAt: word.updatedAt?.toISOString(),
    };
  }
}