import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Configure AWS SDK
AWS.config.update({ region: 'us-east-1' });

interface EnvConfig {
  apiEndpoint: string;
  usersTableName: string;
}

async function generateEnvFile(env: string): Promise<void> {
  try {
    const stackName = `english-learning-app-${env}`;
    const cloudFormation = new AWS.CloudFormation();

    // Get stack outputs
    const { Stacks } = await cloudFormation.describeStacks({ StackName: stackName }).promise();
    const stack = Stacks?.[0];
    const outputs = stack?.Outputs || [];

    // Extract required values
    const apiEndpoint = outputs.find(output => output.OutputKey === 'ApiEndpoint')?.OutputValue;
    const usersTableName = outputs.find(output => output.OutputKey === 'UsersTableName')?.OutputValue;

    if (!apiEndpoint || !usersTableName) {
      throw new Error('Required stack outputs not found');
    }

    // Create .env file content
    const envContent = `API_ENDPOINT=${apiEndpoint}
USERS_TABLE_NAME=${usersTableName}
NODE_ENV=${env}
`;

    // Write to .env file
    const envPath = path.join(process.cwd(), '.env');
    fs.writeFileSync(envPath, envContent);

    console.log(`Environment file generated successfully for ${env} environment`);
  } catch (error) {
    console.error('Error generating environment file:', error);
    throw error;
  }
}

// Get environment from command line argument
const env = process.argv[2];
if (!env) {
  console.error('Please provide an environment (dev or prod)');
  process.exit(1);
}

generateEnvFile(env).catch(error => {
  console.error('Failed to generate environment file:', error);
  process.exit(1);
});
