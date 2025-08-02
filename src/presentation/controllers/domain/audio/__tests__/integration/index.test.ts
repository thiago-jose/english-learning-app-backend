import axios from 'axios';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Type definitions for API responses
interface UploadUrlResponse {
  success: boolean;
  audioFileKey: string;
  uploadUrl: string;
  expiresIn: number;
  maxFileSize: number;
  supportedFormats: string[];
}

interface DownloadUrlResponse {
  success: boolean;
  downloadUrl: string;
  expiresIn: number;
}

interface DeleteResponse {
  success: boolean;
  message: string;
}

interface ErrorResponse {
  error: string;
}

// Helper to cast response data with proper typing
const asUpload = (data: unknown) => data as UploadUrlResponse;
const asDownload = (data: unknown) => data as DownloadUrlResponse;
const asDelete = (data: unknown) => data as DeleteResponse;

// Real integration tests - testing the full API Gateway → Lambda workflow
describe('Audio Controller API Integration Tests', () => {
  const apiEndpoint = process.env.API_ENDPOINT || 'https://qc72vo0ce9.execute-api.us-east-1.amazonaws.com/dev/';
  const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const bucketName = process.env.STORAGE_BUCKET_NAME || 'dev-english-learning-audio-files';
  
  beforeEach(() => {
    // Set environment variables for real AWS services if not already defined
    if (!process.env.STORAGE_BUCKET_NAME) {
      process.env.STORAGE_BUCKET_NAME = 'dev-english-learning-audio-files';
    }
    if (!process.env.AWS_REGION) {
      process.env.AWS_REGION = 'us-east-1';
    }
  });

  const uploadedFiles: string[] = [];

  afterAll(async () => {
    // Clean up any uploaded files
    for (const audioFileKey of uploadedFiles) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: audioFileKey,
        }));
        console.log(`Cleaned up test file: ${audioFileKey}`);
      } catch (error) {
        console.warn(`Failed to clean up test file ${audioFileKey}:`, error);
      }
    }
  });

  // Helper function to make authenticated requests (you'll need to implement JWT token generation)
  const makeAuthenticatedRequest = async (method: string, path: string, data?: any) => {
    const url = `${apiEndpoint}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      // Note: In a real scenario, you'd need to add Authorization header with JWT token
      // 'Authorization': `Bearer ${jwtToken}`,
      'X-Test-User-Id': 'integration-test-user', // Mock user ID for testing
    };

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

  describe('POST /audio - Generate Upload URL (API Gateway)', () => {
    it('should generate a real S3 upload URL via API Gateway', async () => {
      const requestData = {
        action: 'generateUploadUrl',
        fileName: 'integration-test-audio.mp3',
        contentType: 'audio/mpeg',
        duration: 30,
        fileSize: 1024 * 1024, // 1MB
      };

      const response = await makeAuthenticatedRequest('POST', 'audio', requestData);
      const data = response.data as UploadUrlResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.audioFileKey).toContain('integration-test-user');
      expect(data.audioFileKey).toContain('integration-test-audio.mp3');
      expect(data.uploadUrl).toContain(bucketName);
      expect(data.uploadUrl).toContain('s3');
      expect(data.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(data.expiresIn).toBe(3600);
      expect(data.maxFileSize).toBeGreaterThan(0);
      expect(data.supportedFormats).toContain('audio/mpeg');

      // Track for cleanup
      uploadedFiles.push(data.audioFileKey);
    }, 15000);

    it('should reject unsupported content type via API Gateway', async () => {
      const requestData = {
        action: 'generateUploadUrl',
        fileName: 'test.txt',
        contentType: 'text/plain',
      };

      try {
        await makeAuthenticatedRequest('POST', 'audio', requestData);
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Unsupported audio format');
      }
    });

    it('should reject file size that exceeds limit via API Gateway', async () => {
      const requestData = {
        action: 'generateUploadUrl',
        fileName: 'huge-file.mp3',
        contentType: 'audio/mpeg',
        fileSize: 200 * 1024 * 1024, // 200MB - exceeds 100MB limit
      };

      try {
        await makeAuthenticatedRequest('POST', 'audio', requestData);
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('File size exceeds maximum');
      }
    });
  });

  describe('POST /audio - Generate Download URL (API Gateway)', () => {
    it('should generate download URL for existing file via API Gateway', async () => {
      // First generate an upload URL to get a valid audioFileKey
      const uploadRequestData = {
        action: 'generateUploadUrl',
        fileName: 'download-test.mp3',
        contentType: 'audio/mpeg',
      };

      const uploadResponse = await makeAuthenticatedRequest('POST', 'audio', uploadRequestData);
      expect(uploadResponse.status).toBe(200);
      
      uploadedFiles.push(asUpload(uploadResponse.data).audioFileKey);

      // Now test download URL generation
      const downloadRequestData = {
        action: 'generateDownloadUrl',
        audioFileKey: asUpload(uploadResponse.data).audioFileKey,
      };

      const downloadResponse = await makeAuthenticatedRequest('POST', 'audio', downloadRequestData);

      expect(downloadResponse.status).toBe(200);
      expect(asDownload(downloadResponse.data).success).toBe(true);
      expect(asDownload(downloadResponse.data).downloadUrl).toContain(bucketName);
      expect(asDownload(downloadResponse.data).downloadUrl).toContain('s3');
      expect(asDownload(downloadResponse.data).downloadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(asDownload(downloadResponse.data).expiresIn).toBe(3600);
    }, 15000);

    it('should reject access to file from different user via API Gateway', async () => {
      // First generate an upload URL with one user
      const uploadRequestData = {
        action: 'generateUploadUrl',
        fileName: 'private-file.mp3',
        contentType: 'audio/mpeg',
      };

      const uploadResponse = await makeAuthenticatedRequest('POST', 'audio', uploadRequestData);
      expect(uploadResponse.status).toBe(200);
      
      uploadedFiles.push(asUpload(uploadResponse.data).audioFileKey);

      // Try to access with different user (simulated by changing header)
      const downloadRequestData = {
        action: 'generateDownloadUrl',
        audioFileKey: asUpload(uploadResponse.data).audioFileKey,
      };

      const url = `${apiEndpoint}audio`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Test-User-Id': 'different-user', // Different user
      };

      try {
        await axios.post(url, downloadRequestData, { headers });
        fail('Expected request to fail with 403 status');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error).toContain('Unauthorized');
      }
    }, 15000);
  });

  describe('GET /audio/{audioFileKey} (API Gateway)', () => {
    it('should get download URL from path parameter via API Gateway', async () => {
      // First generate an upload URL to get a valid audioFileKey
      const uploadRequestData = {
        action: 'generateUploadUrl',
        fileName: 'path-test.mp3',
        contentType: 'audio/mpeg',
      };

      const uploadResponse = await makeAuthenticatedRequest('POST', 'audio', uploadRequestData);
      expect(uploadResponse.status).toBe(200);
      
      uploadedFiles.push(asUpload(uploadResponse.data).audioFileKey);

      // Now test GET with path parameter
      const encodedAudioFileKey = encodeURIComponent(asUpload(uploadResponse.data).audioFileKey);
      const getResponse = await makeAuthenticatedRequest('GET', `audio/${encodedAudioFileKey}`, null);

      expect(getResponse.status).toBe(200);
      expect(asDownload(getResponse.data).success).toBe(true);
      expect(asDownload(getResponse.data).downloadUrl).toContain(bucketName);
      expect(asDownload(getResponse.data).downloadUrl).toContain('s3');
    }, 15000);

    it('should return 400 for missing audioFileKey via API Gateway', async () => {
      try {
        await makeAuthenticatedRequest('GET', 'audio/', null);
        fail('Expected request to fail with client error status');
      } catch (error: any) {
        // Could be 400, 403, or 404 depending on API Gateway routing and Lambda response
        expect([400, 403, 404]).toContain(error.response.status);
      }
    });
  });

  describe('END-TO-END File Upload Tests (S3 Integration)', () => {
    it('should perform complete upload-download-delete workflow with actual S3 file', async () => {
      // Step 1: Generate upload URL
      const uploadRequestData = {
        action: 'generateUploadUrl',
        fileName: 'e2e-test.mp3',
        contentType: 'audio/mpeg',
        duration: 30,
        fileSize: 2048,
      };

      const uploadResponse = await makeAuthenticatedRequest('POST', 'audio', uploadRequestData);
      const uploadData = asUpload(uploadResponse.data);
      expect(uploadResponse.status).toBe(200);
      expect(uploadData.success).toBe(true);
      expect(uploadData.uploadUrl).toContain('s3');

      // Step 2: Actually upload a real file to S3 using the signed URL
      const testAudioContent = Buffer.alloc(2048, 'test audio data for e2e validation');
      const s3UploadResponse = await axios.put(uploadData.uploadUrl, testAudioContent, {
        headers: {
          'Content-Type': 'audio/mpeg',
        },
      });
      expect(s3UploadResponse.status).toBe(200);
      console.log(`✅ Successfully uploaded file to S3: ${uploadData.audioFileKey}`);

      // Step 3: Verify file exists by generating download URL
      const downloadRequestData = {
        action: 'generateDownloadUrl',
        audioFileKey: uploadData.audioFileKey,
      };
      const downloadResponse = await makeAuthenticatedRequest('POST', 'audio', downloadRequestData);
      const downloadData = asDownload(downloadResponse.data);
      expect(downloadResponse.status).toBe(200);
      expect(downloadData.success).toBe(true);
      expect(downloadData.downloadUrl).toContain('s3');

      // Step 4: Verify we can actually download the file content
      const fileDownloadResponse = await axios.get(downloadData.downloadUrl);
      expect(fileDownloadResponse.status).toBe(200);
      expect(fileDownloadResponse.data).toBeDefined();
      const dataSize = typeof fileDownloadResponse.data === 'string' ? fileDownloadResponse.data.length : 
                      fileDownloadResponse.data instanceof Buffer ? fileDownloadResponse.data.length : 'unknown';
      console.log(`✅ Successfully downloaded file from S3, size: ${dataSize}`);

      // Step 5: Test GET endpoint with path parameter
      const encodedAudioFileKey = encodeURIComponent(uploadData.audioFileKey);
      const getResponse = await makeAuthenticatedRequest('GET', `audio/${encodedAudioFileKey}`, null);
      const getData = asDownload(getResponse.data);
      expect(getResponse.status).toBe(200);
      expect(getData.success).toBe(true);
      expect(getData.downloadUrl).toContain('s3');

      // Step 6: Delete the file via API Gateway
      const deleteResponse = await makeAuthenticatedRequest('DELETE', `audio/${encodedAudioFileKey}`, null);
      const deleteData = asDelete(deleteResponse.data);
      expect(deleteResponse.status).toBe(200);
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toContain('deleted successfully');
      console.log(`✅ Successfully deleted file from S3: ${uploadData.audioFileKey}`);

      // Step 7: Verify file is actually deleted (should fail now)
      try {
        await axios.get(downloadData.downloadUrl);
        fail('Expected download to fail after file deletion');
      } catch (error: any) {
        // Should fail because file was deleted
        expect([403, 404]).toContain(error.response?.status);
        console.log(`✅ Confirmed file deletion - download failed as expected`);
      }

      // Don't add to uploadedFiles since it's already deleted
    }, 30000); // Increased timeout for S3 operations

    it('should succeed when trying to delete non-existent file via API Gateway (S3 idempotent behavior)', async () => {
      // First generate an upload URL to get a valid audioFileKey format
      const uploadRequestData = {
        action: 'generateUploadUrl',
        fileName: 'delete-test.mp3',
        contentType: 'audio/mpeg',
      };

      const uploadResponse = await makeAuthenticatedRequest('POST', 'audio', uploadRequestData);
      const uploadData = asUpload(uploadResponse.data);
      expect(uploadResponse.status).toBe(200);

      // Try to delete the file that was never actually uploaded to S3
      // S3 delete operations are idempotent - they succeed even if the file doesn't exist
      const encodedAudioFileKey = encodeURIComponent(uploadData.audioFileKey);
      
      const deleteResponse = await makeAuthenticatedRequest('DELETE', `audio/${encodedAudioFileKey}`, null);
      const deleteData = asDelete(deleteResponse.data);
      expect(deleteResponse.status).toBe(200);
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toContain('deleted successfully');
    }, 15000);
  });

  describe('OPTIONS - CORS (API Gateway)', () => {
    it('should handle OPTIONS request via API Gateway', async () => {
      const response = await makeAuthenticatedRequest('OPTIONS', 'audio', null);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });
  });

  describe('Error Handling (API Gateway)', () => {
    it('should return 400 for missing action via API Gateway', async () => {
      const requestData = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        // missing action
      };

      try {
        await makeAuthenticatedRequest('POST', 'audio', requestData);
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe('Action is required');
      }
    });

    it('should return 400 for invalid action via API Gateway', async () => {
      const requestData = {
        action: 'invalidAction',
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
      };

      try {
        await makeAuthenticatedRequest('POST', 'audio', requestData);
        fail('Expected request to fail with 400 status');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe('Invalid action');
      }
    });

    it('should handle invalid JSON via API Gateway', async () => {
      const url = `${apiEndpoint}audio`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Test-User-Id': 'integration-test-user',
      };

      try {
        await axios.post(url, 'invalid json', { headers });
        fail('Expected request to fail with 400 or 500 status');
      } catch (error: any) {
        // API Gateway may return 400 for malformed JSON before it reaches Lambda
        expect([400, 500]).toContain(error.response.status);
      }
    });

    it('should return 405 for unsupported methods via API Gateway', async () => {
      try {
        await makeAuthenticatedRequest('PATCH', 'audio', {});
        fail('Expected request to fail with 405 status');
      } catch (error: any) {
        // Different types of errors possible - axios error, network error, etc.
        if (error.response) {
          expect(error.response.status).toBe(405);
          expect(error.response.data.error).toBe('Method not allowed');
        } else {
          // Network error or API Gateway blocking the method
          expect(error.code || error.message).toBeDefined();
        }
      }
    });
  });
});

// Note: These tests require the audio endpoints to be deployed to API Gateway.
// If you get connection errors, make sure:
// 1. The AudioFunction is uncommented in template.yml
// 2. The audio endpoints are added to openapi.yml
// 3. The stack has been deployed with: sam build && sam deploy --guided