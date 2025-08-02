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
- Lint: `npm run lint`

### AWS SDK Configuration
- **SDK Version**: AWS SDK v3 (migrated from v2)
- **DynamoDB**: Uses `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` with command pattern
- **S3**: Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- **CloudFormation**: Uses `@aws-sdk/client-cloudformation` for environment generation
- **Transcribe**: Uses `@aws-sdk/client-transcribe`
- **Bedrock**: Uses `@aws-sdk/client-bedrock-runtime`