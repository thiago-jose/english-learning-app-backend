// DynamoDB representation of User
export interface UserDynamoDBItem {
  id: string;
  email: string;
  name: string;
  createdAt: string; // ISO string format
  updatedAt: string; // ISO string format
}

// DynamoDB representation of Audio
export interface AudioDynamoDBItem {
  id: string;
  userId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  duration?: number;
  s3Key: string;
  uploadedAt: string; // ISO string format
  status: string;
  transcriptionId?: string;
  processingError?: string;
  processedAt?: string; // ISO string format
}
