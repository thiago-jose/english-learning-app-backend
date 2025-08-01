import { BedrockService } from '../../BedrockService';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { WordDifficulty } from '../../../../domain/entities/Word';

jest.mock('@aws-sdk/client-bedrock-runtime');

describe('BedrockService', () => {
  let bedrockService: BedrockService;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();

    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    bedrockService = new BedrockService();
  });

  describe('analyzeWord', () => {
    it('should analyze a word successfully', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  word: 'beautiful',
                  meaning: 'pleasing to the senses',
                  usageExample: 'The sunset was beautiful.',
                  pronunciation: '/ˈbjuːtɪfʊl/',
                  difficulty: 'INTERMEDIATE',
                  category: 'adjective',
                }),
              },
            ],
          })
        ),
      };

      mockSend.mockResolvedValue(mockResponse);

      const result = await bedrockService.analyzeWord('beautiful');

      expect(result).toEqual({
        word: 'beautiful',
        meaning: 'pleasing to the senses',
        usageExample: 'The sunset was beautiful.',
        pronunciation: '/ˈbjuːtɪfʊl/',
        difficulty: WordDifficulty.INTERMEDIATE,
        category: 'adjective',
      });

      expect(mockSend).toHaveBeenCalledWith(expect.any(InvokeModelCommand));
    });

    it('should return fallback response when Bedrock fails', async () => {
      mockSend.mockRejectedValue(new Error('Bedrock error'));

      const result = await bedrockService.analyzeWord('test');

      expect(result).toEqual({
        word: 'test',
        meaning: 'Definition to be added',
        usageExample: 'I need to learn more about the word test.',
        difficulty: WordDifficulty.INTERMEDIATE,
        category: 'other',
      });
    });

    it('should handle invalid JSON response from Bedrock', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: 'invalid json response',
              },
            ],
          })
        ),
      };

      mockSend.mockResolvedValue(mockResponse);

      const result = await bedrockService.analyzeWord('test');

      expect(result).toEqual({
        word: 'test',
        meaning: 'Definition to be added',
        usageExample: 'I need to learn more about the word test.',
        difficulty: WordDifficulty.INTERMEDIATE,
        category: 'other',
      });
    });

    it('should map difficulty levels correctly', async () => {
      const testCases = [
        { input: 'BEGINNER', expected: WordDifficulty.BEGINNER },
        { input: 'INTERMEDIATE', expected: WordDifficulty.INTERMEDIATE },
        { input: 'ADVANCED', expected: WordDifficulty.ADVANCED },
        { input: 'INVALID', expected: WordDifficulty.INTERMEDIATE },
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          body: new TextEncoder().encode(
            JSON.stringify({
              content: [
                {
                  text: JSON.stringify({
                    word: 'test',
                    meaning: 'test meaning',
                    usageExample: 'test example',
                    difficulty: testCase.input,
                    category: 'noun',
                  }),
                },
              ],
            })
          ),
        };

        mockSend.mockResolvedValue(mockResponse);

        const result = await bedrockService.analyzeWord('test');
        expect(result.difficulty).toBe(testCase.expected);
      }
    });
  });

  describe('processSpeechForWordExtraction', () => {
    it('should extract word from valid speech patterns', async () => {
      const testCases = [
        'save word beautiful',
        'save this word: happiness',
        'Save word EXAMPLE',
        'SAVE WORD test',
        'save this word beautiful',
      ];

      for (const input of testCases) {
        const result = await bedrockService.processSpeechForWordExtraction(input);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      }
    });

    it('should return null for invalid speech patterns', async () => {
      const testCases = ['hello world', 'this is a test', 'word beautiful', 'save beautiful', ''];

      for (const input of testCases) {
        const result = await bedrockService.processSpeechForWordExtraction(input);
        expect(result).toBeNull();
      }
    });

    it('should extract and normalize the word correctly', async () => {
      const result = await bedrockService.processSpeechForWordExtraction('save word BEAUTIFUL');
      expect(result).toBe('beautiful');
    });

    it('should handle extra whitespace', async () => {
      const result = await bedrockService.processSpeechForWordExtraction(
        'save word   beautiful   '
      );
      expect(result).toBe('beautiful');
    });
  });
});
