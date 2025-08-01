import { User } from '../../domain/entities/User';
import { UserDynamoDBItem } from './types';

export interface IUserMapper {
  toDomain(dynamoItem: UserDynamoDBItem): User;
  toDynamoDB(user: User): UserDynamoDBItem;
}
