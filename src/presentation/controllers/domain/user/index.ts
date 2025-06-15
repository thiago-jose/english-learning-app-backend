import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CreateUserUseCase } from '../../../../application/use-cases/CreateUserUseCase';
import { DynamoDBUserRepository } from '../../../../infrastructure/repositories/DynamoDBUserRepository';
import { mapOpenApiTypeToDomain } from '../../utils';

const userRepository = new DynamoDBUserRepository(process.env.USERS_TABLE_NAME || '');
const createUserUseCase = new CreateUserUseCase(userRepository);

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    switch (event.httpMethod) {
      case 'POST':
        return await createUser(event);
      case 'GET':
        if (event.pathParameters?.userId) {
          return await getUserById(event);
        }
        return await getAllUsers(event);
      case 'PUT':
        return await updateUser(event);
      case 'DELETE':
        return await deleteUser(event);
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Unsupported HTTP method' }),
        };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

async function createUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userData = JSON.parse(event.body || '{}');
  const user = await createUserUseCase.execute(userData);
  
  return {
    statusCode: 201,
    body: JSON.stringify(user.toJSON()),
  };
}

async function getUserById(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'User ID is required' }),
    };
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'User not found' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(user.toJSON()),
  };
}

async function getAllUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const users = await userRepository.findAll();
  return {
    statusCode: 200,
    body: JSON.stringify(users.map(user => user.toJSON())),
  };
}

async function updateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'User ID is required' }),
    };
  }

  const userData = JSON.parse(event.body || '{}');
  const existingUser = await userRepository.findById(userId);
  if (!existingUser) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'User not found' }),
    };
  }

  const updatedUser = await userRepository.update({
    ...existingUser,
    ...userData,
    id: userId,
  });

  return {
    statusCode: 200,
    body: JSON.stringify(updatedUser.toJSON()),
  };
}

async function deleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'User ID is required' }),
    };
  }

  const existingUser = await userRepository.findById(userId);
  if (!existingUser) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'User not found' }),
    };
  }

  await userRepository.delete(userId);
  return {
    statusCode: 204,
    body: '',
  };
} 