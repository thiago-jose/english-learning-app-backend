import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Word } from '../../domain/entities/Word';
import { IWordRepository } from '../../domain/repositories/IWordRepository';
import { v4 as uuidv4 } from 'uuid';

export class DynamoDBWordRepository implements IWordRepository {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string) {
    const ddbClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(ddbClient);
    this.tableName = tableName;
  }

  async create(word: Omit<Word, 'id' | 'createdAt'>): Promise<Word> {
    const now = new Date();
    const newWord: Word = {
      ...word,
      id: uuidv4(),
      createdAt: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...newWord,
          createdAt: newWord.createdAt.toISOString(),
          nextReviewDate: newWord.nextReviewDate.toISOString(),
          updatedAt: newWord.updatedAt?.toISOString(),
        },
      })
    );

    return newWord;
  }

  async findById(id: string): Promise<Word | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.mapDynamoDBItemToWord(result.Item);
  }

  async findByUserId(userId: string): Promise<Word[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );

    return (result.Items || []).map((item) => this.mapDynamoDBItemToWord(item));
  }

  async findWordsForReview(userId: string, date: Date = new Date()): Promise<Word[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'nextReviewDate <= :reviewDate',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':reviewDate': date.toISOString(),
        },
      })
    );

    return (result.Items || []).map((item) => this.mapDynamoDBItemToWord(item));
  }

  async update(id: string, word: Partial<Word>): Promise<Word> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(word).forEach(([key, value]) => {
      if (value !== undefined) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;

        // Handle Date objects
        if (value instanceof Date) {
          expressionAttributeValues[`:${key}`] = value.toISOString();
        } else {
          expressionAttributeValues[`:${key}`] = value;
        }
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

    return this.mapDynamoDBItemToWord(result.Attributes!);
  }

  async delete(id: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );
  }

  private mapDynamoDBItemToWord(item: any): Word {
    return {
      ...item,
      createdAt: new Date(item.createdAt),
      nextReviewDate: new Date(item.nextReviewDate),
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    } as Word;
  }
}
