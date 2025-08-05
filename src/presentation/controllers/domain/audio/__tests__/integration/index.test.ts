import axios from 'axios';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Type definitions for new user-scoped API responses
interface CreateAudioResponse {
  success: boolean;
  audioId: string;
  uploadUrl: string;
  expiresIn: number;
}

interface ListAudioResponse {
  success: boolean;
  audioFiles: Array<{
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  }>;
  lastEvaluatedKey?: string;
  totalCount: number;
}

interface GetAudioResponse {
  success: boolean;
  audio: {
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  };
  downloadUrl: string;
  expiresIn: number;
}

interface DeleteAudioResponse {
  success: boolean;
  message: string;
}

interface ProcessAudioResponse {
  success: boolean;
  message: string;
  transcriptionId: string;
  status: string;
}

interface ErrorResponse {
  error: string;
}

// Cognito authentication helper for tests
class AudioTestCognitoHelper {
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.COGNITO_CLIENT_ID || '';
  }

  async createTestUser(email: string, password: string, name: string): Promise<string> {
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: this.userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS',
    });

    await this.cognitoClient.send(createUserCommand);

    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: this.userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    });

    await this.cognitoClient.send(setPasswordCommand);
    return email;
  }

  async signInUser(
    email: string,
    password: string
  ): Promise<{
    idToken: string;
    accessToken: string;
    refreshToken: string;
    userId: string;
  }> {
    try {
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: this.userPoolId,
        ClientId: this.clientId,
        AuthFlow: AuthFlowType.ADMIN_NO_SRP_AUTH,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const authResponse = await this.cognitoClient.send(authCommand);

      if (!authResponse.AuthenticationResult) {
        throw new Error('Authentication failed');
      }

      // Decode ID token to get user ID
      const idToken = authResponse.AuthenticationResult.IdToken!;
      const tokenPayload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
      const userId = tokenPayload.sub;

      return {
        idToken,
        accessToken: authResponse.AuthenticationResult.AccessToken!,
        refreshToken: authResponse.AuthenticationResult.RefreshToken!,
        userId,
      };
    } catch (error: any) {
      if (error.name === 'AccessDeniedException') {
        throw new Error(
          'AdminInitiateAuth requires additional IAM permissions: cognito-idp:AdminInitiateAuth'
        );
      }
      throw error;
    }
  }

  async deleteTestUser(email: string): Promise<void> {
    try {
      const deleteCommand = new AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      });
      await this.cognitoClient.send(deleteCommand);
    } catch (error) {
      console.warn(`Failed to delete test user ${email}:`, error);
    }
  }
}

