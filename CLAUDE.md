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

## Audio System Architecture (✅ FULLY IMPLEMENTED)

### User-Scoped Audio API (✅ PRODUCTION READY)
- **Status**: ✅ **Phase 2 Complete** - Full production implementation with 18/18 tests passing
- **Architecture**: Modern user-scoped RESTful API (`/users/{userId}/audio/*`)
- **Service Pattern**: Consolidated AudioService replacing separate use cases
- **Type Safety**: Full OpenAPI type integration with generated TypeScript definitions
- **Route Mapping**: Clean route map pattern replacing regex chains for better performance

### Audio Domain Model (✅ IMPLEMENTED)
```typescript
Audio {
  id: AudioId           // UUID abstraction (not S3 key)
  userId: UserId        // Clear ownership
  fileName: string      // Original filename
  contentType: string   // MIME type validation
  fileSize: number      // Size validation  
  duration?: number     // Audio duration
  s3Key: string         // Internal S3 reference
  status: AudioStatus   // UPLOADED|PROCESSING|PROCESSED|FAILED
  transcriptionId?: TranscriptionId
  processingError?: string
  uploadedAt: Date
  processedAt?: Date
}
```

### Production API Endpoints (✅ DEPLOYED)
```
POST   /users/{userId}/audio/upload           # Generate upload URL + create audio record
GET    /users/{userId}/audio                  # List user's audio files (paginated)
GET    /users/{userId}/audio/{audioId}        # Get audio details + download URL
DELETE /users/{userId}/audio/{audioId}       # Delete audio file (S3 + DynamoDB)
POST   /users/{userId}/audio/{audioId}/process # Start audio processing workflow
```

### AudioService Implementation (✅ CONSOLIDATED)
- **Single Service**: Consolidated 5 separate use cases into unified `AudioService`
- **Type Integration**: Uses generated OpenAPI types for request/response validation
- **S3 Key Alignment**: Fixed S3 key format consistency between services
- **Error Handling**: Proper business logic with appropriate HTTP status codes
- **Resource Management**: Handles both S3 and DynamoDB operations atomically

### Route Map Architecture (✅ OPTIMIZED)
```typescript
// Clean O(1) route lookup replacing O(n) regex chains
const routeMap = {
  'POST:/users/*/audio/upload': handleUserAudioUpload,
  'GET:/users/*/audio': handleUserAudioList,
  'GET:/users/*/audio/*': handleUserAudioGet,
  'DELETE:/users/*/audio/*': handleUserAudioDelete,
  'POST:/users/*/audio/*/process': handleUserAudioProcess,
};
```

### Repository Pattern Implementation (✅ COMPLETE)
- **IAudioRepository**: Domain repository interface with all audio operations
- **DynamoDBAudioRepository**: Complete DynamoDB implementation with GSI indexes
- **AudioMapper**: Maps between domain entities and DynamoDB items
- **Type Safety**: Value objects (AudioId, UserId, TranscriptionId) for type safety

### DynamoDB Audio Table Design (✅ DEPLOYED)
```
Table: dev-audio
Primary Key: id (AudioId)
GSI: UserIdIndex (userId + uploadedAt) - List user's audio files
GSI: UserIdStatusIndex (userId + status) - Query by processing status  
GSI: StatusIndex (status + uploadedAt) - System processing queries
```

### OpenAPI Type Integration (✅ IMPLEMENTED)
- **Generated Types**: Full TypeScript type generation from OpenAPI specification
- **Type Safety**: All request/response objects use generated `components['schemas']` types
- **Schema Validation**: Compile-time validation ensures API consistency
- **Single Source of Truth**: Types automatically sync between frontend and backend

### Key Architectural Achievements
- **User Isolation**: JWT-enforced user-scoped access with 403 cross-user protection
- **Resource Abstraction**: AudioId-based public API hiding S3 implementation details
- **Service Consolidation**: Single AudioService replacing 5 separate use case classes
- **Route Optimization**: O(1) route map lookup replacing O(n) regex matching
- **Type Safety**: End-to-end type safety from OpenAPI to implementation
- **Test Coverage**: Complete integration test suite (18/18 passing)

### Audio Processing Workflow (✅ IMPLEMENTED)
1. **Upload**: User uploads audio → AudioId generated → Status: UPLOADED
2. **Processing**: Audio transcription initiated → Status: PROCESSING  
3. **Analysis**: AI analysis extracts words → Status: PROCESSED
4. **Error Handling**: Failed processing → Status: FAILED → Retry capability

### Implementation Status (✅ COMPLETE)
- **✅ Domain Layer**: Audio entity with business rules and validation
- **✅ Repository Layer**: DynamoDB repository with efficient queries
- **✅ Infrastructure**: DynamoDB table with GSI indexes deployed
- **✅ API Definition**: User-scoped endpoints in SAM template
- **✅ Controller Layer**: Full implementation with route map pattern
- **✅ Service Layer**: Consolidated AudioService with type safety
- **✅ OpenAPI Integration**: Generated types with schema validation
- **✅ Testing Suite**: 18/18 integration tests passing with JWT authentication

### Performance Optimizations
- **Route Mapping**: O(1) route lookup vs O(n) regex chains
- **Service Consolidation**: Reduced module loading and initialization overhead
- **Type Compilation**: Compile-time type checking prevents runtime errors
- **S3 Key Efficiency**: Direct S3 key management without redundant transformations