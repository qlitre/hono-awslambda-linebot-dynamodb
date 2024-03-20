import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    // Lambda関数用のIAMロールを作成
    const lambdaRole = new iam.Role(this, 'MyLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // DynamoDBテーブルへのアクセス権限を持つカスタムポリシーを作成
    const policy = new iam.Policy(this, 'MyLambdaPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
          resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/MyWeight`],
        }),
      ],
    });

    // ロールにポリシーをアタッチ
    lambdaRole.attachInlinePolicy(policy);

    // Lambda基本実行ロールをアタッチ
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    const fn = new NodejsFunction(this, 'lambda', {
      entry: 'lambda/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
    })

    fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })
    
    new apigw.LambdaRestApi(this, 'myapi', {
      handler: fn,
    })
  }
}
