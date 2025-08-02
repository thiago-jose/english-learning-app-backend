import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IUserMapper } from '../mappers/IUserMapper';
import { UserDynamoDBItem } from '../mappers/types';

export class DynamoDBUserRepository implements IUserRepository {
  private readonly tableName: string;
  private readonly dynamoDB: DynamoDBDocumentClient;
  private readonly userMapper: IUserMapper;

  constructor(tableName: string, userMapper: IUserMapper) {
    this.tableName = tableName;
    const client = new DynamoDBClient({});
    this.dynamoDB = DynamoDBDocumentClient.from(client);
    this.userMapper = userMapper;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.dynamoDB.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.userMapper.toDomain(result.Item as UserDynamoDBItem);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.dynamoDB.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return this.userMapper.toDomain(result.Items[0] as UserDynamoDBItem);
  }

  async findAll(): Promise<User[]> {
    const result = await this.dynamoDB.send(
      new ScanCommand({
        TableName: this.tableName,
      })
    );

    return (result.Items || []).map((item) => this.userMapper.toDomain(item as UserDynamoDBItem));
  }

  async create(user: User): Promise<User> {
    const dynamoItem = this.userMapper.toDynamoDB(user);

    await this.dynamoDB.send(
      new PutCommand({
        TableName: this.tableName,
        Item: dynamoItem,
      })
    );

    return user;
  }

  async update(user: User): Promise<User> {
    const dynamoItem = this.userMapper.toDynamoDB(user);

    await this.dynamoDB.send(
      new PutCommand({
        TableName: this.tableName,
        Item: dynamoItem,
      })
    );

    return user;
  }

  async delete(id: string): Promise<void> {
    await this.dynamoDB.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { id },
      })
    );
  }
}
