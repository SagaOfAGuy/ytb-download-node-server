import ytdl from 'ytdl-core'
import { S3Client, S3, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { promises as fsPromises } from 'fs';


// Function to generate download link
export async function getDownloadLink(url) {
  try {
      let info = await ytdl.getInfo(url);
      let videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highestvideo', filter: 'audioandvideo' });
      console.log(videoFormat); 
      const result = {
        downloadUrl: videoFormat.url,
        videoInfo: info
      }
      return result; 
  } catch(error) {
      console.error('Error', error);
      throw error; 
  }
}

// Function to grab the secret name from AWS credentials manager
export async function getSecret(secretName, region) {
  const client = new SecretsManagerClient({ region });
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: "AWSCURRENT",
      })
    );
    return response.SecretString;
  } catch (error) {
    console.error("Error retrieving secret:", error);
    throw error;
  }
}


// Function to grab s3 client object
export async function s3client(accessKey, secretKey,region) {
  return new S3Client({
      credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
      },
      region: region

  }); 
}

// Function to create buffer for file
export async function readFileToBuffer(filePath) {
  try {
    const fileBuffer = await fsPromises.readFile(filePath);
    return fileBuffer;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}