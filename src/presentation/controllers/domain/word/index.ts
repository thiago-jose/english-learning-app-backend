import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBWordRepository } from '../../../../infrastructure/repositories/DynamoDBWordRepository';
import { WordService } from '../../../../application/services/WordService';
import { getAuthenticatedUser } from '../../../utils/auth';
import { WordDifficulty } from '../../../../domain/entities/Word';

const wordRepository = new DynamoDBWordRepository(process.env.WORDS_TABLE_NAME || 'Words');
const wordService = new WordService(wordRepository);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Route based on path and method for user-scoped endpoints
    const path = event.path;
    const method = event.httpMethod;
    const pathParams = event.pathParameters || {};

    // Extract authenticated user
    const authenticatedUser = getAuthenticatedUser(event);
    const userId = authenticatedUser.userId;

    // User words endpoints: /users/{userId}/words
    if (path.match(/^\/users\/[^\/]+\/words$/) && method === 'GET') {
      return await handleGetUserWords(event, pathParams.userId!, userId);
    } else if (path.match(/^\/users\/[^\/]+\/words$/) && method === 'POST') {
      return await handleCreateWord(event, pathParams.userId!, userId);
    }

    // Individual word endpoints: /users/{userId}/words/{wordId}
    if (path.match(/^\/users\/[^\/]+\/words\/[^\/]+$/) && method === 'GET') {
      return await handleGetWord(event, pathParams.userId!, pathParams.wordId!, userId);
    } else if (path.match(/^\/users\/[^\/]+\/words\/[^\/]+$/) && method === 'PUT') {
      return await handleUpdateWord(event, pathParams.userId!, pathParams.wordId!, userId);
    } else if (path.match(/^\/users\/[^\/]+\/words\/[^\/]+$/) && method === 'DELETE') {
      return await handleDeleteWord(event, pathParams.userId!, pathParams.wordId!, userId);
    }

    // Word review endpoint: /users/{userId}/words/{wordId}/review
    if (path.match(/^\/users\/[^\/]+\/words\/[^\/]+\/review$/) && method === 'POST') {
      return await handleReviewWord(event, pathParams.userId!, pathParams.wordId!, userId);
    }

    // Review words endpoint: /users/{userId}/words/review
    if (path.match(/^\/users\/[^\/]+\/words\/review$/) && method === 'GET') {
      return await handleGetWordsForReview(event, pathParams.userId!, userId);
    }

    // Route not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint not found' }),
    };
  } catch (error) {
    console.error('Error in word handler:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: error.message }),
        };
      }
      if (error.message.includes('Access denied')) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: error.message }),
        };
      }
      if (error.message.includes('required') || error.message.includes('Invalid')) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: error.message }),
        };
      }
      if (error.message.includes('Authentication')) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' }),
        };
      }
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

async function handleCreateWord(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const body = JSON.parse(event.body);
  const { word, meaning, usageExample, pronunciation, difficulty, category } = body;

  const response = await wordService.createWord({
    word,
    meaning,
    usageExample,
    pronunciation,
    difficulty,
    category,
    userId: authenticatedUserId,
  });

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(response),
  };
}

async function handleGetUserWords(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  const queryParams = event.queryStringParameters || {};
  const limit = queryParams.limit ? parseInt(queryParams.limit) : undefined;
  const offset = queryParams.offset ? parseInt(queryParams.offset) : undefined;

  const response = await wordService.getUserWords({
    userId: authenticatedUserId,
    limit,
    offset,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}

async function handleGetWord(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  wordId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  const response = await wordService.getWord({
    wordId,
    userId: authenticatedUserId,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}

async function handleUpdateWord(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  wordId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const body = JSON.parse(event.body);

  const response = await wordService.updateWord({
    wordId,
    userId: authenticatedUserId,
    data: body,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}

async function handleDeleteWord(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  wordId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  const response = await wordService.deleteWord({
    wordId,
    userId: authenticatedUserId,
  });

  return {
    statusCode: 204,
    headers,
    body: '',
  };
}

async function handleReviewWord(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  wordId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
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

  const response = await wordService.reviewWord({
    wordId,
    isCorrect,
    userId: authenticatedUserId,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}

async function handleGetWordsForReview(
  event: APIGatewayProxyEvent,
  requestedUserId: string,
  authenticatedUserId: string
): Promise<APIGatewayProxyResult> {
  // Validate path parameter matches authenticated user
  if (authenticatedUserId !== requestedUserId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied. You can only access your own words.' }),
    };
  }

  const queryParams = event.queryStringParameters || {};
  const limit = queryParams.limit ? parseInt(queryParams.limit) : undefined;
  const offset = queryParams.offset ? parseInt(queryParams.offset) : undefined;
  const reviewDate = queryParams.date ? new Date(queryParams.date) : undefined;

  const response = await wordService.getWordsForReview({
    userId: authenticatedUserId,
    reviewDate,
    limit,
    offset,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}
