import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CreateUserUseCase } from '../../../../application/use-cases/CreateUserUseCase';
import { DynamoDBUserRepository } from '../../../../infrastructure/repositories/DynamoDBUserRepository';
import { UserMapper } from '../../../../infrastructure/mappers/UserMapper';
import { User } from '../../../../domain/entities/User';
import { getAuthenticatedUser, getUserIdWithFallback } from '../../../utils/auth';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  DeleteUserCommand,
  ChangePasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { operations } from '../../../../types/api';

// Type definitions from OpenAPI schema
type CreateUserRequest = operations['createUserProfile']['requestBody'] extends {
  content: { 'application/json': infer T };
}
  ? T
  : never;
type UserResponse =
  operations['createUserProfile']['responses']['201']['content']['application/json'];
type UpdateUserRequest = operations['updateUser']['requestBody']['content']['application/json'];
type ChangePasswordRequest =
  operations['changePassword']['requestBody']['content']['application/json'];
type MessageResponse =
  operations['changePassword']['responses']['200']['content']['application/json'];
type SignUpRequest = operations['signUpUser']['requestBody']['content']['application/json'];
type SignUpResponse = operations['signUpUser']['responses']['201']['content']['application/json'];
type ConfirmSignUpRequest =
  operations['confirmSignUp']['requestBody']['content']['application/json'];
type HealthResponse = operations['getHealth']['responses']['200']['content']['application/json'];

const userMapper = new UserMapper();
const userRepository = new DynamoDBUserRepository(process.env.USERS_TABLE_NAME || '', userMapper);
const createUserUseCase = new CreateUserUseCase(userRepository);

// Cognito client for user management
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Route based on path and method instead of proxy parameters
    const path = event.path;
    const method = event.httpMethod;
    
    // Debug logging for delete account requests
    if (path.includes('account') && method === 'DELETE') {
      console.log('DELETE account request received:', {
        path,
        method,
        pathParameters: event.pathParameters,
        headers: Object.keys(event.headers || {}),
        hasAuthHeader: !!event.headers?.Authorization || !!event.headers?.authorization
      });
    }

    // Health check endpoint (no auth required)
    if (path === '/health' && method === 'GET') {
      return await handleHealthCheck();
    }

    // Public endpoints (no auth required)
    if (path === '/users/signup' && method === 'POST') {
      return await handleSignUp(event);
    } else if (path === '/users/confirm' && method === 'POST') {
      return await handleConfirmSignUp(event);
    }

    // User root endpoints
    if (path === '/users' && method === 'GET') {
      return await handleGetAllUsers(event);
    } else if (path === '/users' && method === 'POST') {
      return await handleCreateUserProfile(event);
    }

    // User special endpoints with userId parameter (check these FIRST to avoid conflicts)
    if (path.match(/^\/users\/[^\/]+\/change-password$/) && method === 'POST') {
      console.log(`Matched change-password route: ${path}, method: ${method}`);
      const userId = event.pathParameters?.userId;
      if (!userId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'User ID path parameter is required' }),
        };
      }
      return await handleChangePassword(event, userId);
    } else if (path.match(/^\/users\/[^\/]+\/account$/) && method === 'DELETE') {
      console.log(`Matched delete-account route: ${path}, method: ${method}`);
      const userId = event.pathParameters?.userId;
      if (!userId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'User ID path parameter is required' }),
        };
      }
      return await handleDeleteUserAccount(event, userId);
    }

    // User individual endpoints with path parameters (check these AFTER special endpoints)
    if (path.startsWith('/users/') && event.pathParameters?.userId && !path.includes('/account') && !path.includes('/change-password')) {
      const userId = event.pathParameters.userId;
      if (method === 'GET') {
        return await handleGetUserById(event, userId);
      } else if (method === 'PUT') {
        return await handleUpdateUser(event, userId);
      } else if (method === 'DELETE') {
        return await handleDeleteUserProfile(event, userId);
      }
    }

    // Route not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint not found' }),
    };
  } catch (error) {
    console.error('Error in user handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

// HEALTH CHECK
async function handleHealthCheck(): Promise<APIGatewayProxyResult> {
  const response: HealthResponse = {
    status: 'healthy',
    service: 'english-learning-app-backend',
    version: '1.2.1',
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response),
  };
}

// COGNITO USER LIFECYCLE FUNCTIONS

async function handleSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: SignUpRequest = JSON.parse(event.body);
    const { email, password, name } = requestBody;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and password are required' }),
      };
    }

    if (!CLIENT_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Cognito configuration missing' }),
      };
    }

    const signUpCommand = new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
        ...(name
          ? [
              {
                Name: 'name',
                Value: name,
              },
            ]
          : []),
      ],
    });

    const result = await cognitoClient.send(signUpCommand);

    const response: SignUpResponse = {
      message: 'User signed up successfully. Please check your email for verification code.',
      userSub: result.UserSub!,
      ...(result.CodeDeliveryDetails && {
        codeDeliveryDetails: {
          attributeName: result.CodeDeliveryDetails.AttributeName,
          deliveryMedium: result.CodeDeliveryDetails.DeliveryMedium,
          destination: result.CodeDeliveryDetails.Destination,
        },
      }),
    };

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error in signUpUser:', error);

    // Handle Cognito-specific errors
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'User with this email already exists' }),
      };
    }

    if (error.name === 'InvalidPasswordException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Password does not meet requirements' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to sign up user' }),
    };
  }
}

