import { APIGatewayProxyHandler } from 'aws-lambda';
import { AudioStorageService } from '../../../../infrastructure/services/AudioStorageService';
import { UploadAudioUseCase } from '../../../../application/use-cases/UploadAudioUseCase';
import { getAuthenticatedUser, getUserIdWithFallback } from '../../../utils/auth';
import { operations } from '../../../../types/api';

// Type definitions from OpenAPI schema
type GenerateUploadUrlRequest =
  operations['generateUploadUrl']['requestBody']['content']['application/json'];
type GenerateUploadUrlResponse =
  operations['generateUploadUrl']['responses']['200']['content']['application/json'];
type GenerateDownloadUrlRequest =
  operations['generateDownloadUrl']['requestBody']['content']['application/json'];
type GenerateDownloadUrlResponse =
  operations['generateDownloadUrl']['responses']['200']['content']['application/json'];
type GetMetadataRequest =
  operations['getAudioMetadata']['requestBody']['content']['application/json'];
type MetadataResponse =
  operations['getAudioMetadata']['responses']['200']['content']['application/json'];
type GetAudioFileUrlResponse =
  operations['getAudioFileUrl']['responses']['200']['content']['application/json'];
type DeleteAudioFileResponse =
  operations['deleteAudioFile']['responses']['200']['content']['application/json'];

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
    // Extract authenticated user information from Cognito JWT claims
    // Falls back to test headers for integration tests during transition
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(
        `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
      );
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction:', userId);
    }

    // Route based on path and method instead of action parameter
    const path = event.path;
    const method = event.httpMethod;

    if (path === '/audio/upload' && method === 'POST') {
      return await handleGenerateUploadUrl(event, userId);
    } else if (path === '/audio/download' && method === 'POST') {
      return await handleGenerateDownloadUrl(event, userId);
    } else if (path === '/audio/metadata' && method === 'POST') {
      return await handleGetMetadata(event, userId);
    } else if (path.startsWith('/audio/files/') && method === 'GET') {
      return await handleGetAudioUrl(event, userId);
    } else if (path.startsWith('/audio/files/') && method === 'DELETE') {
      return await handleDeleteAudio(event, userId);
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Endpoint not found' }),
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

async function handleGenerateUploadUrl(event: any, userId: string): Promise<any> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const requestBody: GenerateUploadUrlRequest = JSON.parse(event.body);
  const { fileName, contentType, duration, fileSize } = requestBody;

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

    const response: GenerateUploadUrlResponse = {
      success: true,
      ...result,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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

async function handleGenerateDownloadUrl(event: any, userId: string): Promise<any> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const requestBody: GenerateDownloadUrlRequest = JSON.parse(event.body);
  const { audioFileKey } = requestBody;

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

    const response: GenerateDownloadUrlResponse = {
      success: true,
      ...result,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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

async function handleGetMetadata(event: any, userId: string): Promise<any> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const requestBody: GetMetadataRequest = JSON.parse(event.body);
  const { audioFileKey } = requestBody;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'audioFileKey is required' }),
    };
  }

  try {
    const rawMetadata = await audioStorageService.getAudioFileMetadata(audioFileKey, userId);

    if (!rawMetadata) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Audio file metadata not found' }),
      };
    }

    // Transform the S3 metadata to match OpenAPI schema
    const metadata = {
      contentType: rawMetadata['content-type'] || 'application/octet-stream',
      size: parseInt(rawMetadata['content-length'] || '0', 10),
      lastModified: rawMetadata['last-modified'] || new Date().toISOString(),
      ...(rawMetadata['duration'] && { duration: parseFloat(rawMetadata['duration']) }),
    };

    const response: MetadataResponse = {
      success: true,
      metadata,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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
  // With direct routes, the path parameter is in 'audioFileKey'
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

    const response: GetAudioFileUrlResponse = {
      success: true,
      ...result,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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
  // With direct routes, the path parameter is in 'audioFileKey'
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

    const response: DeleteAudioFileResponse = {
      success: true,
      message: 'Audio file deleted successfully',
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
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
