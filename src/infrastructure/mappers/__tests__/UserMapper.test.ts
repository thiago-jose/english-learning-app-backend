import { UserMapper } from '../UserMapper';
import { User } from '../../../domain/entities/User';
import { UserDynamoDBItem } from '../types';

describe('UserMapper', () => {
  let userMapper: UserMapper;

  beforeEach(() => {
    userMapper = new UserMapper();
  });

  describe('toDynamoDB', () => {
    it('should convert User domain entity to DynamoDB format', () => {
      const user = new User({
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });

      const result = userMapper.toDynamoDB(user);

      expect(result).toEqual({
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      });
    });
  });

  describe('toDomain', () => {
    it('should convert DynamoDB item to User domain entity', () => {
      const dynamoItem: UserDynamoDBItem = {
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      const result = userMapper.toDomain(dynamoItem);

      expect(result).toBeInstanceOf(User);
      expect(result.id).toBe('test-id');
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.createdAt).toEqual(new Date('2023-01-01T00:00:00.000Z'));
      expect(result.updatedAt).toEqual(new Date('2023-01-02T00:00:00.000Z'));
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity through round-trip conversion', () => {
      const originalUser = new User({
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });

      const dynamoItem = userMapper.toDynamoDB(originalUser);
      const convertedUser = userMapper.toDomain(dynamoItem);

      expect(convertedUser.id).toBe(originalUser.id);
      expect(convertedUser.email).toBe(originalUser.email);
      expect(convertedUser.name).toBe(originalUser.name);
      expect(convertedUser.createdAt).toEqual(originalUser.createdAt);
      expect(convertedUser.updatedAt).toEqual(originalUser.updatedAt);
    });
  });
});
