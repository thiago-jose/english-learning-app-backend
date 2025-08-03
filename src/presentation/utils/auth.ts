import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * User information extracted from Cognito JWT claims
 */
export interface AuthenticatedUser {
  userId: string; // Cognito user UUID (sub claim)
  email: string; // User's email address
  name?: string; // User's display name
  picture?: string; // User's profile picture URL
  provider?: string; // Authentication provider (Google, Facebook, COGNITO_USER_POOLS)
  providerUserId?: string; // Original provider user ID
}

/**
 * Extract authenticated user information from API Gateway event
 * After JWT validation by API Gateway, user claims are available in event.requestContext.authorizer.claims
 */
export function getAuthenticatedUser(event: APIGatewayProxyEvent): AuthenticatedUser {
  const claims = event.requestContext?.authorizer?.claims;

  if (!claims) {
    throw new Error(
      'No authorization claims found. Ensure API Gateway JWT authorizer is configured.'
    );
  }

  // Extract basic user information
  const userId = claims.sub;
  const email = claims.email;
  const name = claims.name;
  const picture = claims.picture;

  if (!userId) {
    throw new Error('User ID (sub claim) not found in JWT token.');
  }

  if (!email) {
    throw new Error('Email claim not found in JWT token.');
  }

  // Extract provider information from identities claim
  let provider: string | undefined;
  let providerUserId: string | undefined;

  try {
    const identities = claims.identities ? JSON.parse(claims.identities) : [];
    const primaryIdentity = identities.find((id: any) => id.primary === 'true') || identities[0];

    if (primaryIdentity) {
      provider = primaryIdentity.providerName;
      providerUserId = primaryIdentity.userId;
    }
  } catch (error) {
    console.warn('Failed to parse identities claim:', error);
    // Default to COGNITO_USER_POOLS if parsing fails
    provider = 'COGNITO_USER_POOLS';
  }

  return {
    userId,
    email,
    name,
    picture,
    provider,
    providerUserId,
  };
}

/**
 * Extract user ID for backward compatibility
 * Use this when you only need the user ID
 */
export function getUserId(event: APIGatewayProxyEvent): string {
  return getAuthenticatedUser(event).userId;
}

/**
 * Extract user ID from JWT token (works with both ID tokens and access tokens)
 * Access tokens have 'sub' claim but may not have other user profile claims
 */
export function getUserIdFromToken(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext?.authorizer?.claims;

  if (!claims) {
    throw new Error(
      'No authorization claims found. Ensure API Gateway JWT authorizer is configured.'
    );
  }

  const userId = claims.sub;
  if (!userId) {
    throw new Error('User ID (sub claim) not found in JWT token.');
  }

  return userId;
}

/**
 * Development/testing helper - allows test headers for integration tests
 * Remove this in production or add feature flag
 */
export function getUserIdWithFallback(event: APIGatewayProxyEvent): string {
  try {
    return getUserIdFromToken(event);
  } catch (error) {
    // Fallback to test headers for integration tests
    const testUserId = event.headers?.['X-Test-User-Id'] || event.headers?.['x-test-user-id'];

    if (testUserId) {
      console.warn('Using test user ID from headers:', testUserId);
      return testUserId;
    }

    throw error;
  }
}
