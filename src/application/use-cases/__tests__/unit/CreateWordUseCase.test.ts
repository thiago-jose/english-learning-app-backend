import { CreateWordUseCase } from '../../CreateWordUseCase';
import { IWordRepository } from '../../../../domain/repositories/IWordRepository';
import { Word, WordDifficulty } from '../../../../domain/entities/Word';

describe('CreateWordUseCase', () => {
  let createWordUseCase: CreateWordUseCase;
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
    createWordUseCase = new CreateWordUseCase(mockWordRepository);
  });

  it('should create a word successfully', async () => {
    const mockWord: Word = {
      id: '123',
      word: 'test',
      meaning: 'a procedure for evaluation',
      usageExample: 'This is a test.',
      difficulty: WordDifficulty.INTERMEDIATE,
      category: 'noun',
      nextReviewDate: new Date(),
      reviewCount: 0,
      correctCount: 0,
      userId: 'user123',
      createdAt: new Date(),
    };

    mockWordRepository.create.mockResolvedValue(mockWord);

    const request = {
      word: 'Test',
      meaning: 'a procedure for evaluation',
      usageExample: 'This is a test.',
      userId: 'user123',
    };

    const result = await createWordUseCase.execute(request);

    expect(result).toEqual(mockWord);
    expect(mockWordRepository.create).toHaveBeenCalledWith({
      word: 'test',
      meaning: 'a procedure for evaluation',
      usageExample: 'This is a test.',
      difficulty: WordDifficulty.INTERMEDIATE,
      category: undefined,
      nextReviewDate: expect.any(Date),
      reviewCount: 0,
      correctCount: 0,
      userId: 'user123',
      pronunciation: undefined,
    });
  });

  it('should normalize word to lowercase and trim whitespace', async () => {
    const mockWord: Word = {
      id: '123',
      word: 'example',
      meaning: 'a thing characteristic of its kind',
      usageExample: 'This is an example.',
      difficulty: WordDifficulty.BEGINNER,
      category: 'noun',
      nextReviewDate: new Date(),
      reviewCount: 0,
      correctCount: 0,
      userId: 'user123',
      createdAt: new Date(),
    };

    mockWordRepository.create.mockResolvedValue(mockWord);

    const request = {
      word: '  EXAMPLE  ',
      meaning: '  a thing characteristic of its kind  ',
      usageExample: '  This is an example.  ',
      difficulty: WordDifficulty.BEGINNER,
      category: '  noun  ',
      userId: 'user123',
    };

    await createWordUseCase.execute(request);

    expect(mockWordRepository.create).toHaveBeenCalledWith({
      word: 'example',
      meaning: 'a thing characteristic of its kind',
      usageExample: 'This is an example.',
      difficulty: WordDifficulty.BEGINNER,
      category: 'noun',
      nextReviewDate: expect.any(Date),
      reviewCount: 0,
      correctCount: 0,
      userId: 'user123',
      pronunciation: undefined,
    });
  });

  it('should set default difficulty to INTERMEDIATE when not provided', async () => {
    const mockWord: Word = {
      id: '123',
      word: 'default',
      meaning: 'a preselected option',
      usageExample: 'This is the default setting.',
      difficulty: WordDifficulty.INTERMEDIATE,
      nextReviewDate: new Date(),
      reviewCount: 0,
      correctCount: 0,
      userId: 'user123',
      createdAt: new Date(),
    };

    mockWordRepository.create.mockResolvedValue(mockWord);

    const request = {
      word: 'default',
      meaning: 'a preselected option',
      usageExample: 'This is the default setting.',
      userId: 'user123',
    };

    await createWordUseCase.execute(request);

    expect(mockWordRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        difficulty: WordDifficulty.INTERMEDIATE,
      })
    );
  });
});
