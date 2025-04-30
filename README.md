# n8n on AWS ECS

This project deploys n8n (workflow automation tool) on AWS ECS Fargate with HTTPS support.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- AWS CDK installed (`npm install -g aws-cdk`)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.local.template` to `.env.local` and fill in your values:
   ```bash
   cp .env.local.template .env.local
   ```
4. Edit `.env.local` with your configuration:
   - `DOMAIN_NAME`: Your domain name (e.g., example.com)
   - `N8N_BASIC_AUTH_USER`: Username for n8n basic auth
   - `N8N_BASIC_AUTH_PASSWORD`: Password for n8n basic auth
   - `N8N_ENCRYPTION_KEY`: Encryption key for n8n

## Deployment

1. Bootstrap your AWS environment (if not already done):
   ```bash
   cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION
   ```

2. Deploy the stack:
   ```bash
   cdk deploy
   ```

3. After deployment, you'll receive:
   - Load Balancer DNS name
   - Service URL

4. Configure DNS:
   - Create a CNAME record in your DNS provider pointing your domain to the Load Balancer DNS name
   - Wait for ACM certificate validation (can take up to 30 minutes)

## Architecture

The stack creates:
- VPC with public and private subnets
- ECS Fargate cluster
- RDS PostgreSQL database
- Application Load Balancer with HTTPS support
- ACM Certificate for your domain
- n8n service with basic authentication

## Security

- Database is in private subnets
- HTTPS enforced with automatic HTTP to HTTPS redirect
- Basic authentication enabled
- Secure cookies enabled
- Database credentials stored in AWS Secrets Manager

## Cleanup

To remove all resources:
```bash
cdk destroy
```
