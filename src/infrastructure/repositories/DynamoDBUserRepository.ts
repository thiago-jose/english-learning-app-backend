import { DynamoDB } from 'aws-sdk';
import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';

export class DynamoDBUserRepository implements IUserRepository {
  private readonly tableName: string;
  private readonly dynamoDB: DynamoDB.DocumentClient;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.dynamoDB = new DynamoDB.DocumentClient();
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.dynamoDB.get({
      TableName: this.tableName,
      Key: { id },
    }).promise();

    if (!result.Item) {
      return null;
    }

    return new User(result.Item as any);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.dynamoDB.scan({
      TableName: this.tableName,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return new User(result.Items[0] as any);
  }

  async findAll(): Promise<User[]> {
    const result = await this.dynamoDB.scan({
      TableName: this.tableName,
    }).promise();

    return (result.Items || []).map(item => new User(item as any));
  }

  async create(user: User): Promise<User> {
    await this.dynamoDB.put({
      TableName: this.tableName,
      Item: user.toJSON(),
    }).promise();

    return user;
  }

  async update(user: User): Promise<User> {
    await this.dynamoDB.put({
      TableName: this.tableName,
      Item: user.toJSON(),
    }).promise();

    return user;
  }

  async delete(id: string): Promise<void> {
    await this.dynamoDB.delete({
      TableName: this.tableName,
      Key: { id },
    }).promise();
  }
} 