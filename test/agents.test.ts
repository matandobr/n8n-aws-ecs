// import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { N8nStack } from '../lib/n8n-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/agents-stack.ts
test('N8n Stack Created', () => {
  const app = new cdk.App();
  const stack = new N8nStack(app, 'TestN8nStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::ECS::Service', 1);
  template.resourceCountIs('AWS::RDS::DBInstance', 1);
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
});
