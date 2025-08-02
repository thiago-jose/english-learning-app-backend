import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CreateUserUseCase } from '../../../../application/use-cases/CreateUserUseCase';
import { DynamoDBUserRepository } from '../../../../infrastructure/repositories/DynamoDBUserRepository';
import { UserMapper } from '../../../../infrastructure/mappers/UserMapper';
import { User } from '../../../../domain/entities/User';
import { getAuthenticatedUser, getUserIdWithFallback } from '../../../utils/auth';

const userMapper = new UserMapper();
const userRepository = new DynamoDBUserRepository(process.env.USERS_TABLE_NAME || '', userMapper);
const createUserUseCase = new CreateUserUseCase(userRepository);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

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
          headers,
          body: JSON.stringify({ message: 'Unsupported HTTP method' }),
        };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

async function createUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract authenticated user information from Cognito JWT claims
    const authenticatedUser = getAuthenticatedUser(event);
    
    // Use Cognito claims as the primary source of user data
    const userData = {
      id: authenticatedUser.userId,  // Use Cognito user UUID
      email: authenticatedUser.email,
      name: authenticatedUser.name || authenticatedUser.email, // Fallback to email if name not available
      // Add additional fields if available
      ...(authenticatedUser.picture && { picture: authenticatedUser.picture }),
      // Allow body to override certain fields if needed
      ...JSON.parse(event.body || '{}')
    };

    console.log(`Creating user from Cognito claims: ${userData.email} (${authenticatedUser.provider})`);

    const user = await createUserUseCase.execute(userData);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(user.toJSON()),
    };
  } catch (authError) {
    console.error('Authentication error in createUser:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}

async function getUserById(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const requestedUserId = event.pathParameters?.userId;
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Get the authenticated user to ensure they can only access their own data
    const authenticatedUser = getAuthenticatedUser(event);
    
    // Users can only access their own profile (for privacy/security)
    if (authenticatedUser.userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied. You can only access your own profile.' }),
      };
    }

    const user = await userRepository.findById(requestedUserId);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(user.toJSON()),
    };
  } catch (authError) {
    console.error('Authentication error in getUserById:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}

async function getAllUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // For now, allow any authenticated user to get all users
    // In the future, this should be admin-only
    const authenticatedUser = getAuthenticatedUser(event);
    console.log(`User ${authenticatedUser.email} requesting all users`);
    
    const users = await userRepository.findAll();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(users.map((user) => user.toJSON())),
    };
  } catch (authError) {
    console.error('Authentication error in getAllUsers:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}

async function updateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Ensure user can only update their own profile
    const authenticatedUser = getAuthenticatedUser(event);
    if (authenticatedUser.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied. You can only update your own profile.' }),
      };
    }

    const userData = JSON.parse(event.body || '{}');
    const existingUser = await userRepository.findById(userId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    // Create updated user using the static method
    const updatedUser = await userRepository.update(
      User.fromUpdate(existingUser, { ...userData, id: userId })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(updatedUser.toJSON()),
    };
  } catch (authError) {
    console.error('Authentication error in updateUser:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}

async function deleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Ensure user can only delete their own profile
    const authenticatedUser = getAuthenticatedUser(event);
    if (authenticatedUser.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied. You can only delete your own profile.' }),
      };
    }

    const existingUser = await userRepository.findById(userId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    await userRepository.delete(userId);
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  } catch (authError) {
    console.error('Authentication error in deleteUser:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}
