#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ExampleCloudfrontApigatewayIntegrationStack } from "../lib/example-cloudfront-apigateway-integration-stack";

const app = new cdk.App();
new ExampleCloudfrontApigatewayIntegrationStack(
  app,
  "ExampleCloudfrontApigatewayIntegrationStack",
  {
    env: { account: "024848468742", region: "ap-northeast-1" },
  }
);
