# Claude Context - English Learning App Backend

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

## Recent Changes & Context

### 2025-08-01 - AWS Deployment Fix
**Issue**: Deployment failing due to missing Makefile rules and IAM policy issues
**Changes Made**:
- Added `build-AudioFunction` rule to Makefile (matching existing `build-UsersFunction` pattern)
- Fixed S3 IAM policy in template.yml: changed `${AudioFilesBucket}/*` to `${AudioFilesBucket.Arn}/*`
- Successfully deployed to dev environment

**Current Deployment Status**:
- Stack: `english-learning-app-dev`
- API Endpoint: `https://tzbc0ivajg.execute-api.us-east-1.amazonaws.com/dev/`
- Functions: UsersFunction, AudioFunction (both deployed)
- Resources: DynamoDB tables, S3 bucket, API Gateway all created

**Architecture**:
- UsersFunction: handles /users routes
- AudioFunction: handles /audio routes  
- WordsFunction, TranscriptionFunction: commented out in template.yml
- Build method: Custom Makefile with TypeScript compilation

## Key Files & Patterns
- `/template.yml`: SAM template with AWS resources
- `/Makefile`: Build rules for Lambda functions
- `/src/presentation/controllers/domain/`: Lambda handlers organized by domain
- Build pattern: npm ci → tsc build → copy to artifacts → production npm install

## Commands
- Deploy dev: `aws-vault exec english-learning-app --no-session -- npm run sam:deploy:dev`
- Build: `npm run sam:build`

## Next Steps / TODOs
- Audio feature integration tests (mentioned by user but no previous context available)
- Potentially uncomment and deploy WordsFunction, TranscriptionFunction when handlers are ready