# English Learning App Backend

This is the backend service for the English Learning Application, built using AWS SAM and following Clean Architecture principles.

## Project Structure

The project follows Clean Architecture principles with the following layers:

- **Domain**: Contains business entities and repository interfaces
- **Application**: Contains use cases and business logic
- **Infrastructure**: Contains implementations of repositories and external services
- **Presentation**: Contains API definitions and controllers

## Prerequisites

- Node.js 18.x or later
- AWS SAM CLI
- AWS CLI configured with appropriate credentials

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Deploy to AWS:
```bash
npm run deploy
```

## Development

The project uses TypeScript and follows these conventions:

- Use interfaces for repository definitions
- Implement use cases in the application layer
- Keep business logic in the domain layer
- Handle infrastructure concerns in the infrastructure layer

## API Documentation

The API is documented using OpenAPI 3.0.1 specification in `src/presentation/openapi.yml`.

## Testing

Run tests using:
```bash
npm test
```

## License

MIT 