// Real integration tests - testing the full API Gateway → Lambda workflow
describe('Audio Controller User-Scoped API Integration Tests', () => {
  const apiEndpoint =
    process.env.API_ENDPOINT || 'https://1bvgxdmq64.execute-api.us-east-1.amazonaws.com/dev/';
  const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const bucketName = process.env.STORAGE_BUCKET_NAME || 'dev-english-learning-audio-files';

  // Cognito authentication for JWT tests
  const cognitoHelper = new AudioTestCognitoHelper();
  let jwtTestUser: {
    email: string;
    userId: string;
    tokens: {
      idToken: string;
      accessToken: string;
      refreshToken: string;
    };
  } | null = null;

  let secondJwtTestUser: {
    email: string;
    userId: string;
    tokens: {
      idToken: string;
      accessToken: string;
      refreshToken: string;
    };
  } | null = null;

  beforeAll(async () => {
    // Set up JWT test users
    if (process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID) {
      try {
        // Create first test user
        const testUserEmail = `audio-test-1-${Date.now()}@example.com`;
        await cognitoHelper.createTestUser(testUserEmail, 'TestPass123!', 'Audio Test User 1');
        const tokens = await cognitoHelper.signInUser(testUserEmail, 'TestPass123!');

        jwtTestUser = {
          email: testUserEmail,
          userId: tokens.userId,
          tokens,
        };

        // Create second test user for isolation testing
        const secondTestUserEmail = `audio-test-2-${Date.now()}@example.com`;
        await cognitoHelper.createTestUser(
          secondTestUserEmail,
          'TestPass123!',
          'Audio Test User 2'
        );
        const secondTokens = await cognitoHelper.signInUser(secondTestUserEmail, 'TestPass123!');

        secondJwtTestUser = {
          email: secondTestUserEmail,
          userId: secondTokens.userId,
          tokens: secondTokens,
        };

        console.log('✅ JWT test users created for audio integration tests');
      } catch (error) {
        console.error('❌ Failed to create JWT test users:', error);
        throw new Error('JWT test users are required for user-scoped endpoint testing');
      }
    } else {
      throw new Error('Cognito configuration is required for user-scoped endpoint testing');
    }
  });

  afterAll(async () => {
    // Clean up JWT test users
    if (jwtTestUser) {
      try {
        await cognitoHelper.deleteTestUser(jwtTestUser.email);
        console.log('✅ First JWT test user cleaned up');
      } catch (error) {
        console.warn('⚠️  Failed to clean up first JWT test user:', error);
      }
    }

    if (secondJwtTestUser) {
      try {
        await cognitoHelper.deleteTestUser(secondJwtTestUser.email);
        console.log('✅ Second JWT test user cleaned up');
      } catch (error) {
        console.warn('⚠️  Failed to clean up second JWT test user:', error);
      }
    }
  });

  const uploadedAudioIds: string[] = [];

  afterAll(async () => {
    // Clean up any uploaded files
    for (const audioId of uploadedAudioIds) {
      try {
        if (jwtTestUser) {
          await makeAuthenticatedRequest(
            'DELETE',
            `users/${jwtTestUser.userId}/audio/${audioId}`,
            undefined,
            jwtTestUser.tokens.idToken
          );
        }
        console.log(`Cleaned up test audio: ${audioId}`);
      } catch (error) {
        console.warn(`Failed to clean up test audio ${audioId}:`, error);
      }
    }
  });

  // Helper function to make authenticated requests with JWT token
  const makeAuthenticatedRequest = async (
    method: string,
    path: string,
    data?: any,
    jwtToken?: string
  ) => {
    const url = `${apiEndpoint}${path}`;
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    } else if (jwtTestUser) {
      headers['Authorization'] = `Bearer ${jwtTestUser.tokens.idToken}`;
    } else {
      throw new Error('JWT token is required for authenticated requests');
    }

    switch (method.toUpperCase()) {
      case 'GET':
        return axios.get(url, { headers });
      case 'POST':
        return axios.post(url, data, { headers });
      case 'PUT':
        return axios.put(url, data, { headers });
      case 'DELETE':
        return axios.delete(url, { headers });
      case 'OPTIONS':
        return axios.request({ method: 'OPTIONS', url, headers });
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  };

  describe('POST /users/{userId}/audio/upload - Create Audio Upload', () => {
    it('should create audio and generate upload URL', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'integration-test-audio.mp3',
        contentType: 'audio/mpeg',
        duration: 30,
        fileSize: 1024 * 1024, // 1MB
      };

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/upload`,
        requestData
      );

      const data = response.data as CreateAudioResponse;

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.audioId).toBeDefined();
      expect(data.uploadUrl).toContain(bucketName);
      expect(data.uploadUrl).toContain('s3');
      expect(data.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(data.expiresIn).toBe(3600);

      // Track for cleanup
      uploadedAudioIds.push(data.audioId);
    }, 15000);

    it('should reject unsupported content type', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'test.txt',
        contentType: 'text/plain',
      };

      try {
        await makeAuthenticatedRequest(
          'POST',
          `users/${jwtTestUser.userId}/audio/upload`,
          requestData
        );
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Unsupported audio format');
      }
    }, 10000);

    it("should reject access to another user's upload endpoint", async () => {
      if (!jwtTestUser || !secondJwtTestUser) throw new Error('JWT test users required');

      const requestData = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
      };

      try {
        // Try to upload to second user's endpoint with first user's token
        await makeAuthenticatedRequest(
          'POST',
          `users/${secondJwtTestUser.userId}/audio/upload`,
          requestData,
          jwtTestUser.tokens.idToken
        );
        fail('Expected request to fail with 403 status');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error).toContain('Access denied');
      }
    }, 10000);
  });

  describe('GET /users/{userId}/audio - List User Audio Files', () => {
    let testAudioId: string;

    beforeAll(async () => {
      // Create a test audio file for listing
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'list-test-audio.mp3',
        contentType: 'audio/mpeg',
        fileSize: 500000,
      };

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/upload`,
        requestData
      );

      testAudioId = (response.data as CreateAudioResponse).audioId;
      uploadedAudioIds.push(testAudioId);
    });

    it("should list user's audio files", async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest('GET', `users/${jwtTestUser.userId}/audio`);

      const data = response.data as ListAudioResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.audioFiles)).toBe(true);
      expect(data.totalCount).toBeGreaterThanOrEqual(1);

      // Should contain our test audio
      const testAudio = data.audioFiles.find((audio) => audio.id === testAudioId);
      expect(testAudio).toBeDefined();
      expect(testAudio?.fileName).toBe('list-test-audio.mp3');
      expect(testAudio?.contentType).toBe('audio/mpeg');
      expect(testAudio?.status).toBe('UPLOADED');
    }, 10000);

    it('should support pagination with limit', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest(
        'GET',
        `users/${jwtTestUser.userId}/audio?limit=1`
      );

      const data = response.data as ListAudioResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.audioFiles.length).toBeLessThanOrEqual(1);
    }, 10000);

    it("should reject access to another user's audio list", async () => {
      if (!jwtTestUser || !secondJwtTestUser) throw new Error('JWT test users required');

      try {
        await makeAuthenticatedRequest(
          'GET',
          `users/${secondJwtTestUser.userId}/audio`,
          undefined,
          jwtTestUser.tokens.idToken
        );
        fail('Expected request to fail with 403 status');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error).toContain('Access denied');
      }
    }, 10000);
  });

  describe('GET /users/{userId}/audio/{audioId} - Get Audio Details', () => {
    let testAudioId: string;

    beforeAll(async () => {
      // Create a test audio file
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'get-test-audio.mp3',
        contentType: 'audio/mpeg',
        fileSize: 750000,
        duration: 45,
      };

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/upload`,
        requestData
      );

      testAudioId = (response.data as CreateAudioResponse).audioId;
      uploadedAudioIds.push(testAudioId);
    });

    it('should get audio details and download URL', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest(
        'GET',
        `users/${jwtTestUser.userId}/audio/${testAudioId}`
      );

      const data = response.data as GetAudioResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.audio.id).toBe(testAudioId);
      expect(data.audio.fileName).toBe('get-test-audio.mp3');
      expect(data.audio.contentType).toBe('audio/mpeg');
      expect(data.audio.fileSize).toBe(750000);
      expect(data.audio.duration).toBe(45);
      expect(data.audio.status).toBe('UPLOADED');
      expect(data.downloadUrl).toContain(bucketName);
      expect(data.expiresIn).toBe(3600);
    }, 10000);

    it('should return 404 for non-existent audio', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const nonExistentId = 'non-existent-audio-id';

      try {
        await makeAuthenticatedRequest('GET', `users/${jwtTestUser.userId}/audio/${nonExistentId}`);
        fail('Expected request to fail with 404 status');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toMatch(/not found|must be a valid UUID/);
      }
    }, 10000);

    it("should reject access to another user's audio", async () => {
      if (!jwtTestUser || !secondJwtTestUser) throw new Error('JWT test users required');

      try {
        await makeAuthenticatedRequest(
          'GET',
          `users/${secondJwtTestUser.userId}/audio/${testAudioId}`,
          undefined,
          jwtTestUser.tokens.idToken
        );
        fail('Expected request to fail with 403 status');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error).toContain('Access denied');
      }
    }, 10000);
  });

  describe('DELETE /users/{userId}/audio/{audioId} - Delete Audio', () => {
    let testAudioId: string;

    beforeEach(async () => {
      // Create a fresh test audio file for each delete test
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'delete-test-audio.mp3',
        contentType: 'audio/mpeg',
        fileSize: 250000,
      };

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/upload`,
        requestData
      );

      testAudioId = (response.data as CreateAudioResponse).audioId;
    });

    it('should delete audio successfully', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest(
        'DELETE',
        `users/${jwtTestUser.userId}/audio/${testAudioId}`
      );

      const data = response.data as DeleteAudioResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted successfully');

      // Verify audio is deleted by trying to get it
      try {
        await makeAuthenticatedRequest('GET', `users/${jwtTestUser.userId}/audio/${testAudioId}`);
        fail('Expected request to fail with 404 status');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    }, 15000);

    it('should return 404 when deleting non-existent audio', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const nonExistentId = 'non-existent-audio-id';

      try {
        await makeAuthenticatedRequest(
          'DELETE',
          `users/${jwtTestUser.userId}/audio/${nonExistentId}`
        );
        fail('Expected request to fail with 404 status');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toMatch(/not found|must be a valid UUID/);
      }
    }, 10000);
  });

  describe('POST /users/{userId}/audio/{audioId}/process - Process Audio', () => {
    let testAudioId: string;

    beforeAll(async () => {
      // Create a test audio file for processing
      if (!jwtTestUser) throw new Error('JWT test user required');

      const requestData = {
        fileName: 'process-test-audio.mp3',
        contentType: 'audio/mpeg',
        fileSize: 1000000,
        duration: 60,
      };

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/upload`,
        requestData
      );

      testAudioId = (response.data as CreateAudioResponse).audioId;
      uploadedAudioIds.push(testAudioId);
    });

    it('should start audio processing', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest(
        'POST',
        `users/${jwtTestUser.userId}/audio/${testAudioId}/process`
      );

      const data = response.data as ProcessAudioResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('processing started');
      expect(data.transcriptionId).toBeDefined();
      expect(data.status).toBe('PROCESSING');
    }, 10000);

    it('should reject processing non-existent audio', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const nonExistentId = 'non-existent-audio-id';

      try {
        await makeAuthenticatedRequest(
          'POST',
          `users/${jwtTestUser.userId}/audio/${nonExistentId}/process`
        );
        fail('Expected request to fail with 404 status');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toMatch(/not found|must be a valid UUID/);
      }
    }, 10000);
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without JWT token', async () => {
      const url = `${apiEndpoint}users/test-user/audio`;

      try {
        await axios.get(url, {
          headers: { 'Content-Type': 'application/json' },
        });
        fail('Expected request to fail with 401 status');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    }, 10000);

    it('should reject requests with invalid JWT token', async () => {
      const url = `${apiEndpoint}users/test-user/audio`;

      try {
        await axios.get(url, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token',
          },
        });
        fail('Expected request to fail with 401 status');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    }, 10000);
  });

  describe('CORS Support', () => {
    it('should handle OPTIONS request for CORS', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      const response = await makeAuthenticatedRequest(
        'OPTIONS',
        `users/${jwtTestUser.userId}/audio`
      );

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should return 400 for missing required fields', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      try {
        await makeAuthenticatedRequest(
          'POST',
          `users/${jwtTestUser.userId}/audio/upload`,
          {} // Empty request body
        );
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('required');
      }
    }, 10000);

    it('should return 404 for invalid endpoint', async () => {
      if (!jwtTestUser) throw new Error('JWT test user required');

      try {
        await makeAuthenticatedRequest('GET', `users/${jwtTestUser.userId}/audio/invalid-endpoint`);
        fail('Expected request to fail with 404 status');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toMatch(/not found|must be a valid UUID/);
      }
    }, 10000);
  });
});
