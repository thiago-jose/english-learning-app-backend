import { User, UserJSON } from '../../domain/entities/User';
import { UserDynamoDBItem } from './types';
import { IUserMapper } from './IUserMapper';

export class UserMapper implements IUserMapper {
  toDomain(dynamoItem: UserDynamoDBItem): User {
    return new User({
      id: dynamoItem.id,
      email: dynamoItem.email,
      name: dynamoItem.name,
      createdAt: new Date(dynamoItem.createdAt),
      updatedAt: new Date(dynamoItem.updatedAt),
    });
  }

  toDynamoDB(user: User): UserDynamoDBItem {
    const userData: UserJSON = user.toJSON();
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      createdAt: userData.createdAt.toISOString(),
      updatedAt: userData.updatedAt.toISOString(),
    };
  }
}
