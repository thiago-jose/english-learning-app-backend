import { BedrockService } from '../../infrastructure/services/BedrockService';
import { CreateWordUseCase } from './CreateWordUseCase';
import { Word } from '../../domain/entities/Word';

export interface ProcessSpeechRequest {
  transcribedText: string;
  userId: string;
}

export interface ProcessSpeechResponse {
  success: boolean;
  word?: Word;
  error?: string;
  transcribedText: string;
}

export class ProcessSpeechUseCase {
  constructor(
    private bedrockService: BedrockService,
    private createWordUseCase: CreateWordUseCase
  ) {}

  async execute(request: ProcessSpeechRequest): Promise<ProcessSpeechResponse> {
    try {
      const { transcribedText, userId } = request;

      // Extract word from transcribed text
      const extractedWord =
        await this.bedrockService.processSpeechForWordExtraction(transcribedText);

      if (!extractedWord) {
        return {
          success: false,
          error: 'Could not parse word from transcribed text. Try saying "save word [your word]"',
          transcribedText,
        };
      }

      // Get word information using Bedrock
      const wordAnalysis = await this.bedrockService.analyzeWord(extractedWord);

      // Create the word using the CreateWordUseCase
      const savedWord = await this.createWordUseCase.execute({
        word: wordAnalysis.word,
        meaning: wordAnalysis.meaning,
        usageExample: wordAnalysis.usageExample,
        pronunciation: wordAnalysis.pronunciation,
        difficulty: wordAnalysis.difficulty,
        category: wordAnalysis.category,
        userId,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      return {
        success: true,
        word: savedWord,
        transcribedText,
      };
    } catch (error) {
      console.error('Error processing speech:', error);
      return {
        success: false,
        error: 'Failed to process speech',
        transcribedText: request.transcribedText,
      };
    }
  }
}
