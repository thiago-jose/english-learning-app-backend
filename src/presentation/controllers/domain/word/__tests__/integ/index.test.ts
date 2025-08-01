import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../index';

// Mock the dependencies
jest.mock('../../../../../infrastructure/repositories/DynamoDBWordRepository');
jest.mock('../../../../../infrastructure/services/BedrockService');

describe('Word Controller Integration Tests', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2023/01/01/[$LATEST]abcdef123456',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  beforeEach(() => {
    process.env.WORDS_TABLE_NAME = 'TestWordsTable';
    jest.clearAllMocks();
  });

  describe('POST /words - Create Word', () => {
    it('should create a word successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
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
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('id');
      expect(body.word).toBe('example');
      expect(body.userId).toBe('user123');
    });

    it('should return 400 for missing required fields', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          word: 'example',
          // missing meaning and usageExample
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('meaning');
    });

    it('should process speech input for word creation', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          transcribedText: 'save word beautiful',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('word');
    });
  });

  describe('GET /words - Get User Words', () => {
    it('should get all user words', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        queryStringParameters: null,
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should get words for review', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        queryStringParameters: {
          forReview: 'true',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('PUT /words/{id} - Review Word', () => {
    it('should review a word successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PUT',
        pathParameters: {
          id: 'word123',
        },
        body: JSON.stringify({
          isCorrect: true,
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('reviewCount');
    });

    it('should return 400 for missing word ID', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PUT',
        pathParameters: null,
        body: JSON.stringify({
          isCorrect: true,
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Word ID is required');
    });

    it('should return 400 for invalid isCorrect value', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PUT',
        pathParameters: {
          id: 'word123',
        },
        body: JSON.stringify({
          isCorrect: 'not_a_boolean',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('isCorrect must be a boolean');
    });
  });

  describe('OPTIONS - CORS', () => {
    it('should handle OPTIONS request', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'OPTIONS',
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(200);
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'PATCH',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Method not allowed');
    });
  });
});
