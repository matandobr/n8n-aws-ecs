import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export class N8nStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'N8nVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, 'N8nCluster', {
      vpc,
    });

    const dbSecret = new secretsmanager.Secret(this, 'N8nDbSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'n8n' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'N8nDbSecurityGroup', {
      vpc,
      description: 'Security group for n8n PostgreSQL database',
      allowAllOutbound: true,
    });

    const dbParameterGroup = new rds.ParameterGroup(this, 'N8nDbParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      parameters: {
        'rds.force_ssl': '0',
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, 'N8nDbInstance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'n8n',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false,
      publiclyAccessible: false,
      port: 5432,
      parameterGroup: dbParameterGroup,
    });

    if (!process.env.DOMAIN_NAME) {
      throw new Error('DOMAIN_NAME environment variable is required');
    }

    if (!process.env.N8N_BASIC_AUTH_PASSWORD) {
      throw new Error('N8N_BASIC_AUTH_PASSWORD environment variable is required');
    }

    if (!process.env.N8N_ENCRYPTION_KEY) {
      throw new Error('N8N_ENCRYPTION_KEY environment variable is required');
    }

    const certificate = new certificatemanager.Certificate(this, 'N8nCertificate', {
      domainName: process.env.DOMAIN_NAME,
      validation: certificatemanager.CertificateValidation.fromDns(),
    });

    const n8nService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'N8nService', {
      cluster,
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('n8nio/n8n'),
        containerPort: 5678,
        environment: {},
        secrets: {
          DB_POSTGRESDB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        },
      },
      publicLoadBalancer: true,
      certificate,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      listenerPort: 443,
    });

    n8nService.loadBalancer.addListener('HttpRedirectListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: elbv2.ApplicationProtocol.HTTPS,
        permanent: true,
      }),
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const container = n8nService.taskDefinition.defaultContainer;
    if (container) {
      const envVars: Record<string, string> = {
        N8N_BASIC_AUTH_ACTIVE: 'true',
        N8N_BASIC_AUTH_USER: process.env.N8N_BASIC_AUTH_USER || 'admin',
        N8N_BASIC_AUTH_PASSWORD: process.env.N8N_BASIC_AUTH_PASSWORD,
        N8N_HOST: '0.0.0.0',
        N8N_PORT: '5678',
        N8N_PROTOCOL: 'https',
        N8N_EDITOR_BASE_URL: `https://${process.env.DOMAIN_NAME}`,
        WEBHOOK_URL: `https://${process.env.DOMAIN_NAME}`,
        N8N_ENCRYPTION_KEY: process.env.N8N_ENCRYPTION_KEY,
        N8N_SECURE_COOKIE: 'true',
        N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false',
        DB_TYPE: 'postgresdb',
        DB_POSTGRESDB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_POSTGRESDB_PORT: '5432',
        DB_POSTGRESDB_DATABASE: 'n8n',
        DB_POSTGRESDB_USER: 'n8n',
        DB_POSTGRESDB_SSL: 'false',
      };

      Object.entries(envVars).forEach(([key, value]) => {
        container.addEnvironment(key, value);
      });
    }

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from VPC'
    );

    n8nService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(5678));

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: n8nService.loadBalancer.loadBalancerDnsName,
    });
  }
}
