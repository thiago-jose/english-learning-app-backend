import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBWordRepository } from '../../../../infrastructure/repositories/DynamoDBWordRepository';
import { CreateWordUseCase } from '../../../../application/use-cases/CreateWordUseCase';
import { GetUserWordsUseCase } from '../../../../application/use-cases/GetUserWordsUseCase';
import { ReviewWordUseCase } from '../../../../application/use-cases/ReviewWordUseCase';
import { ProcessSpeechUseCase } from '../../../../application/use-cases/ProcessSpeechUseCase';
import { BedrockService } from '../../../../infrastructure/services/BedrockService';

const wordRepository = new DynamoDBWordRepository(process.env.WORDS_TABLE_NAME || 'Words');
const createWordUseCase = new CreateWordUseCase(wordRepository);
const getUserWordsUseCase = new GetUserWordsUseCase(wordRepository);
const reviewWordUseCase = new ReviewWordUseCase(wordRepository);
const bedrockService = new BedrockService();
const processSpeechUseCase = new ProcessSpeechUseCase(bedrockService, createWordUseCase);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';

    switch (event.httpMethod) {
      case 'POST':
        return await handleCreateWord(event, userId);
      case 'GET':
        return await handleGetWords(event, userId);
      case 'PUT':
        return await handleReviewWord(event, userId);
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
  } catch (error) {
    console.error('Error in word handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function handleCreateWord(event: any, userId: string) {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const body = JSON.parse(event.body);

  // Check if this is a speech processing request
  if (body.transcribedText) {
    const result = await processSpeechUseCase.execute({
      transcribedText: body.transcribedText,
      userId,
    });

    return {
      statusCode: result.success ? 201 : 400,
      headers,
      body: JSON.stringify(result),
    };
  }

  // Regular word creation
  const { word, meaning, usageExample, pronunciation, difficulty, category } = body;

  if (!word || !meaning || !usageExample) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Word, meaning, and usageExample are required' }),
    };
  }

  const newWord = await createWordUseCase.execute({
    word,
    meaning,
    usageExample,
    pronunciation,
    difficulty,
    category,
    userId,
  });

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(newWord),
  };
}

async function handleGetWords(event: any, userId: string) {
  const queryParams = event.queryStringParameters || {};
  const forReview = queryParams.forReview === 'true';

  const words = await getUserWordsUseCase.execute({
    userId,
    forReview,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(words),
  };
}

async function handleReviewWord(event: any, userId: string) {
  const wordId = event.pathParameters?.id;

  if (!wordId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Word ID is required' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const { isCorrect } = JSON.parse(event.body);

  if (typeof isCorrect !== 'boolean') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'isCorrect must be a boolean' }),
    };
  }

  const updatedWord = await reviewWordUseCase.execute({
    wordId,
    isCorrect,
    userId,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(updatedWord),
  };
}
