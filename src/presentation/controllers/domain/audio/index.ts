import { APIGatewayProxyHandler } from 'aws-lambda';
import { AudioStorageService } from '../../../../infrastructure/services/AudioStorageService';
import { UploadAudioUseCase } from '../../../../application/use-cases/UploadAudioUseCase';

const audioStorageService = new AudioStorageService(
  process.env.STORAGE_BUCKET_NAME || 'english-learning-app-storage',
  process.env.AWS_REGION || 'us-east-1'
);
const uploadAudioUseCase = new UploadAudioUseCase(audioStorageService);

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
    // Extract user ID from JWT claims (production) or test headers (integration tests)
    const userId = event.requestContext?.authorizer?.claims?.sub || 
                   event.headers?.['X-Test-User-Id'] || 
                   event.headers?.['x-test-user-id'] || 
                   'anonymous';

    switch (event.httpMethod) {
      case 'POST':
        return await handleAudioRequest(event, userId);
      case 'GET':
        return await handleGetAudioUrl(event, userId);
      case 'DELETE':
        return await handleDeleteAudio(event, userId);
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
  } catch (error) {
    console.error('Error in audio handler:', error);
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

async function handleAudioRequest(event: any, userId: string): Promise<any> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const body = JSON.parse(event.body);
  const { action } = body;

  if (!action) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Action is required' }),
    };
  }

  switch (action) {
    case 'generateUploadUrl':
      return await handleGenerateUploadUrl(body, userId);
    case 'generateDownloadUrl':
      return await handleGenerateDownloadUrl(body, userId);
    case 'getMetadata':
      return await handleGetMetadata(body, userId);
    default:
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action' }),
      };
  }
}

async function handleGenerateUploadUrl(body: any, userId: string): Promise<any> {
  const { fileName, contentType, duration, fileSize } = body;

  if (!fileName || !contentType) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'fileName and contentType are required' }),
    };
  }

  try {
    const result = await uploadAudioUseCase.generateUploadUrl({
      fileName,
      contentType,
      userId,
      duration,
      fileSize,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate upload URL',
      }),
    };
  }
}

async function handleGenerateDownloadUrl(body: any, userId: string): Promise<any> {
  const { audioFileKey } = body;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'audioFileKey is required' }),
    };
  }

  try {
    const result = await audioStorageService.generateDownloadUrl({
      audioFileKey,
      userId,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate download URL',
      }),
    };
  }
}

async function handleGetMetadata(body: any, userId: string): Promise<any> {
  const { audioFileKey } = body;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'audioFileKey is required' }),
    };
  }

  try {
    const metadata = await audioStorageService.getAudioFileMetadata(audioFileKey, userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        metadata,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get metadata',
      }),
    };
  }
}

async function handleGetAudioUrl(event: any, userId: string): Promise<any> {
  const audioFileKey = event.pathParameters?.audioFileKey;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Audio file key is required' }),
    };
  }

  try {
    const result = await audioStorageService.generateDownloadUrl({
      audioFileKey: decodeURIComponent(audioFileKey),
      userId,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate download URL',
      }),
    };
  }
}

async function handleDeleteAudio(event: any, userId: string): Promise<any> {
  const audioFileKey = event.pathParameters?.audioFileKey;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Audio file key is required' }),
    };
  }

  try {
    await audioStorageService.deleteAudioFile(decodeURIComponent(audioFileKey), userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Audio file deleted successfully',
      }),
    };
  } catch (error) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to delete audio file',
      }),
    };
  }
}