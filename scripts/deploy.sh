#!/bin/bash

# Default values
ENV="dev"
REGION="us-east-1"
STACK_NAME="english-learning-app-backend-$ENV"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ ! "$ENV" =~ ^(dev|test|prod)$ ]]; then
  echo "Invalid environment. Must be one of: dev, test, prod"
  exit 1
fi

# Read environment configuration
ENV_CONFIG=$(jq -r ".$ENV" sam_envs.json)
if [ "$ENV_CONFIG" == "null" ]; then
  echo "Environment configuration not found for $ENV"
  exit 1
fi

# Extract parameters and tags
PARAMS=$(echo "$ENV_CONFIG" | jq -r '.Parameters | to_entries | map("\(.key)=\(.value)") | join(" ")')
TAGS=$(echo "$ENV_CONFIG" | jq -r '.Tags | to_entries | map("\(.key)=\(.value)") | join(" ")')

# Build the SAM deploy command
CMD="sam deploy \
  --stack-name $STACK_NAME \
  --region $REGION \
  --parameter-overrides $PARAMS \
  --tags $TAGS \
  --no-fail-on-empty-changeset"

# Execute the command
echo "Deploying to $ENV environment..."
eval $CMD 