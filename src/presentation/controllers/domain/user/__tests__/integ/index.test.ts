import axios from 'axios';
import { DynamoDB } from 'aws-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const env = process.env.NODE_ENV || 'dev';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

interface TestConfig {
  apiEndpoint: string;
  region: string;
}

function getTestConfig(): TestConfig {
  const apiEndpoint = process.env.ApiEndpoint;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!apiEndpoint) {
    throw new Error('Required environment variables not found. Please run generate-env script first.');
  }

  return {
    apiEndpoint,
    region
  };
}

describe('User Controller Integration Tests', () => {
  let config: TestConfig;
  let createdUserId: string;
  let apiClient: any;

  beforeAll(() => {
    // Get test configuration from environment variables
    config = getTestConfig();    

    // Configure API client
    apiClient = axios.create({
      baseURL: config.apiEndpoint,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  });

  it('should create a new user', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User'
    };

    const response = await apiClient.post('/users', userData);
    const body = response.data;

    expect(response.status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body.email).toBe(userData.email);
    expect(body.name).toBe(userData.name);

    createdUserId = body.id;
  });

  it('should get a user by id', async () => {
    const response = await apiClient.get(`/users/${createdUserId}`);
    const body = response.data;

    expect(response.status).toBe(200);
    expect(body.id).toBe(createdUserId);
    expect(body.email).toBe('test@example.com');
    expect(body.name).toBe('Test User');
  });

  it('should get all users', async () => {
    const response = await apiClient.get('/users');
    const body = response.data;

    expect(response.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].id).toBe(createdUserId);
  });

  it('should update a user', async () => {
    const updateData = {
      name: 'Updated User'
    };

    const response = await apiClient.put(`/users/${createdUserId}`, updateData);
    const body = response.data;

    expect(response.status).toBe(200);
    expect(body.id).toBe(createdUserId);
    expect(body.name).toBe(updateData.name);
  });

  it('should delete a user', async () => {
    const response = await apiClient.delete(`/users/${createdUserId}`);
    expect(response.status).toBe(204);

    // Verify user is deleted
    try {
      await apiClient.get(`/users/${createdUserId}`);
      fail('Expected request to fail with 404');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
    }
  });

  it('should return 404 for non-existent user', async () => {
    try {
      await apiClient.get('/users/non-existent-id');
      fail('Expected request to fail with 404');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
    }
  });

  it('should return 400 for invalid request', async () => {
    try {
      await apiClient.post('/users', {
        // Missing required fields
      });
      fail('Expected request to fail with 400');
    } catch (error: any) {
      expect(error.response.status).toBe(400);
    }
  });
}); 