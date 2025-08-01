import { AudioStorageService } from '../../AudioStorageService';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('AudioStorageService', () => {
  let audioStorageService: AudioStorageService;
  let mockS3Client: jest.Mocked<S3Client>;
  let mockGetSignedUrl: jest.MockedFunction<typeof getSignedUrl>;

  beforeEach(() => {
    mockS3Client = {
      send: jest.fn(),
    } as any;

    mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);

    audioStorageService = new AudioStorageService('test-bucket', 'us-east-1');
  });

  describe('generateUploadUrl', () => {
    it('should generate upload URL successfully', async () => {
      const mockSignedUrl = 'https://test-bucket.s3.amazonaws.com/presigned-url';
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        duration: 120,
      };

      const result = await audioStorageService.generateUploadUrl(request);

      expect(result).toEqual({
        audioFileKey: expect.stringMatching(/^audio-files\/user123\/\d+-test-audio\.mp3$/),
        uploadUrl: mockSignedUrl,
        expiresIn: 3600,
      });

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(PutObjectCommand),
        { expiresIn: 3600 }
      );
    });

    it('should handle different content types', async () => {
      const mockSignedUrl = 'https://test-bucket.s3.amazonaws.com/presigned-url';
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const testCases = [
        { contentType: 'audio/wav', expectedExtension: '.wav' },
        { contentType: 'audio/m4a', expectedExtension: '.m4a' },
        { contentType: 'audio/webm', expectedExtension: '.webm' },
        { contentType: 'unknown/type', expectedExtension: '.mp3' },
      ];

      for (const testCase of testCases) {
        const request = {
          fileName: 'test-audio',
          contentType: testCase.contentType,
          userId: 'user123',
        };

        const result = await audioStorageService.generateUploadUrl(request);

        expect(result.audioFileKey).toMatch(
          new RegExp(`audio-files/user123/\\d+-test-audio\\${testCase.expectedExtension.replace('.', '\\.')}$`)
        );
      }
    });

    it('should sanitize file names', async () => {
      const mockSignedUrl = 'https://test-bucket.s3.amazonaws.com/presigned-url';
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const request = {
        fileName: 'test audio with spaces & special chars!.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      const result = await audioStorageService.generateUploadUrl(request);

      expect(result.audioFileKey).toMatch(/audio-files\/user123\/\d+-test-audio-with-spaces---special-chars-\.mp3$/);
    });

    it('should handle S3 errors', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));

      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      await expect(audioStorageService.generateUploadUrl(request)).rejects.toThrow(
        'Failed to generate upload URL: S3 error'
      );
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate download URL for user file', async () => {
      const mockSignedUrl = 'https://test-bucket.s3.amazonaws.com/download-url';
      mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

      const request = {
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        userId: 'user123',
      };

      const result = await audioStorageService.generateDownloadUrl(request);

      expect(result).toEqual({
        downloadUrl: mockSignedUrl,
        expiresIn: 3600,
      });

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 }
      );
    });

    it('should reject unauthorized access to other users files', async () => {
      const request = {
        audioFileKey: 'audio-files/otheruser/test-audio.mp3',
        userId: 'user123',
      };

      await expect(audioStorageService.generateDownloadUrl(request)).rejects.toThrow(
        'Unauthorized: File does not belong to user'
      );
    });

    it('should handle S3 errors', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));

      const request = {
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        userId: 'user123',
      };

      await expect(audioStorageService.generateDownloadUrl(request)).rejects.toThrow(
        'Failed to generate download URL: S3 error'
      );
    });
  });

  describe('uploadAudioBuffer', () => {
    it('should upload audio buffer successfully', async () => {
      mockS3Client.send.mockResolvedValue({});

      const audioBuffer = Buffer.from('audio data');
      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        duration: 120,
      };

      const result = await audioStorageService.uploadAudioBuffer(audioBuffer, request);

      expect(result.audioFileKey).toMatch(/^audio-files\/user123\/\d+-test-audio\.mp3$/);
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should handle upload errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Upload failed'));

      const audioBuffer = Buffer.from('audio data');
      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      await expect(audioStorageService.uploadAudioBuffer(audioBuffer, request)).rejects.toThrow(
        'Failed to upload audio: Upload failed'
      );
    });
  });

  describe('deleteAudioFile', () => {
    it('should delete user file successfully', async () => {
      mockS3Client.send.mockResolvedValue({});

      await audioStorageService.deleteAudioFile('audio-files/user123/test-audio.mp3', 'user123');

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });

    it('should reject unauthorized deletion', async () => {
      await expect(
        audioStorageService.deleteAudioFile('audio-files/otheruser/test-audio.mp3', 'user123')
      ).rejects.toThrow('Unauthorized: File does not belong to user');
    });

    it('should handle deletion errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Delete failed'));

      await expect(
        audioStorageService.deleteAudioFile('audio-files/user123/test-audio.mp3', 'user123')
      ).rejects.toThrow('Failed to delete audio file: Delete failed');
    });
  });

  describe('getAudioFileMetadata', () => {
    it('should get metadata for user file', async () => {
      const mockMetadata = {
        userId: 'user123',
        originalFileName: 'test-audio.mp3',
        uploadedAt: '2023-01-01T00:00:00.000Z',
        duration: '120',
      };

      mockS3Client.send.mockResolvedValue({
        Metadata: mockMetadata,
      });

      const result = await audioStorageService.getAudioFileMetadata(
        'audio-files/user123/test-audio.mp3',
        'user123'
      );

      expect(result).toEqual(mockMetadata);
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    });

    it('should reject unauthorized access', async () => {
      await expect(
        audioStorageService.getAudioFileMetadata('audio-files/otheruser/test-audio.mp3', 'user123')
      ).rejects.toThrow('Unauthorized: File does not belong to user');
    });

    it('should return null for S3 errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 error'));

      const result = await audioStorageService.getAudioFileMetadata(
        'audio-files/user123/test-audio.mp3',
        'user123'
      );

      expect(result).toBeNull();
    });
  });

  describe('utility methods', () => {
    it('should return supported content types', () => {
      const supportedTypes = audioStorageService.getSupportedContentTypes();
      expect(supportedTypes).toContain('audio/mpeg');
      expect(supportedTypes).toContain('audio/wav');
      expect(supportedTypes).toContain('audio/m4a');
    });

    it('should return max file size', () => {
      const maxSize = audioStorageService.getMaxFileSizeBytes();
      expect(maxSize).toBe(100 * 1024 * 1024); // 100MB
    });

    it('should return max duration', () => {
      const maxDuration = audioStorageService.getMaxDurationSeconds();
      expect(maxDuration).toBe(600); // 10 minutes
    });
  });
});