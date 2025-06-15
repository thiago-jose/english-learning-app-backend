import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function generateTypes(): Promise<void> {
  try {
    await execAsync('npm run generate-types');
    console.log('Types generated successfully');
  } catch (error) {
    console.error('Error generating types:', error);
    throw error;
  }
}

// Helper function to convert OpenAPI types to our domain types
export function mapOpenApiTypeToDomain<T>(openApiData: any): T {
  return {
    ...openApiData,
    createdAt: openApiData.createdAt ? new Date(openApiData.createdAt) : new Date(),
    updatedAt: openApiData.updatedAt ? new Date(openApiData.updatedAt) : new Date(),
  } as T;
} 