async function handleConfirmSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: ConfirmSignUpRequest = JSON.parse(event.body);
    const { email, confirmationCode } = requestBody;

    if (!email || !confirmationCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and confirmation code are required' }),
      };
    }

    if (!CLIENT_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Cognito configuration missing' }),
      };
    }

    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
    });

    await cognitoClient.send(confirmCommand);

    const response: MessageResponse = {
      message: 'Email verified successfully. You can now sign in.',
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error in confirmSignUp:', error);

    if (error.name === 'CodeMismatchException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid confirmation code' }),
      };
    }

    if (error.name === 'ExpiredCodeException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Confirmation code has expired' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to confirm sign up' }),
    };
  }
}

async function handleChangePassword(event: APIGatewayProxyEvent, requestedUserId: string): Promise<APIGatewayProxyResult> {
  try {
    // Since this endpoint has Auth: NONE, we need to validate the access token manually
    const accessToken = event.headers.Authorization?.replace('Bearer ', '') || 
                        event.headers.authorization?.replace('Bearer ', '');

    if (!accessToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Access token required for password change' }),
      };
    }

    // Validate that the user can only change their own password
    try {
      const tokenParts = accessToken.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const tokenUserId = payload.sub;
      
      // Debug logging
      console.log('Change password - Requested User ID:', requestedUserId);
      console.log('Change password - Access Token User ID:', tokenUserId);
      console.log('Change password - Access Token Payload:', JSON.stringify(payload, null, 2));
      
      if (!tokenUserId || tokenUserId !== requestedUserId) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Access denied. You can only change your own password.',
            debug: { requestedUserId, tokenUserId } 
          }),
        };
      }
    } catch (decodeError) {
      console.log('Change password - Token decode error:', decodeError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid access token format' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: ChangePasswordRequest = JSON.parse(event.body);
    const { oldPassword, newPassword } = requestBody;

    if (!oldPassword || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Old password and new password are required' }),
      };
    }

    // The Cognito ChangePassword operation validates the access token internally
    const changePasswordCommand = new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: oldPassword,
      ProposedPassword: newPassword,
    });

    await cognitoClient.send(changePasswordCommand);

    const response: MessageResponse = {
      message: 'Password changed successfully',
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error in changePassword:', error);

    if (error.name === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Current password is incorrect or invalid access token' }),
      };
    }

    if (error.name === 'InvalidPasswordException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'New password does not meet requirements' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to change password' }),
    };
  }
}

async function handleDeleteUserAccount(
  event: APIGatewayProxyEvent,
  requestedUserId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Debug: log all headers to understand the structure
    console.log('Delete account - All headers:', JSON.stringify(event.headers, null, 2));
    
    // Since this endpoint has Auth: NONE, we need to validate the access token manually
    const accessToken = event.headers.Authorization?.replace('Bearer ', '') || 
                        event.headers.authorization?.replace('Bearer ', '');

    console.log('Delete account - Extracted access token:', accessToken ? 'Present' : 'Missing');

    if (!accessToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Access token required for account deletion' }),
      };
    }

    // Validate that the user can only delete their own account
    let tokenUserId: string;
    try {
      const tokenParts = accessToken.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      tokenUserId = payload.sub;
      
      // Debug logging
      console.log('Delete account - Requested User ID:', requestedUserId);
      console.log('Delete account - Access Token User ID:', tokenUserId);
      console.log('Delete account - Access Token Payload:', JSON.stringify(payload, null, 2));
      
      if (!tokenUserId || tokenUserId !== requestedUserId) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ 
            error: 'Access denied. You can only delete your own account.',
            debug: { requestedUserId, tokenUserId }
          }),
        };
      }
    } catch (decodeError) {
      console.log('Delete account - Token decode error:', decodeError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid access token format' }),
      };
    }

    // Delete from Cognito User Pool (this validates the access token)
    const deleteUserCommand = new DeleteUserCommand({
      AccessToken: accessToken,
    });

    try {
      console.log('Attempting to delete user from Cognito with access token...');
      await cognitoClient.send(deleteUserCommand);
      console.log('Successfully deleted user from Cognito');
    } catch (cognitoError: any) {
      console.error('Error deleting user from Cognito:', cognitoError);
      
      if (cognitoError.name === 'NotAuthorizedException') {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired access token' }),
        };
      }
      
      // Re-throw other Cognito errors to be handled by outer catch
      throw cognitoError;
    }

    // Also delete local user profile using the validated user ID
    await userRepository.delete(tokenUserId);

    const response: MessageResponse = {
      message: 'Account deleted successfully',
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error in deleteAccount:', error);

    if (error.name === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid access token' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to delete account' }),
    };
  }
}

