// DynamoDB representation of User
export interface UserDynamoDBItem {
  id: string;
  email: string;
  name: string;
  createdAt: string; // ISO string format
  updatedAt: string; // ISO string format
}
