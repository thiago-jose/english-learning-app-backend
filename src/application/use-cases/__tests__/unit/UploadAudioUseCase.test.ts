import { UploadAudioUseCase } from '../../UploadAudioUseCase';
import { AudioStorageService } from '../../../../infrastructure/services/AudioStorageService';

describe('UploadAudioUseCase', () => {
  let uploadAudioUseCase: UploadAudioUseCase;
  let mockAudioStorageService: jest.Mocked<AudioStorageService>;

  beforeEach(() => {
    mockAudioStorageService = {
      generateUploadUrl: jest.fn(),
      generateDownloadUrl: jest.fn(),
      uploadAudioBuffer: jest.fn(),
      deleteAudioFile: jest.fn(),
      getAudioFileMetadata: jest.fn(),
      getSupportedContentTypes: jest.fn(),
      getMaxFileSizeBytes: jest.fn(),
      getMaxDurationSeconds: jest.fn(),
    } as any;

    uploadAudioUseCase = new UploadAudioUseCase(mockAudioStorageService);
  });

  describe('generateUploadUrl', () => {
    beforeEach(() => {
      mockAudioStorageService.getSupportedContentTypes.mockReturnValue([
        'audio/mpeg',
        'audio/wav',
        'audio/m4a',
      ]);
      mockAudioStorageService.getMaxFileSizeBytes.mockReturnValue(100 * 1024 * 1024); // 100MB
      mockAudioStorageService.getMaxDurationSeconds.mockReturnValue(600); // 10 minutes
    });

    it('should generate upload URL successfully', async () => {
      const mockResponse = {
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        uploadUrl: 'https://s3.amazonaws.com/presigned-url',
        expiresIn: 3600,
      };

      mockAudioStorageService.generateUploadUrl.mockResolvedValue(mockResponse);

      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        duration: 120,
        fileSize: 5 * 1024 * 1024, // 5MB
      };

      const result = await uploadAudioUseCase.generateUploadUrl(request);

      expect(result).toEqual({
        ...mockResponse,
        maxFileSize: 100 * 1024 * 1024,
        maxDuration: 600,
        supportedFormats: ['audio/mpeg', 'audio/wav', 'audio/m4a'],
      });

      expect(mockAudioStorageService.generateUploadUrl).toHaveBeenCalledWith({
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        duration: 120,
      });
    });

    it('should reject unsupported content types', async () => {
      const request = {
        fileName: 'test-audio.xyz',
        contentType: 'audio/unsupported',
        userId: 'user123',
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'Unsupported audio format. Supported formats: audio/mpeg, audio/wav, audio/m4a'
      );
    });

    it('should reject files that are too large', async () => {
      const request = {
        fileName: 'large-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        fileSize: 200 * 1024 * 1024, // 200MB (exceeds 100MB limit)
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'File size exceeds maximum allowed size of 100MB'
      );
    });

    it('should reject audio that is too long', async () => {
      const request = {
        fileName: 'long-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        duration: 900, // 15 minutes (exceeds 10 minute limit)
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'Audio duration exceeds maximum allowed duration of 600 seconds'
      );
    });

    it('should reject empty file names', async () => {
      const request = {
        fileName: '',
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'File name is required'
      );
    });

    it('should reject file names that are too long', async () => {
      const longFileName = 'a'.repeat(256) + '.mp3';
      const request = {
        fileName: longFileName,
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'File name is too long (max 255 characters)'
      );
    });

    it('should handle whitespace-only file names', async () => {
      const request = {
        fileName: '   ',
        contentType: 'audio/mpeg',
        userId: 'user123',
      };

      await expect(uploadAudioUseCase.generateUploadUrl(request)).rejects.toThrow(
        'File name is required'
      );
    });

    it('should work without optional parameters', async () => {
      const mockResponse = {
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        uploadUrl: 'https://s3.amazonaws.com/presigned-url',
        expiresIn: 3600,
      };

      mockAudioStorageService.generateUploadUrl.mockResolvedValue(mockResponse);

      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'audio/mpeg',
        userId: 'user123',
        // No duration or fileSize provided
      };

      const result = await uploadAudioUseCase.generateUploadUrl(request);

      expect(result).toEqual({
        ...mockResponse,
        maxFileSize: 100 * 1024 * 1024,
        maxDuration: 600,
        supportedFormats: ['audio/mpeg', 'audio/wav', 'audio/m4a'],
      });
    });

    it('should handle case-insensitive content types', async () => {
      mockAudioStorageService.getSupportedContentTypes.mockReturnValue([
        'audio/mpeg',
        'audio/wav',
      ]);

      const mockResponse = {
        audioFileKey: 'audio-files/user123/test-audio.mp3',
        uploadUrl: 'https://s3.amazonaws.com/presigned-url',
        expiresIn: 3600,
      };

      mockAudioStorageService.generateUploadUrl.mockResolvedValue(mockResponse);

      const request = {
        fileName: 'test-audio.mp3',
        contentType: 'AUDIO/MPEG', // Uppercase
        userId: 'user123',
      };

      // Should not throw error for case mismatch
      await expect(uploadAudioUseCase.generateUploadUrl(request)).resolves.toBeDefined();
    });
  });
});