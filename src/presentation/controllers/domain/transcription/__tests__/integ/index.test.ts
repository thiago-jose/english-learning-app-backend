import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../index';

// Mock the dependencies
jest.mock('../../../../../infrastructure/repositories/DynamoDBTranscriptionRepository');
jest.mock('../../../../../infrastructure/services/TranscriptionService');

describe('Transcription Controller Integration Tests', () => {
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
    process.env.TRANSCRIPTIONS_TABLE_NAME = 'TestTranscriptionsTable';
    process.env.STORAGE_BUCKET_NAME = 'test-audio-bucket';
    jest.clearAllMocks();
  });

  describe('POST /transcription - Start Transcription', () => {
    it('should start transcription successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'startTranscription',
          audioFileKey: 'audio-files/test-audio.mp3',
          languageCode: 'en-US',
          speakerLabels: true,
          maxSpeakers: 2,
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
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('transcription');
    });

    it('should return 400 for missing audioFileKey', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'startTranscription',
          // missing audioFileKey
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
      expect(body.error).toContain('audioFileKey is required');
    });
  });

  describe('POST /transcription - Get Transcription Status', () => {
    it('should get transcription status successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'getTranscriptionStatus',
          jobName: 'transcription-123-user123',
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
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('jobName');
      expect(body).toHaveProperty('status');
    });

    it('should return 400 for missing jobName', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'getTranscriptionStatus',
          // missing jobName
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
      expect(body.error).toContain('jobName is required');
    });
  });

  describe('POST /transcription - Get User Transcriptions', () => {
    it('should get user transcriptions successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'getUserTranscriptions',
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
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('transcriptions');
      expect(Array.isArray(body.transcriptions)).toBe(true);
    });
  });

  describe('Invalid Actions', () => {
    it('should return 400 for missing action', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          // missing action
          audioFileKey: 'test-audio.mp3',
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
      expect(body.error).toBe('Action is required');
    });

    it('should return 400 for invalid action', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'invalidAction',
          audioFileKey: 'test-audio.mp3',
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
      expect(body.error).toBe('Invalid action');
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

  describe('Error Handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: 'invalid json',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn());

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });
  });
});