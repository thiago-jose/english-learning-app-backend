import { DynamoDB } from 'aws-sdk';
import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IUserMapper } from '../mappers/IUserMapper';
import { UserDynamoDBItem } from '../mappers/types';

export class DynamoDBUserRepository implements IUserRepository {
  private readonly tableName: string;
  private readonly dynamoDB: DynamoDB.DocumentClient;
  private readonly userMapper: IUserMapper;

  constructor(tableName: string, userMapper: IUserMapper) {
    this.tableName = tableName;
    this.dynamoDB = new DynamoDB.DocumentClient();
    this.userMapper = userMapper;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.dynamoDB
      .get({
        TableName: this.tableName,
        Key: { id },
      })
      .promise();

    if (!result.Item) {
      return null;
    }

    return this.userMapper.toDomain(result.Item as UserDynamoDBItem);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.dynamoDB
      .scan({
        TableName: this.tableName,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      })
      .promise();

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return this.userMapper.toDomain(result.Items[0] as UserDynamoDBItem);
  }

  async findAll(): Promise<User[]> {
    const result = await this.dynamoDB
      .scan({
        TableName: this.tableName,
      })
      .promise();

    return (result.Items || []).map((item) => this.userMapper.toDomain(item as UserDynamoDBItem));
  }

  async create(user: User): Promise<User> {
    const dynamoItem = this.userMapper.toDynamoDB(user);

    await this.dynamoDB
      .put({
        TableName: this.tableName,
        Item: dynamoItem,
      })
      .promise();

    return user;
  }

  async update(user: User): Promise<User> {
    const dynamoItem = this.userMapper.toDynamoDB(user);

    await this.dynamoDB
      .put({
        TableName: this.tableName,
        Item: dynamoItem,
      })
      .promise();

    return user;
  }

  async delete(id: string): Promise<void> {
    await this.dynamoDB
      .delete({
        TableName: this.tableName,
        Key: { id },
      })
      .promise();
  }
}