// LOCAL USER PROFILE FUNCTIONS

async function handleCreateUserProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Extract authenticated user information from Cognito JWT claims
    // Falls back to test headers for integration tests during transition
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(
        `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
      );
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction:', userId);
      // Create minimal authenticated user object for fallback
      const fallbackData = JSON.parse(event.body || '{}');
      authenticatedUser = {
        userId: userId,
        email: fallbackData.email || `${userId}@test.com`,
        name: fallbackData.name || 'Test User',
        provider: 'TEST_FALLBACK',
      };
    }

    // Use Cognito claims as the primary source of user data
    const userData = {
      id: authenticatedUser.userId, // Use Cognito user UUID
      email: authenticatedUser.email,
      name: authenticatedUser.name || authenticatedUser.email, // Fallback to email if name not available
      // Add additional fields if available
      ...(authenticatedUser.picture && { picture: authenticatedUser.picture }),
      // Allow body to override certain fields if needed
      ...JSON.parse(event.body || '{}'),
    };

    console.log(
      `Creating user from Cognito claims: ${userData.email} (${authenticatedUser.provider})`
    );

    const user = await createUserUseCase.execute(userData);

    const userJson = user.toJSON();
    const response: UserResponse = {
      ...userJson,
      createdAt: userJson.createdAt.toISOString(),
      updatedAt: userJson.updatedAt.toISOString(),
    };

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(response),
    };
  } catch (authError) {
    console.error('Authentication error in createUser:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }
}

async function handleGetUserById(
  event: APIGatewayProxyEvent,
  requestedUserId: string
): Promise<APIGatewayProxyResult> {
  try {
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'User ID is required' }),
      };
    }

    // Get the authenticated user to ensure they can only access their own data
    // Falls back to test headers for integration tests during transition
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(
        `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
      );
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction:', userId);
    }

    // Users can only access their own profile (for privacy/security)
    if (userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Access denied. You can only access your own profile.' }),
      };
    }

    const user = await userRepository.findById(requestedUserId);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const userJson = user.toJSON();
    const response: UserResponse = {
      ...userJson,
      createdAt: userJson.createdAt.toISOString(),
      updatedAt: userJson.updatedAt.toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (authError) {
    console.error('Authentication error in getUserById:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }
}

async function handleGetAllUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // For now, allow any authenticated user to get all users
    // In the future, this should be admin-only
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`User ${authenticatedUser.email} requesting all users`);
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for get all users:', userId);
    }

    const users = await userRepository.findAll();
    const response = users.map((user) => {
      const userJson = user.toJSON();
      return {
        ...userJson,
        createdAt: userJson.createdAt.toISOString(),
        updatedAt: userJson.updatedAt.toISOString(),
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (authError) {
    console.error('Authentication error in getAllUsers:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }
}

async function handleUpdateUser(
  event: APIGatewayProxyEvent,
  requestedUserId: string
): Promise<APIGatewayProxyResult> {
  try {
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'User ID is required' }),
      };
    }

    // Ensure user can only update their own profile
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(
        `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
      );
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for update user:', userId);
    }

    if (userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Access denied. You can only update your own profile.' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: UpdateUserRequest = JSON.parse(event.body);
    const existingUser = await userRepository.findById(requestedUserId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // Create updated user using the static method
    const updatedUser = await userRepository.update(
      User.fromUpdate(existingUser, { ...requestBody, id: requestedUserId })
    );

    const userJson = updatedUser.toJSON();
    const response: UserResponse = {
      ...userJson,
      createdAt: userJson.createdAt.toISOString(),
      updatedAt: userJson.updatedAt.toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (authError) {
    console.error('Authentication error in updateUser:', authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }
}

async function handleDeleteUserProfile(
  event: APIGatewayProxyEvent,
  requestedUserId: string
): Promise<APIGatewayProxyResult> {
  try {
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'User ID is required' }),
      };
    }

    // Ensure user can only delete their own profile
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;

    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(
        `Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`
      );
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for delete user:', userId);
    }

    if (userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Access denied. You can only delete your own profile.' }),
      };
    }

    const existingUser = await userRepository.findById(requestedUserId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    await userRepository.delete(requestedUserId);
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
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }
}
