import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {

  aws_iam,
  aws_s3,
  aws_secretsmanager,
  aws_cloudfront,
} from "aws-cdk-lib";
import { Distribution, AllowedMethods, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as crypto from 'crypto';

export class YtbDownloadAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

        // Create an S3 bucket
        const bucket = new aws_s3.Bucket(this, 'app-s3-bucket', {
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        
      
        // Add lifecycle rule for automatic deletion after x days
        bucket.addLifecycleRule({
          expiration: cdk.Duration.days(1), // Set the number of days after which objects should be deleted
        });

    
        // Generate public and private key pair
        const { publicKey, privateKey } = this.generateKeyPair();
    
    
        // Put public key in secrets manager
        const publicKeySecret = new aws_secretsmanager.Secret(this, 'PublicKeySecret', {
          secretName: 'app-public-key', // Specify your secret name
          secretObjectValue: {
            appPublicKey: cdk.SecretValue.unsafePlainText(publicKey.toString()),
          }
        });
    
    
        // Put private key in secrets manager
        const privateKeySecret = new aws_secretsmanager.Secret(this, 'PrivateKeySecret', {
          secretName: 'app-private-key', // Specify your secret name
          secretObjectValue: {
            appPrivateKey: cdk.SecretValue.unsafePlainText(privateKey.toString()),
          }
        });
    
        
        // Create a CloudFront public key
        const cloudfrontPublicKey = new aws_cloudfront.PublicKey(this, 'app-public-key', {
          encodedKey: publicKey, // Replace with your actual public key
          comment: 'Cloudfront public key for signing URLs',
        });
        
    
        // Create a CloudFront key group
        const keyGroup = new aws_cloudfront.KeyGroup(this, 'app-key-group', {
          items: [cloudfrontPublicKey], // Associate the public key with the key group
        });
    
    

        // Create Cloudfront distribution
        const distribution = new Distribution(this, 'CloudFrontDistribution', {
          defaultBehavior: {
            origin: new S3Origin(bucket, {}),
            originRequestPolicy: aws_cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
            compress: true,
            allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            trustedKeyGroups: [
                keyGroup
            ]
          }
        });
        
        


        // Create CloudFront origin access control
        const oac = new cdk.aws_cloudfront.CfnOriginAccessControl(
          this,
          'app-oac', {
            originAccessControlConfig: {
              name: id + '_OAC',
              originAccessControlOriginType: 's3',
              signingBehavior: 'always',
              signingProtocol: 'sigv4'
            }
          }
        );
        
      
        // Attach the Origin Access Control we created earlier
        let cf_distro = distribution.node.defaultChild as cdk.aws_cloudfront.CfnDistribution;
        cf_distro.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', oac.getAtt('Id'))
        cf_distro.addPropertyOverride('DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity','');
    


        // Retrieve the CloudFront distribution ID
        const cloudFrontDistributionId = distribution.distributionId;


        // Construct the CloudFront distribution ARN
        const cloudFrontDistributionArn = `arn:aws:cloudfront:::${cloudFrontDistributionId}`;
        
        


        /*
        // Add policy to S3 bucket to allow access from the CloudFront CDN 
        bucket.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'AllowCloudFrontServicePrincipalReadOnly',
            effect: Effect.ALLOW,
            actions: [ 's3:GetObject' ],
            principals: [ new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com') ],
            resources: [ bucket.arnForObjects('*') ],
            conditions: {
              'StringEquals': {
                'AWS:SourceArn': cloudFrontDistributionArn
              }
            },
          })
        );
        */ 
      


        // Define the policy JSON
        const customS3PolicyJson = {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'VisualEditor0',
              Effect: 'Allow',
              Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
              Resource:  `arn:aws:s3:::${bucket.bucketName}/*`
            },
          ],
        };

        

        // Create a custom policy using the JSON
        const customS3Policy = new aws_iam.Policy(this, 'CustomS3Policy', {
          document: aws_iam.PolicyDocument.fromJson(customS3PolicyJson),
        });
    
        // Create app user with permissions to edit s3 buckets
        const appUser = new aws_iam.User(this, 'MyUser', {
          userName: 'app-user',  // Specify the username
        });
        
        // Attach permissions to the user
        appUser.attachInlinePolicy(customS3Policy);
    
        // Create app user access key 
        const accessKey = new aws_iam.CfnAccessKey(this, 'app-user-access-key', {
          userName: appUser.userName,
        });
        
    
        // Store app user access key in secrets manager
        const accessSecret = new aws_secretsmanager.Secret(this, 'app-user-access-secret', {
          secretName: 'app-user-access-secret',  // Specify the secret name
          secretObjectValue: {
            appUserAccessKey: cdk.SecretValue.unsafePlainText(accessKey.ref),
          }
        });
    
        
        // Store app user secret key in secrets manager
        const secretKeySecret = new aws_secretsmanager.Secret(this, 'app-user-secret-key', {
          secretName: 'app-user-secret-key',  // Specify the secret name
          secretObjectValue: {
            appUserSecretKey: cdk.SecretValue.unsafePlainText(accessKey.attrSecretAccessKey),
          }
        });
    
    
        // Store bucket name in secrets manager
        const bucketNameSecret = new aws_secretsmanager.Secret(this, 'app-user-bucket-secret', {
          secretName: 'app-user-bucket-secret',  // Specify the secret name
          secretObjectValue: {
            appBucketName: cdk.SecretValue.unsafePlainText(bucket.bucketName),
          }
        });
        
    
        // Store public key Id in secrets manager
        const keyPairIdSecret = new aws_secretsmanager.Secret(this, 'app-user-pubkey-id-secret', {
          secretName: 'app-user-pubkey-id-secret',  // Specify the secret name
          secretObjectValue: {
            appPubKeyId: cdk.SecretValue.unsafePlainText(cloudfrontPublicKey.publicKeyId),
          }
        });
    
    
        // Store CloudFront distribution domain in secrets manager
        const cloudFrontDomainSecret = new aws_secretsmanager.Secret(this, 'app-cloudfront-domain-secret', {
          secretName: 'app-cloudfront-domain-secret',  // Specify the secret name
          secretObjectValue: {
            appCloudFrontDomain: cdk.SecretValue.unsafePlainText(distribution.domainName),
          }
        });
    
        // Print out bucket name
        new cdk.CfnOutput(this, 'BucketNameOutput', {
          value: bucket.bucketName,
          description: 'S3 Bucket name'
        });

        // Print out Cloudfront ID 
        new cdk.CfnOutput(this, 'CloudfrontIdOutput', {
          value: distribution.distributionId,
          description: 'Cloudfront Distribution Id'
        });


        // Define an output for the AWS account number
        new cdk.CfnOutput(this, 'AccountIdOutput', {
          value: cdk.Aws.ACCOUNT_ID,
          description: 'AWS Account ID',
        });
  }





  // Function to generator Private and Public Keypair
  private generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    return { publicKey, privateKey };
  }
}



