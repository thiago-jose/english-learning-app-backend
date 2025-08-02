import { jest } from '@jest/globals';

// Configure AWS SDK v3 - credentials are handled by environment variables
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';

// Set Jest timeout
jest.setTimeout(30000);
