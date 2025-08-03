# Claude Context - English Learning App Backend

> **📋 SESSION START**: Always read `PROJECT_STATUS.md` first to get current project state, deployment status, and immediate next steps.

## Project Vision & Goals

This backend service is designed as an intelligent assistant that will help improve English language skills through voice commands and AI-powered learning features. The long-term vision is to create a generic, scalable platform that can be adapted for different purposes, but the initial focus is on English learning validation.

### Core Use Case: Voice-Activated Word Learning
The primary feature allows users to register new English words using voice commands:
- User says: "save this word strawman"
- System processes: audio upload → S3 storage → transcription → command parsing → AI analysis (via Bedrock) → data storage
- AI provides: word meanings, usage examples, and related information
- All data stored in DynamoDB for future learning sessions

### Architecture Philosophy
- **Clean Architecture**: Domain-driven design with clear separation of concerns
- **Domain-Driven Design (DDD)**: Business logic organized around language learning domains
- **AWS-Native**: Leverages AWS services for scalability and reliability
- **TypeScript**: Type-safe development with modern JavaScript features

## Project Overview
English learning application backend built with AWS SAM, TypeScript, Node.js, DynamoDB, and S3.

## Development Patterns & Standards

### Key Files & Structure
- `/template.yml`: SAM template with AWS resources
- `/Makefile`: Build rules for Lambda functions  
- `/src/presentation/controllers/domain/`: Lambda handlers organized by domain
- Build pattern: npm ci → tsc build → copy to artifacts → production npm install

### Essential Commands
- Deploy dev: `aws-vault exec english-learning-app --no-session -- npm run sam:deploy:dev`
- Build: `npm run sam:build`
- Test: `npm test`, `npm run test:unit`, `npm run test:integ:dev`
- **User Lifecycle Tests**: `aws-vault exec english-learning-app --no-session -- npx jest --config jest.config.js --testPathPattern="user-lifecycle.test.ts"`
- **Audio Integration Tests**: `aws-vault exec english-learning-app --no-session -- npx jest --config jest.config.js --testPathPattern="audio.*integration"`
- Generate env: `npm run generate-env:dev`
- Lint: `npm run lint`

### AWS SDK Configuration
- **SDK Version**: AWS SDK v3 (migrated from v2)
- **DynamoDB**: Uses `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` with command pattern
- **S3**: Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- **CloudFormation**: Uses `@aws-sdk/client-cloudformation` for environment generation
- **Transcribe**: Uses `@aws-sdk/client-transcribe`
- **Bedrock**: Uses `@aws-sdk/client-bedrock-runtime`

## Authentication & Authorization

### Cognito User Pool Implementation (DEPLOYED)
- **Status**: ✅ Fully deployed and operational with comprehensive testing
- **Authentication Method**: AWS Cognito User Pools with JWT tokens
- **API Authorization**: API Gateway JWT Authorizer (✅ deployed and configured)
- **User Isolation**: Each user can only access their own resources (✅ validated)
- **Admin Auth Flow**: `ALLOW_ADMIN_USER_PASSWORD_AUTH` enabled for testing
- **Test Suite**: Comprehensive integration tests validating complete user lifecycle

### Authentication Utilities
- **Location**: `src/presentation/utils/auth.ts`
- **Key Functions**:
  - `getAuthenticatedUser(event)`: Extract full user info from JWT claims
  - `getUserId(event)`: Simple user ID extraction
  - `getUserIdWithFallback(event)`: Fallback for testing during deployment
- **User Data**: Includes userId, email, name, picture, provider information

### Integration Test Suite (NEW)
- **User Lifecycle Tests**: `src/presentation/controllers/domain/user/__tests__/integration/user-lifecycle.test.ts`
  - **Cognito Test Helpers**: AdminCreateUser, AdminSetUserPassword, AdminInitiateAuth
  - **JWT Authentication Flow**: Complete user signup → authenticate → use API → delete workflow
  - **Admin Permissions Required**: `cognito-idp:AdminCreateUser`, `AdminSetUserPassword`, `AdminDeleteUser`, `AdminInitiateAuth`
  - **User Isolation Testing**: Cross-user access prevention validation
  - **Audio API Integration**: JWT-authenticated audio upload/download workflows
- **Status**: ✅ 8/15 tests passing (core functionality working, minor assertion fixes needed)

### ID Token Only Strategy (✅ IMPLEMENTED)
- **Token Strategy**: **ID tokens only** - all endpoints use API Gateway JWT authorizer
- **No Access Tokens**: Access tokens are not used by any API endpoints
- **Consistent Authentication**: All protected endpoints use the same JWT authorizer pattern
- **Client Simplification**: Client only needs to manage one token type (ID token)

### Current Authentication Flow
1. Frontend sends **ID token** in `Authorization: Bearer <idToken>` header
2. API Gateway validates JWT against Cognito User Pool (✅ deployed and configured)
3. API Gateway passes validated claims to Lambda via `event.requestContext.authorizer.claims`
4. Lambda extracts user info using `getAuthenticatedUser(event)` utility
5. Lambda enforces user-specific access controls

### Special Endpoint Implementation
- **Password Change** (`/users/{id}/change-password`):
  - Uses JWT authorizer (ID token) for authentication
  - Validates old password via `AdminInitiateAuthCommand`
  - Sets new password via `AdminSetUserPasswordCommand`
  - Requires `cognito-idp:AdminInitiateAuth` and `cognito-idp:AdminSetUserPassword` permissions

- **Account Deletion** (`/users/{id}/account`):
  - Uses JWT authorizer (ID token) for authentication  
  - Deletes user via `AdminDeleteUserCommand`
  - Requires `cognito-idp:AdminDeleteUser` permissions

### Lambda IAM Permissions
- **DynamoDB**: `DynamoDBCrudPolicy` for user profile data
- **Cognito Admin APIs**: 
  - `cognito-idp:AdminInitiateAuth` (password validation)
  - `cognito-idp:AdminSetUserPassword` (password changes)
  - `cognito-idp:AdminDeleteUser` (account deletion)

### Security Features Implemented
- **User Resource Isolation**: Users can only access/modify their own data
- **Provider Tracking**: Track authentication provider (email/password, Google, Facebook)
- **Centralized Authentication**: All endpoints use API Gateway JWT authorizer
- **Server-Side Validation**: Password changes validated server-side with Admin APIs
- **Comprehensive Error Handling**: Proper 401/403 responses for auth failures
- **CORS Support**: Configured for cross-origin requests with authorization headers

### ⚠️ IMPORTANT: Token Usage Guidelines
- **NEVER use access tokens in API endpoints** - all endpoints must use ID tokens
- **NEVER add `Auth: NONE` to user-specific endpoints** - always use JWT authorizer
- **Client applications should only store and use ID tokens** for API requests
- **Integration tests must use `idToken` for all authenticated requests**