import AWS from 'aws-sdk';
import { jest } from '@jest/globals';

// Configure AWS SDK
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
  }
};

AWS.config.update(awsConfig);

// Set Jest timeout
jest.setTimeout(30000); 