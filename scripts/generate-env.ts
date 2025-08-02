import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import * as path from 'path';

async function generateEnvFile(env: string): Promise<void> {
  try {
    const stackName = `english-learning-app-${env}`;
    const cloudFormation = new CloudFormationClient({ region: 'us-east-1' });

    // Get stack outputs
    const { Stacks } = await cloudFormation.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = Stacks?.[0];
    const outputs = stack?.Outputs || [];

    // Extract required values
    const apiEndpoint = outputs.find((output) => output.OutputKey === 'ApiEndpoint')?.OutputValue;
    const usersTableName = outputs.find(
      (output) => output.OutputKey === 'UsersTableName'
    )?.OutputValue;
    const wordsTableName = outputs.find(
      (output) => output.OutputKey === 'WordsTableName'
    )?.OutputValue;
    const transcriptionsTableName = outputs.find(
      (output) => output.OutputKey === 'TranscriptionsTableName'
    )?.OutputValue;
    const userProgressTableName = outputs.find(
      (output) => output.OutputKey === 'UserProgressTableName'
    )?.OutputValue;
    const audioFilesBucketName = outputs.find(
      (output) => output.OutputKey === 'AudioFilesBucketName'
    )?.OutputValue;

    if (!apiEndpoint || !usersTableName) {
      throw new Error('Required stack outputs not found: ApiEndpoint and UsersTableName are mandatory');
    }

    // Use fallback values for optional outputs that might not exist yet
    const fallbackWordsTableName = wordsTableName || `${env}-words`;
    const fallbackTranscriptionsTableName = transcriptionsTableName || `${env}-transcriptions`;
    const fallbackUserProgressTableName = userProgressTableName || `${env}-user-progress`;
    const fallbackAudioFilesBucketName = audioFilesBucketName || `${env}-english-learning-audio-files`;

    // Create .env file content
    const envContent = `API_ENDPOINT=${apiEndpoint}
USERS_TABLE_NAME=${usersTableName}
WORDS_TABLE_NAME=${fallbackWordsTableName}
TRANSCRIPTIONS_TABLE_NAME=${fallbackTranscriptionsTableName}
USER_PROGRESS_TABLE_NAME=${fallbackUserProgressTableName}
STORAGE_BUCKET_NAME=${fallbackAudioFilesBucketName}
AWS_REGION=us-east-1
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

generateEnvFile(env).catch((error) => {
  console.error('Failed to generate environment file:', error);
  process.exit(1);
});
