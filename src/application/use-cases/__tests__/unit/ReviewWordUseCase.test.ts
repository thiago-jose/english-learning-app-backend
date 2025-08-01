import { ReviewWordUseCase } from '../../ReviewWordUseCase';
import { IWordRepository } from '../../../../domain/repositories/IWordRepository';
import { Word, WordDifficulty } from '../../../../domain/entities/Word';

describe('ReviewWordUseCase', () => {
  let reviewWordUseCase: ReviewWordUseCase;
  let mockWordRepository: jest.Mocked<IWordRepository>;

  beforeEach(() => {
    mockWordRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findWordsForReview: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    reviewWordUseCase = new ReviewWordUseCase(mockWordRepository);
  });

  const mockWord: Word = {
    id: 'word123',
    word: 'test',
    meaning: 'a procedure for evaluation',
    usageExample: 'This is a test.',
    difficulty: WordDifficulty.INTERMEDIATE,
    nextReviewDate: new Date(),
    reviewCount: 2,
    correctCount: 1,
    userId: 'user123',
    createdAt: new Date(),
  };

  it('should update word with correct review when answer is correct', async () => {
    mockWordRepository.findById.mockResolvedValue(mockWord);
    mockWordRepository.update.mockResolvedValue({
      ...mockWord,
      reviewCount: 3,
      correctCount: 2,
      nextReviewDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days later
    });

    const request = {
      wordId: 'word123',
      isCorrect: true,
      userId: 'user123',
    };

    const result = await reviewWordUseCase.execute(request);

    expect(mockWordRepository.findById).toHaveBeenCalledWith('word123');
    expect(mockWordRepository.update).toHaveBeenCalledWith('word123', {
      reviewCount: 3,
      correctCount: 2,
      nextReviewDate: expect.any(Date),
    });
    expect(result.reviewCount).toBe(3);
    expect(result.correctCount).toBe(2);
  });

  it('should update word with incorrect review when answer is incorrect', async () => {
    mockWordRepository.findById.mockResolvedValue(mockWord);
    mockWordRepository.update.mockResolvedValue({
      ...mockWord,
      reviewCount: 3,
      correctCount: 1,
      nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day later
    });

    const request = {
      wordId: 'word123',
      isCorrect: false,
      userId: 'user123',
    };

    const result = await reviewWordUseCase.execute(request);

    expect(mockWordRepository.update).toHaveBeenCalledWith('word123', {
      reviewCount: 3,
      correctCount: 1,
      nextReviewDate: expect.any(Date),
    });
    expect(result.reviewCount).toBe(3);
    expect(result.correctCount).toBe(1);
  });

  it('should throw error when word is not found', async () => {
    mockWordRepository.findById.mockResolvedValue(null);

    const request = {
      wordId: 'nonexistent',
      isCorrect: true,
      userId: 'user123',
    };

    await expect(reviewWordUseCase.execute(request)).rejects.toThrow('Word not found');
  });

  it('should throw error when user is not authorized', async () => {
    mockWordRepository.findById.mockResolvedValue(mockWord);

    const request = {
      wordId: 'word123',
      isCorrect: true,
      userId: 'unauthorized_user',
    };

    await expect(reviewWordUseCase.execute(request)).rejects.toThrow(
      'Unauthorized: Word does not belong to user'
    );
  });

  it('should handle first review correctly', async () => {
    const newWord: Word = {
      ...mockWord,
      reviewCount: 0,
      correctCount: 0,
    };

    mockWordRepository.findById.mockResolvedValue(newWord);
    mockWordRepository.update.mockResolvedValue({
      ...newWord,
      reviewCount: 1,
      correctCount: 1,
    });

    const request = {
      wordId: 'word123',
      isCorrect: true,
      userId: 'user123',
    };

    await reviewWordUseCase.execute(request);

    expect(mockWordRepository.update).toHaveBeenCalledWith('word123', {
      reviewCount: 1,
      correctCount: 1,
      nextReviewDate: expect.any(Date),
    });
  });
});
