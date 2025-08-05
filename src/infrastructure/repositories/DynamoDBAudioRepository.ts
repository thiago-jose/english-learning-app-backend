import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Audio, AudioStatus } from '../../domain/entities/Audio';
import { AudioId } from '../../domain/value-objects/AudioId';
import { UserId } from '../../domain/value-objects/UserId';
import { IAudioRepository } from '../../domain/repositories/IAudioRepository';
import { IAudioMapper } from '../mappers/IAudioMapper';
import { AudioDynamoDBItem } from '../mappers/types';

export class DynamoDBAudioRepository implements IAudioRepository {
  private readonly tableName: string;
  private readonly dynamoDB: DynamoDBDocumentClient;
  private readonly audioMapper: IAudioMapper;

  constructor(tableName: string, audioMapper: IAudioMapper) {
    this.tableName = tableName;
    const client = new DynamoDBClient({});
    this.dynamoDB = DynamoDBDocumentClient.from(client);
    this.audioMapper = audioMapper;
  }

  async save(audio: Audio): Promise<void> {
    const item = this.audioMapper.toDynamoDB(audio);
    
    await this.dynamoDB.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }

  async findById(audioId: AudioId): Promise<Audio | null> {
    const result = await this.dynamoDB.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id: audioId.toString() },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.audioMapper.toDomain(result.Item as AudioDynamoDBItem);
  }

  async findByIdAndUserId(audioId: AudioId, userId: UserId): Promise<Audio | null> {
    const result = await this.dynamoDB.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id: audioId.toString() },
      })
    );

    if (!result.Item) {
      return null;
    }

    const audio = this.audioMapper.toDomain(result.Item as AudioDynamoDBItem);
    
    // Verify audio belongs to the user
    if (!audio.belongsToUser(userId)) {
      return null;
    }

    return audio;
  }

  async findByUserId(
    userId: UserId, 
    limit?: number, 
    lastEvaluatedKey?: string
  ): Promise<{
    items: Audio[];
    lastEvaluatedKey?: string;
  }> {
    const params: any = {
      TableName: this.tableName,
      IndexName: 'UserIdIndex', // GSI for querying by userId
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId.toString(),
      },
      ScanIndexForward: false, // Most recent first
    };

    if (limit) {
      params.Limit = limit;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = JSON.parse(lastEvaluatedKey);
    }

    const result = await this.dynamoDB.send(new QueryCommand(params));

    const items = (result.Items || []).map(item => 
      this.audioMapper.toDomain(item as AudioDynamoDBItem)
    );

    return {
      items,
      lastEvaluatedKey: result.LastEvaluatedKey 
        ? JSON.stringify(result.LastEvaluatedKey) 
        : undefined,
    };
  }

  async findByUserIdAndStatus(
    userId: UserId, 
    status: string, 
    limit?: number, 
    lastEvaluatedKey?: string
  ): Promise<{
    items: Audio[];
    lastEvaluatedKey?: string;
  }> {
    const params: any = {
      TableName: this.tableName,
      IndexName: 'UserIdStatusIndex', // GSI for querying by userId and status
      KeyConditionExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status', // status is a reserved word
      },
      ExpressionAttributeValues: {
        ':userId': userId.toString(),
        ':status': status,
      },
      ScanIndexForward: false, // Most recent first
    };

    if (limit) {
      params.Limit = limit;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = JSON.parse(lastEvaluatedKey);
    }

    const result = await this.dynamoDB.send(new QueryCommand(params));

    const items = (result.Items || []).map(item => 
      this.audioMapper.toDomain(item as AudioDynamoDBItem)
    );

    return {
      items,
      lastEvaluatedKey: result.LastEvaluatedKey 
        ? JSON.stringify(result.LastEvaluatedKey) 
        : undefined,
    };
  }

  async update(audio: Audio): Promise<void> {
    const item = this.audioMapper.toDynamoDB(audio);
    
    // Create update expression dynamically based on changed fields
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Fields that can be updated
    const updatableFields = [
      'status', 'transcriptionId', 'processingError', 'processedAt'
    ];

    updatableFields.forEach(field => {
      if (item[field as keyof AudioDynamoDBItem] !== undefined) {
        updateExpression.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = item[field as keyof AudioDynamoDBItem];
      }
    });

    if (updateExpression.length === 0) {
      return; // Nothing to update
    }

    await this.dynamoDB.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: audio.id.toString() },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  }

  async delete(audioId: AudioId): Promise<void> {
    await this.dynamoDB.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { id: audioId.toString() },
      })
    );
  }

  async existsByIdAndUserId(audioId: AudioId, userId: UserId): Promise<boolean> {
    const result = await this.dynamoDB.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id: audioId.toString() },
        ProjectionExpression: 'id, userId',
      })
    );

    if (!result.Item) {
      return false;
    }

    return result.Item.userId === userId.toString();
  }

  async countByUserId(userId: UserId): Promise<number> {
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId.toString(),
        },
        Select: 'COUNT',
      })
    );

    return result.Count || 0;
  }

  async findProcessable(limit?: number): Promise<Audio[]> {
    const params: any = {
      TableName: this.tableName,
      IndexName: 'StatusIndex', // GSI for querying by status
      KeyConditionExpression: '#status = :uploadedStatus',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':uploadedStatus': AudioStatus.UPLOADED,
      },
    };

    if (limit) {
      params.Limit = Math.floor(limit / 2); // Split between UPLOADED and FAILED
    }

    // Get UPLOADED audio files
    const uploadedResult = await this.dynamoDB.send(new QueryCommand(params));

    // Get FAILED audio files
    params.ExpressionAttributeValues[':uploadedStatus'] = AudioStatus.FAILED;
    const failedResult = await this.dynamoDB.send(new QueryCommand(params));

    const allItems = [
      ...(uploadedResult.Items || []),
      ...(failedResult.Items || []),
    ];

    return allItems
      .map(item => this.audioMapper.toDomain(item as AudioDynamoDBItem))
      .slice(0, limit); // Apply overall limit
  }
}