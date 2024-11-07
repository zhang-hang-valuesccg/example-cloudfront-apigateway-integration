import {
  APIGatewayClient,
  CreateDeploymentCommand,
  UpdateRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { Handler } from "aws-lambda";

const restApiId = process.env.REST_API_ID || "";
const distrbutionId = process.env.DISTRIBUTION_ID || "";
const account = process.env.ACCOUNT || "";
const region = process.env.REGION || "";

export const handler: Handler = async (event, context) => {
  const cfClient = new CloudFrontClient({});
  const apiClient = new APIGatewayClient({});

  const refererNew = crypto.randomUUID();

  const policyNew = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: "*",
        },
        Action: "execute-api:Invoke",
        Resource: `arn:aws:execute-api:${region}:${account}:${restApiId}/*/*/*`,
      },
      {
        Effect: "Deny",
        Principal: {
          AWS: "*",
        },
        Action: "execute-api:Invoke",
        Resource: `arn:aws:execute-api:${region}:${account}:${restApiId}/*/*/*`,
        Condition: {
          StringNotEquals: {
            "aws:Referer": refererNew,
          },
        },
      },
    ],
  };

  try {
    // get current cloudfront config
    const cfGetCurrentConfigCommand = new GetDistributionConfigCommand({
      Id: distrbutionId,
    });
    const cfGetCurrentConfigRes = await cfClient.send(
      cfGetCurrentConfigCommand
    );

    let cfCurrentConfig = cfGetCurrentConfigRes.DistributionConfig;

    // only change the Referer header value
    if (
      cfCurrentConfig &&
      cfCurrentConfig.Origins &&
      cfCurrentConfig.Origins.Items &&
      cfCurrentConfig.Origins.Items[0].CustomHeaders &&
      cfCurrentConfig.Origins.Items[0].CustomHeaders.Items &&
      cfCurrentConfig.Origins.Items[0].CustomHeaders.Items[0]
    ) {
      cfCurrentConfig.Origins.Items[0].CustomHeaders.Items[0].HeaderValue =
        refererNew;
    }

    const cfUpdateCommand = new UpdateDistributionCommand({
      Id: distrbutionId,
      DistributionConfig: cfCurrentConfig,
      IfMatch: cfGetCurrentConfigRes.ETag,
    });

    const apiUpdateCommand = new UpdateRestApiCommand({
      restApiId: restApiId,
      patchOperations: [
        { op: "replace", path: "/policy", value: JSON.stringify(policyNew) },
      ],
    });

    // update the cloudfront custom header and api gateway policy
    await cfClient.send(cfUpdateCommand);
    await apiClient.send(apiUpdateCommand);

    // re-deploy the api to validate the policy change
    await apiClient.send(
      new CreateDeploymentCommand({
        restApiId: restApiId,
        stageName: "api",
      })
    );
  } catch (err) {
    throw Error(`${err}`);
  } finally {
    await cfClient.destroy();
    await apiClient.destroy();
  }
};
