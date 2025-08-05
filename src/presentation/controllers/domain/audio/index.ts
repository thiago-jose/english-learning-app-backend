import { APIGatewayProxyHandler } from 'aws-lambda';
import { AudioStorageService } from '../../../../infrastructure/services/AudioStorageService';
import { DynamoDBAudioRepository } from '../../../../infrastructure/repositories/DynamoDBAudioRepository';
import { AudioMapper } from '../../../../infrastructure/mappers/AudioMapper';
import { AudioService } from '../../../../application/services/AudioService';
import { getAuthenticatedUser } from '../../../utils/auth';

// Request/Response types for user-scoped endpoints
interface CreateAudioRequest {
  fileName: string;
  contentType: string;
  fileSize?: number;
  duration?: number;
}

interface CreateAudioResponse {
  success: boolean;
  audioId: string;
  uploadUrl: string;
  expiresIn: number;
}

interface ListAudioResponse {
  success: boolean;
  audioFiles: Array<{
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  }>;
  lastEvaluatedKey?: string;
  totalCount: number;
}

interface GetAudioResponse {
  success: boolean;
  audio: {
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    duration?: number;
    status: string;
    uploadedAt: string;
    processedAt?: string;
    transcriptionId?: string;
    processingError?: string;
  };
  downloadUrl: string;
  expiresIn: number;
}

interface DeleteAudioResponse {
  success: boolean;
  message: string;
}

interface ProcessAudioResponse {
  success: boolean;
  message: string;
  transcriptionId: string;
  status: string;
}

// Initialize services and repositories
const audioStorageService = new AudioStorageService(
  process.env.STORAGE_BUCKET_NAME || 'english-learning-app-storage',
  process.env.AWS_REGION || 'us-east-1'
);

const audioMapper = new AudioMapper();
const audioRepository = new DynamoDBAudioRepository(
  process.env.AUDIO_TABLE_NAME || 'dev-audio',
  audioMapper
);

// Initialize audio service
const audioService = new AudioService(audioRepository, audioStorageService);

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
    const authenticatedUser = getAuthenticatedUser(event);
    const userId = authenticatedUser.userId;

    console.log(
      `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
    );

    // Extract path parameters
    const pathUserId = event.pathParameters?.userId;
    const audioId = event.pathParameters?.audioId;
    const path = event.path;
    const method = event.httpMethod;

    // Validate user access - ensure path userId matches authenticated user
    if (pathUserId && pathUserId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: "Access denied: Cannot access another user's resources" }),
      };
    }

    // Route to user-scoped endpoints
    if (path.match(/^\/users\/[^\/]+\/audio\/upload$/) && method === 'POST') {
      return await handleUserAudioUpload(event, userId);
    } else if (path.match(/^\/users\/[^\/]+\/audio$/) && method === 'GET') {
      return await handleUserAudioList(event, userId);
    } else if (path.match(/^\/users\/[^\/]+\/audio\/[^\/]+$/) && method === 'GET') {
      return await handleUserAudioGet(event, userId, audioId!);
    } else if (path.match(/^\/users\/[^\/]+\/audio\/[^\/]+$/) && method === 'DELETE') {
      return await handleUserAudioDelete(event, userId, audioId!);
    } else if (path.match(/^\/users\/[^\/]+\/audio\/[^\/]+\/process$/) && method === 'POST') {
      return await handleUserAudioProcess(event, userId, audioId!);
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

// User-scoped endpoint handlers
async function handleUserAudioUpload(event: any, userId: string): Promise<any> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  try {
    const requestBody: CreateAudioRequest = JSON.parse(event.body);
    const { fileName, contentType, duration, fileSize } = requestBody;

    if (!fileName || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'fileName and contentType are required' }),
      };
    }

    const result = await audioService.createAudio({
      userId,
      fileName,
      contentType,
      fileSize,
      duration,
    });

    const response: CreateAudioResponse = {
      success: true,
      audioId: result.audioId,
      uploadUrl: result.uploadUrl,
      expiresIn: result.expiresIn,
    };

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to create audio upload',
      }),
    };
  }
}

async function handleUserAudioList(event: any, userId: string): Promise<any> {
  try {
    const queryParams = event.queryStringParameters || {};
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;
    const lastEvaluatedKey = queryParams.lastEvaluatedKey;
    const status = queryParams.status;

    const result = await audioService.listAudio({
      userId,
      limit,
      lastEvaluatedKey,
      status,
    });

    const response: ListAudioResponse = {
      success: true,
      audioFiles: result.audioFiles,
      lastEvaluatedKey: result.lastEvaluatedKey,
      totalCount: result.totalCount,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to list audio files',
      }),
    };
  }
}

async function handleUserAudioGet(event: any, userId: string, audioId: string): Promise<any> {
  try {
    const result = await audioService.getAudio({
      audioId,
      userId,
    });

    const response: GetAudioResponse = {
      success: true,
      audio: result.audio,
      downloadUrl: result.downloadUrl,
      expiresIn: result.expiresIn,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const statusCode =
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('Audio file not found') ||
        error.message.includes('must be a valid UUID'))
        ? 404
        : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get audio file',
      }),
    };
  }
}

async function handleUserAudioDelete(event: any, userId: string, audioId: string): Promise<any> {
  try {
    const result = await audioService.deleteAudio({
      audioId,
      userId,
    });

    const response: DeleteAudioResponse = {
      success: result.success,
      message: result.message,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const statusCode =
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('Audio file not found') ||
        error.message.includes('must be a valid UUID'))
        ? 404
        : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to delete audio file',
      }),
    };
  }
}

async function handleUserAudioProcess(event: any, userId: string, audioId: string): Promise<any> {
  try {
    const result = await audioService.processAudio({
      audioId,
      userId,
    });

    const response: ProcessAudioResponse = {
      success: result.success,
      message: result.message,
      transcriptionId: result.transcriptionId,
      status: result.status,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const statusCode =
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('Audio file not found') ||
        error.message.includes('must be a valid UUID'))
        ? 404
        : 400;
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to process audio file',
      }),
    };
  }
}
