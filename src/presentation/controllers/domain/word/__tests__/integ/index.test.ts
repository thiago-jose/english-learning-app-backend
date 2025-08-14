import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../index';

// Mock the dependencies  
jest.mock('../../../../../application/services/WordService');

// Create a mock WordService
const mockWordService = {
  createWord: jest.fn(),
  getWord: jest.fn(),
  getUserWords: jest.fn(),
  reviewWord: jest.fn(),
  updateWord: jest.fn(),
  deleteWord: jest.fn(),
  getWordsForReview: jest.fn(),
};

// Mock the WordService module
jest.mock('../../../../../application/services/WordService', () => {
  return {
    WordService: jest.fn().mockImplementation(() => mockWordService),
  };
});

describe('Word Controller Integration Tests', () => {
  const userId = 'user123';
  const wordId = 'word456';

  beforeEach(() => {
    process.env.WORDS_TABLE_NAME = 'TestWordsTable';
    jest.clearAllMocks();
  });

  describe('POST /users/{userId}/words - Create Word', () => {
    it('should create a word successfully', async () => {
      const mockWordResponse = {
        id: wordId,
        word: 'example',
        meaning: 'a thing characteristic of its kind',
        usageExample: 'This is an example.',
        difficulty: 'INTERMEDIATE',
        category: 'noun',
        userId,
        reviewCount: 0,
        correctCount: 0,
        nextReviewDate: '2023-12-01T00:00:00.000Z',
        createdAt: '2023-11-01T00:00:00.000Z',
      };

      mockWordService.createWord.mockResolvedValue(mockWordResponse);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: `/users/${userId}/words`,
        pathParameters: { userId },
        body: JSON.stringify({
          word: 'example',
          meaning: 'a thing characteristic of its kind',
          usageExample: 'This is an example.',
          difficulty: 'INTERMEDIATE',
          category: 'noun',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('id');
      expect(body.word).toBe('example');
      expect(body.userId).toBe(userId);
      expect(mockWordService.createWord).toHaveBeenCalledWith({
        word: 'example',
        meaning: 'a thing characteristic of its kind',
        usageExample: 'This is an example.',
        difficulty: 'INTERMEDIATE',
        category: 'noun',
        userId,
      });
    });

    it('should return 400 for missing required fields', async () => {
      mockWordService.createWord.mockRejectedValue(new Error('Meaning is required'));

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: `/users/${userId}/words`,
        pathParameters: { userId },
        body: JSON.stringify({
          word: 'example',
          // missing meaning and usageExample
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Meaning is required');
    });

    it('should return 403 for accessing another user\'s endpoint', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: `/users/different-user/words`,
        pathParameters: { userId: 'different-user' },
        body: JSON.stringify({
          word: 'example',
          meaning: 'a thing characteristic of its kind',
          usageExample: 'This is an example.',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: userId, // Different from path parameter
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Access denied');
    });
  });

  describe('GET /users/{userId}/words - Get User Words', () => {
    it('should get all user words', async () => {
      const mockWordsResponse = {
        words: [
          {
            id: wordId,
            word: 'example',
            meaning: 'a thing characteristic of its kind',
            usageExample: 'This is an example.',
            difficulty: 'INTERMEDIATE',
            userId,
            reviewCount: 0,
            correctCount: 0,
            nextReviewDate: '2023-12-01T00:00:00.000Z',
            createdAt: '2023-11-01T00:00:00.000Z',
          },
        ],
        totalCount: 1,
      };

      mockWordService.getUserWords.mockResolvedValue(mockWordsResponse);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: `/users/${userId}/words`,
        pathParameters: { userId },
        queryStringParameters: null,
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.words).toEqual(mockWordsResponse.words);
      expect(body.totalCount).toBe(1);
    });
  });

  describe('GET /users/{userId}/words/{wordId} - Get Word', () => {
    it('should get word details', async () => {
      const mockWordResponse = {
        id: wordId,
        word: 'example',
        meaning: 'a thing characteristic of its kind',
        usageExample: 'This is an example.',
        difficulty: 'INTERMEDIATE',
        userId,
        reviewCount: 0,
        correctCount: 0,
        nextReviewDate: '2023-12-01T00:00:00.000Z',
        createdAt: '2023-11-01T00:00:00.000Z',
      };

      mockWordService.getWord.mockResolvedValue(mockWordResponse);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: `/users/${userId}/words/${wordId}`,
        pathParameters: { userId, wordId },
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe(wordId);
      expect(body.word).toBe('example');
    });
  });

  describe('POST /users/{userId}/words/{wordId}/review - Review Word', () => {
    it('should review word successfully', async () => {
      const mockReviewResponse = {
        id: wordId,
        word: 'example',
        meaning: 'a thing characteristic of its kind',
        usageExample: 'This is an example.',
        difficulty: 'INTERMEDIATE',
        userId,
        reviewCount: 1,
        correctCount: 1,
        nextReviewDate: '2023-12-04T00:00:00.000Z', // 3 days later
        createdAt: '2023-11-01T00:00:00.000Z',
        updatedAt: '2023-12-01T00:00:00.000Z',
      };

      mockWordService.reviewWord.mockResolvedValue(mockReviewResponse);

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: `/users/${userId}/words/${wordId}/review`,
        pathParameters: { userId, wordId },
        body: JSON.stringify({
          isCorrect: true,
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.reviewCount).toBe(1);
      expect(body.correctCount).toBe(1);
      expect(mockWordService.reviewWord).toHaveBeenCalledWith({
        wordId,
        isCorrect: true,
        userId,
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown route', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: `/users/${userId}/unknown`,
        pathParameters: { userId },
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Endpoint not found');
    });

    it('should handle OPTIONS request for CORS', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'OPTIONS',
        path: `/users/${userId}/words`,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin');
    });
  });
});