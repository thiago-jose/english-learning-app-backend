import { CloudFormation } from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';

interface EnvConfig {
  [key: string]: string;
}

async function generateEnvFile(env: string): Promise<void> {
  try {
    const stackName = `english-learning-app-backend-${env}`;
    const cloudFormation = new CloudFormation();

    // Get stack outputs
    const { Stacks } = await cloudFormation.describeStacks({ StackName: stackName }).promise();
    const stack = Stacks?.[0];

    if (!stack) {
      throw new Error(`Stack ${stackName} not found`);
    }

    // Get environment configuration
    const envsPath = path.resolve(process.cwd(), 'sam_envs.json');
    const envsConfig = JSON.parse(fs.readFileSync(envsPath, 'utf-8'));
    const envConfig = envsConfig[env];

    if (!envConfig) {
      throw new Error(`Environment configuration not found for ${env}`);
    }

    // Combine stack outputs and environment configuration
    const envVars: EnvConfig = {
      NODE_ENV: env,
      AWS_REGION: process.env.AWS_REGION || 'us-east-1',
      ...envConfig.Parameters,
    };

    // Add stack outputs
    stack.Outputs?.forEach((output) => {
      if (output.OutputKey && output.OutputValue) {
        envVars[output.OutputKey] = output.OutputValue;
      }
    });

    // Generate .env file content
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Write to .env file
    const envFilePath = path.resolve(process.cwd(), `.env.${env}`);
    fs.writeFileSync(envFilePath, envContent);

    console.log(`Generated .env.${env} file successfully`);
  } catch (error) {
    console.error('Error generating environment file:', error);
    process.exit(1);
  }
}

// Get environment from command line argument
const env = process.argv[2];
if (!env) {
  console.error('Please provide an environment name (dev, test, or prod)');
  process.exit(1);
}

generateEnvFile(env);
