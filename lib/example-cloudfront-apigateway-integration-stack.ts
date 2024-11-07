import * as cdk from "aws-cdk-lib";
import { LambdaIntegration, RestApi, Stage } from "aws-cdk-lib/aws-apigateway";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { RestApiOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import {
  AnyPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class ExampleCloudfrontApigatewayIntegrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const referer = "super_complex_random_string";

    const helloworldFn = new NodejsFunction(this, "example-helloworld-fn", {
      entry: "lambda/index.ts",
      runtime: Runtime.NODEJS_20_X,
    });

    const apiPolicy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: ["execute-api:Invoke"],
          effect: Effect.ALLOW,
          principals: [new AnyPrincipal()],
          resources: [`execute-api:/*/*/*`],
        }),
        new PolicyStatement({
          actions: ["execute-api:Invoke"],
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          resources: [`execute-api:/*/*/*`],
          conditions: {
            StringNotEquals: {
              "aws:Referer": referer,
            },
          },
        }),
      ],
    });

    const api = new RestApi(this, "example-restapi", {
      policy: apiPolicy,
      deployOptions: {
        stageName: "api",
      },
    });

    const apiHelloworld = api.root.addResource("helloworld");

    apiHelloworld.addMethod("GET", new LambdaIntegration(helloworldFn));

    const distribution = new Distribution(this, "example-distribution", {
      defaultBehavior: {
        origin: new RestApiOrigin(api, {
          customHeaders: {
            Referer: referer,
          },
        }),
      },
    });

    const refererUpdaterFn = new NodejsFunction(
      this,
      "example-referer-updater",
      {
        entry: "lambda/referer-updater.ts",
        runtime: Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        environment: {
          REST_API_ID: api.restApiId,
          DISTRIBUTION_ID: distribution.distributionId,
          ACCOUNT: props?.env?.account || "",
          REGION: props?.env?.region || "",
        },
      }
    );

    distribution.grant(refererUpdaterFn, "cloudfront:*");
    refererUpdaterFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "apigateway:PATCH",
          "apigateway:POST",
          "apigateway:UpdateRestApiPolicy",
        ],
        effect: Effect.ALLOW,
        resources: ["arn:aws:apigateway:*::/*"],
      })
    );

    new Rule(this, "example-auto-invoke", {
      schedule: Schedule.cron({
        hour: "15",
        minute: "0",
        weekDay: "FRI",
      }),
      targets: [
        new LambdaFunction(refererUpdaterFn, {
          retryAttempts: 0,
        }),
      ],
    });
  }
}
