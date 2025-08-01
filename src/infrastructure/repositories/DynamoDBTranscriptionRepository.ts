import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Transcription } from '../../domain/entities/Transcription';
import { ITranscriptionRepository } from '../../domain/repositories/ITranscriptionRepository';
import { v4 as uuidv4 } from 'uuid';

export class DynamoDBTranscriptionRepository implements ITranscriptionRepository {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string) {
    const ddbClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(ddbClient);
    this.tableName = tableName;
  }

  async create(transcription: Omit<Transcription, 'id' | 'createdAt'>): Promise<Transcription> {
    const now = new Date();
    const newTranscription: Transcription = {
      ...transcription,
      id: uuidv4(),
      createdAt: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...newTranscription,
          createdAt: newTranscription.createdAt.toISOString(),
          updatedAt: newTranscription.updatedAt?.toISOString(),
        },
      })
    );

    return newTranscription;
  }

  async findById(id: string): Promise<Transcription | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.mapDynamoDBItemToTranscription(result.Item);
  }

  async findByUserId(userId: string): Promise<Transcription[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Latest first
      })
    );

    return (result.Items || []).map((item) => this.mapDynamoDBItemToTranscription(item));
  }

  async findByJobName(jobName: string): Promise<Transcription | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'JobNameIndex',
        KeyConditionExpression: 'jobName = :jobName',
        ExpressionAttributeValues: {
          ':jobName': jobName,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return this.mapDynamoDBItemToTranscription(result.Items[0]);
  }

  async update(id: string, transcription: Partial<Transcription>): Promise<Transcription> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(transcription).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return this.mapDynamoDBItemToTranscription(result.Attributes!);
  }

  async delete(id: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );
  }

  private mapDynamoDBItemToTranscription(item: any): Transcription {
    return {
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    } as Transcription;
  }
}
