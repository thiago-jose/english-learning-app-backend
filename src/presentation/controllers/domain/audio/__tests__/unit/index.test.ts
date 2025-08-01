import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from '../../index';

// Mock the dependencies
jest.mock('../../../../../../infrastructure/services/AudioStorageService', () => {
  return {
    AudioStorageService: jest.fn().mockImplementation(() => ({
      generateUploadUrl: jest.fn().mockResolvedValue({
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        uploadUrl: 'https://test-bucket.s3.amazonaws.com/presigned-url',
        expiresIn: 3600,
      }),
      generateDownloadUrl: jest.fn().mockResolvedValue({
        downloadUrl: 'https://test-bucket.s3.amazonaws.com/download-url',
        expiresIn: 3600,
      }),
      getAudioFileMetadata: jest.fn().mockResolvedValue({
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        size: 1024,
        duration: 120,
      }),
      deleteAudioFile: jest.fn().mockResolvedValue(undefined),
      getSupportedContentTypes: jest.fn().mockReturnValue([
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/m4a',
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/webm',
        'audio/ogg',
        'audio/flac',
        'audio/aac',
      ]),
      getMaxFileSizeBytes: jest.fn().mockReturnValue(100 * 1024 * 1024), // 100MB
      getMaxDurationSeconds: jest.fn().mockReturnValue(600), // 10 minutes
    })),
  };
});

describe('Audio Controller Unit Tests', () => {
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
    process.env.STORAGE_BUCKET_NAME = 'test-audio-bucket';
    process.env.AWS_REGION = 'us-east-1';
    jest.clearAllMocks();
  });

  describe('POST /audio - Generate Upload URL', () => {
    it('should generate upload URL successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'generateUploadUrl',
          fileName: 'test-audio.mp3',
          contentType: 'audio/mpeg',
          duration: 120,
          fileSize: 5 * 1024 * 1024, // 5MB
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('audioFileKey');
      expect(body).toHaveProperty('uploadUrl');
      expect(body).toHaveProperty('maxFileSize');
      expect(body).toHaveProperty('supportedFormats');
    });

    it('should return 400 for missing fileName', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'generateUploadUrl',
          contentType: 'audio/mpeg',
          // missing fileName
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileName and contentType are required');
    });

    it('should return 400 for missing contentType', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'generateUploadUrl',
          fileName: 'test-audio.mp3',
          // missing contentType
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileName and contentType are required');
    });
  });

  describe('POST /audio - Generate Download URL', () => {
    it('should generate download URL successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'generateDownloadUrl',
          audioFileKey: 'audio-files/user123/test-audio.mp3',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('downloadUrl');
      expect(body).toHaveProperty('expiresIn');
    });

    it('should return 400 for missing audioFileKey', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'generateDownloadUrl',
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

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('audioFileKey is required');
    });
  });

  describe('POST /audio - Get Metadata', () => {
    it('should get metadata successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'getMetadata',
          audioFileKey: 'audio-files/user123/test-audio.mp3',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('metadata');
    });
  });

  describe('GET /audio/{audioFileKey}', () => {
    it('should get download URL from path parameter', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        pathParameters: {
          audioFileKey: 'audio-files%2Fuser123%2Ftest-audio.mp3',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('downloadUrl');
    });

    it('should return 400 for missing audioFileKey', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        pathParameters: null,
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Audio file key is required');
    });
  });

  describe('DELETE /audio/{audioFileKey}', () => {
    it('should delete audio file successfully', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'DELETE',
        pathParameters: {
          audioFileKey: 'audio-files%2Fuser123%2Ftest-audio.mp3',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('deleted successfully');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for missing action', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          fileName: 'test-audio.mp3',
          contentType: 'audio/mpeg',
          // missing action
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Action is required');
    });

    it('should return 400 for invalid action', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        body: JSON.stringify({
          action: 'invalidAction',
          fileName: 'test-audio.mp3',
          contentType: 'audio/mpeg',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user123',
            },
          },
        } as any,
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid action');
    });

    it('should handle invalid JSON', async () => {
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

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 405 for unsupported methods', async () => {
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

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Method not allowed');
    });
  });

  describe('OPTIONS - CORS', () => {
    it('should handle OPTIONS request', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'OPTIONS',
      };

      const result = await handler(event as APIGatewayProxyEvent, mockContext, jest.fn()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
    });
  });
});