import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBTranscriptionRepository } from '../../../../infrastructure/repositories/DynamoDBTranscriptionRepository';
import { TranscriptionService } from '../../../../infrastructure/services/TranscriptionService';

const transcriptionRepository = new DynamoDBTranscriptionRepository(
  process.env.TRANSCRIPTIONS_TABLE_NAME || 'Transcriptions'
);
const transcriptionService = new TranscriptionService(
  transcriptionRepository,
  process.env.STORAGE_BUCKET_NAME || 'english-learning-app-storage',
  process.env.AWS_REGION || 'us-east-1'
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
    const body = JSON.parse(event.body || '{}');
    const { action } = body;
    const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Action is required' }),
      };
    }

    switch (action) {
      case 'startTranscription':
        return await handleStartTranscription(body, userId);
      case 'getTranscriptionStatus':
        return await handleGetTranscriptionStatus(body);
      case 'getUserTranscriptions':
        return await handleGetUserTranscriptions(userId);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Transcription API error:', error);
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

async function handleStartTranscription(body: any, userId: string) {
  const { audioFileKey, languageCode, speakerLabels, maxSpeakers } = body;

  if (!audioFileKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'audioFileKey is required' }),
    };
  }

  const transcription = await transcriptionService.startTranscription({
    audioFileKey,
    userId,
    languageCode,
    speakerLabels,
    maxSpeakers,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      transcription,
      message: 'Transcription job started successfully',
    }),
  };
}

async function handleGetTranscriptionStatus(body: any) {
  const { jobName } = body;

  if (!jobName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'jobName is required' }),
    };
  }

  const status = await transcriptionService.getTranscriptionStatus(jobName);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      ...status,
    }),
  };
}

async function handleGetUserTranscriptions(userId: string) {
  const transcriptions = await transcriptionRepository.findByUserId(userId);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      transcriptions,
    }),
  };
}
