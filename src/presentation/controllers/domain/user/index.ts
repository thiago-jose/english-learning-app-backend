import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CreateUserUseCase } from '../../../../application/use-cases/CreateUserUseCase';
import { DynamoDBUserRepository } from '../../../../infrastructure/repositories/DynamoDBUserRepository';
import { UserMapper } from '../../../../infrastructure/mappers/UserMapper';
import { User } from '../../../../domain/entities/User';
import { getAuthenticatedUser, getUserIdWithFallback } from '../../../utils/auth';
import { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, DeleteUserCommand, ChangePasswordCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const userMapper = new UserMapper();
const userRepository = new DynamoDBUserRepository(process.env.USERS_TABLE_NAME || '', userMapper);
const createUserUseCase = new CreateUserUseCase(userRepository);

// Cognito client for user management
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Handle health check endpoint (no auth required)
    if (event.path === '/health' || event.resource === '/health') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          status: 'healthy',
          service: 'english-learning-app-backend',
          version: '1.2.1'
        }),
      };
    }

    const path = event.pathParameters?.proxy || '';
    
    switch (event.httpMethod) {
      case 'POST':
        // Route different POST operations based on path
        switch (path) {
          case 'signup':
            return await signUpUser(event);
          case 'confirm':
            return await confirmSignUp(event);
          case 'change-password':
            return await changePassword(event);
          case '':
          case undefined:
            return await createUserProfile(event); // Create local user profile (post-authentication)
          default:
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ message: 'Not found' }),
            };
        }
      case 'GET':
        // With {proxy+} route, the user ID is in 'proxy', not 'userId'
        const getUserId = event.pathParameters?.proxy || event.pathParameters?.userId;
        if (getUserId) {
          return await getUserById(event);
        }
        return await getAllUsers(event);
      case 'PUT':
        return await updateUser(event);
      case 'DELETE':
        // Route DELETE operations
        if (path === 'account') {
          return await deleteAccount(event); // Delete both Cognito account and local profile
        }
        return await deleteUser(event); // Delete only local profile
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

// COGNITO USER LIFECYCLE FUNCTIONS

async function signUpUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { email, password, name } = JSON.parse(event.body || '{}');

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Email and password are required' }),
      };
    }

    if (!CLIENT_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Cognito configuration missing' }),
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
        ...(name ? [{
          Name: 'name',
          Value: name,
        }] : []),
      ],
    });

    const result = await cognitoClient.send(signUpCommand);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'User signed up successfully. Please check your email for verification code.',
        userSub: result.UserSub,
        codeDeliveryDetails: result.CodeDeliveryDetails,
      }),
    };
  } catch (error: any) {
    console.error('Error in signUpUser:', error);
    
    // Handle Cognito-specific errors
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'User with this email already exists' }),
      };
    }
    
    if (error.name === 'InvalidPasswordException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Password does not meet requirements' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to sign up user' }),
    };
  }
}

async function confirmSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { email, confirmationCode } = JSON.parse(event.body || '{}');

    if (!email || !confirmationCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Email and confirmation code are required' }),
      };
    }

    if (!CLIENT_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Cognito configuration missing' }),
      };
    }

    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
    });

    await cognitoClient.send(confirmCommand);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Email verified successfully. You can now sign in.',
      }),
    };
  } catch (error: any) {
    console.error('Error in confirmSignUp:', error);

    if (error.name === 'CodeMismatchException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid confirmation code' }),
      };
    }

    if (error.name === 'ExpiredCodeException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Confirmation code has expired' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to confirm sign up' }),
    };
  }
}

async function changePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for password change:', userId);
    }
    
    const { oldPassword, newPassword } = JSON.parse(event.body || '{}');

    if (!oldPassword || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Old password and new password are required' }),
      };
    }

    // Note: This requires the access token, not the ID token
    // The access token should be provided in the Authorization header
    const accessToken = event.headers.Authorization?.replace('Bearer ', '');
    
    if (!accessToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Access token required for password change' }),
      };
    }

    const changePasswordCommand = new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: oldPassword,
      ProposedPassword: newPassword,
    });

    await cognitoClient.send(changePasswordCommand);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Password changed successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error in changePassword:', error);

    if (error.name === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Current password is incorrect' }),
      };
    }

    if (error.name === 'InvalidPasswordException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'New password does not meet requirements' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to change password' }),
    };
  }
}

async function deleteAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for account deletion:', userId);
    }
    
    // Delete from Cognito User Pool
    const accessToken = event.headers.Authorization?.replace('Bearer ', '');
    
    if (!accessToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Access token required for account deletion' }),
      };
    }

    const deleteUserCommand = new DeleteUserCommand({
      AccessToken: accessToken,
    });

    await cognitoClient.send(deleteUserCommand);

    // Also delete local user profile
    await userRepository.delete(userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Account deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error in deleteAccount:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to delete account' }),
    };
  }
}

// LOCAL USER PROFILE FUNCTIONS

async function createUserProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract authenticated user information from Cognito JWT claims
    // Falls back to test headers for integration tests during transition
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
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
        provider: 'TEST_FALLBACK'
      };
    }
    
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
    // With {proxy+} route, the user ID is in 'proxy', not 'userId'
    const requestedUserId = event.pathParameters?.proxy || event.pathParameters?.userId;
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Get the authenticated user to ensure they can only access their own data
    // Falls back to test headers for integration tests during transition
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
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
    // With {proxy+} route, the user ID is in 'proxy', not 'userId'
    const requestedUserId = event.pathParameters?.proxy || event.pathParameters?.userId;
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Ensure user can only update their own profile
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for update user:', userId);
    }
    
    if (userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied. You can only update your own profile.' }),
      };
    }

    const userData = JSON.parse(event.body || '{}');
    const existingUser = await userRepository.findById(requestedUserId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    // Create updated user using the static method
    const updatedUser = await userRepository.update(
      User.fromUpdate(existingUser, { ...userData, id: requestedUserId })
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
    // With {proxy+} route, the user ID is in 'proxy', not 'userId'
    const requestedUserId = event.pathParameters?.proxy || event.pathParameters?.userId;
    if (!requestedUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'User ID is required' }),
      };
    }

    // Ensure user can only delete their own profile
    // Extract authenticated user information with fallback
    let userId: string;
    let authenticatedUser: any = null;
    
    try {
      authenticatedUser = getAuthenticatedUser(event);
      userId = authenticatedUser.userId;
      console.log(`Authenticated user: ${authenticatedUser.name} (${authenticatedUser.email}) via ${authenticatedUser.provider}`);
    } catch (authError) {
      // Temporary fallback during deployment transition
      userId = getUserIdWithFallback(event);
      console.warn('Using fallback user ID extraction for delete user:', userId);
    }
    
    if (userId !== requestedUserId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Access denied. You can only delete your own profile.' }),
      };
    }

    const existingUser = await userRepository.findById(requestedUserId);
    if (!existingUser) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
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
      body: JSON.stringify({ message: 'Authentication required' }),
    };
  }
}
