import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { WordDifficulty } from '../../domain/entities/Word';

export interface WordAnalysisResult {
  word: string;
  meaning: string;
  usageExample: string;
  pronunciation?: string;
  difficulty: WordDifficulty;
  category: string;
}

export class BedrockService {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(
    region: string = 'us-east-1',
    modelId: string = 'anthropic.claude-3-haiku-20240307-v1:0'
  ) {
    this.client = new BedrockRuntimeClient({ region });
    this.modelId = modelId;
  }

  async analyzeWord(word: string): Promise<WordAnalysisResult> {
    const prompt = `Please provide information about the English word "${word}" in the following JSON format:
{
  "word": "${word}",
  "meaning": "clear definition in English",
  "usageExample": "a practical sentence using the word",
  "pronunciation": "phonetic pronunciation if available",
  "difficulty": "BEGINNER|INTERMEDIATE|ADVANCED",
  "category": "noun|verb|adjective|adverb|other"
}

Guidelines:
- Provide a clear, concise definition suitable for English learners
- Create a natural example sentence that shows proper usage
- Classify difficulty based on common usage and complexity
- Use standard word categories

Provide only the JSON response without any additional text.`;

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const content = responseBody.content[0].text;

      // Parse the JSON response from Claude
      const wordData = JSON.parse(content);

      return {
        word: wordData.word || word,
        meaning: wordData.meaning || 'Definition not available',
        usageExample: wordData.usageExample || `Example with ${word} not available`,
        pronunciation: wordData.pronunciation || undefined,
        difficulty: this.mapDifficulty(wordData.difficulty) || WordDifficulty.INTERMEDIATE,
        category: wordData.category || 'other',
      };
    } catch (error) {
      console.error('Error calling Bedrock:', error);
      // Fallback response
      return {
        word,
        meaning: 'Definition to be added',
        usageExample: `I need to learn more about the word ${word}.`,
        difficulty: WordDifficulty.INTERMEDIATE,
        category: 'other',
      };
    }
  }

  async processSpeechForWordExtraction(transcribedText: string): Promise<string | null> {
    // Parse the transcribed text to extract the word
    const wordMatch = transcribedText.match(/save (?:this )?word:?\s*(.+)/i);
    if (!wordMatch) {
      return null;
    }

    return wordMatch[1].trim().toLowerCase();
  }

  private mapDifficulty(difficulty: string): WordDifficulty {
    switch (difficulty?.toUpperCase()) {
      case 'BEGINNER':
        return WordDifficulty.BEGINNER;
      case 'INTERMEDIATE':
        return WordDifficulty.INTERMEDIATE;
      case 'ADVANCED':
        return WordDifficulty.ADVANCED;
      default:
        return WordDifficulty.INTERMEDIATE;
    }
  }
}
