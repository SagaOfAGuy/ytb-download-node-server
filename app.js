import express, { json } from 'express';
import cors from 'cors'; 
import { getDownloadLink, getSecret, readFileToBuffer } from './utils.js'
import ytdl from 'ytdl-core';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import axios from 'axios';
import fs from 'fs'; 
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'; 
import pkg from '@aws-sdk/lib-storage';
const { upload } = pkg;


// Create express web server
const app = express();
const server = http.createServer(app);


// Grab secrets created
var accessKeyId = JSON.parse(await getSecret('app-user-access-secret','us-east-1'))['appUserAccessKey'];
var secretAccessKey =  JSON.parse(await getSecret('app-user-secret-key', 'us-east-1'))['appUserSecretKey']; 
var bucket = JSON.parse(await getSecret('app-user-bucket-secret', 'us-east-1'))['appBucketName']; 
var cloudfrontDomain = JSON.parse(await getSecret('app-cloudfront-domain-secret','us-east-1'))['appCloudFrontDomain'];
var privateKey = JSON.parse(await getSecret('app-private-key','us-east-1'))['appPrivateKey'];
var keyPairId = JSON.parse(await getSecret('app-user-pubkey-id-secret','us-east-1'))['appPubKeyId']; 

const cors = require('cors');

/*
// CORS options to allow GET and POST requests from youtube.com domain
const corsOptions = {
	origin: '*',
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Length','Accept-Ranges','Origin', 'Content-Type', 'Content-Disposition'],
};
*/ 

/*
// Apply CORS option to the express app
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); 
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
	next();
});
*/ 

app.use(cors());

/*
app.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); 
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
    res.sendStatus(204);
	next();
});
*/ 



// Use the CORS options for all routes
//app.use(cors(corsOptions));


// Allow express to parse JSON
app.use(json());


// Endpoint to generate the download link
app.post('/getLink', cors(),/*cors(corsOptions),*/ async(req,res) => {
	// Get the data from client request
	const data = req.body

	// Data for request
	//console.log(data); 


	// Extract the youtube video URL from data object 
	const youtubeLink = data['link']; 
	
	// Debug for youtube link
	//console.log(youtubeLink); 


	// Extract the download link for the youtube video URL 
	const info = await getDownloadLink(youtubeLink);
	

	// Grab download link and youtube video title
	const downloadLink = info['downloadUrl'];	
	const videoTitle = info['videoInfo'].player_response.videoDetails.title; 
	

	// Grab the video stream
	const videoStream = ytdl(youtubeLink, { quality: 'highest', filter: 'audioandvideo' });
	const filename = `${videoTitle.replace(/[^\w\s]/g, '_').replace(/ /g,"_")}.mp4`

	
	// function to download youtube video
	const downloadVideo = async () => {
		try {
		  const response = await axios({
			url: downloadLink,
			method: 'GET',
			responseType: 'stream',
		  });
	  
		  const totalLength = response.headers['content-length'];
		  let downloadedLength = 0;
		  
		  const writeStream = fs.createWriteStream(filename);
		  
		  response.data.on('data', chunk => {
			downloadedLength += chunk.length;
			var progressData = (downloadedLength / totalLength) * 100;


			//console.log(`Download progress: ${progressData.toFixed(2)}%`);
		  });
		  
		  response.data.pipe(writeStream);
	  
		  return new Promise((resolve, reject) => {
			writeStream.on('finish', resolve);
			writeStream.on('error', reject);
		  });
		} catch (error) {
		  console.error('Error downloading video:', error);
		}
	};


	// Function to validate download 
	downloadVideo()
	  .then(async () => {
		var s3 = new S3Client({
			region: "us-east-1",
			credentials: {
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});
		
		// Filestream for youtube video
		const fileStream = await fs.promises.readFile(`./${filename}`);


		// The PUT command we will send the s3 bucket
		const uploadCommand = new PutObjectCommand({
			Bucket: bucket,
			Key: `${filename}`,
			Body: fileStream,
		}); 
		

		// Wait until file is uploaded to s3
		await s3.send(uploadCommand); 


		// Get the file path of the current module
		const currentFilePath = fileURLToPath(import.meta.url);


		// Get the directory name
		const currentDir = dirname(currentFilePath);
		
		// Debug for current directory
		//console.log(currentDir); 
		

		// Delete file locally on server
		fs.unlink(`${currentDir}/${filename}`, (err) => {
			if (err) {
			  console.error('Error deleting file:', err);
			} else {
			  console.log(`File ${filename} deleted successfully`);
			}
		});
		
		
		// Create CloudFront signed URL
		const cloudFrontUrl = getSignedUrl({
			url:`https://${cloudfrontDomain}/${filename}`,
			dateLessThan: new Date(Date.now() + 1000 * 60 * 5),
			privateKey: privateKey,
			keyPairId: keyPairId
		});
		res.status(200).send({cloudfront: cloudFrontUrl}); 
		res.end(); 
		console.log("Closing connection..."); 
	});
});

// Define port to listen on. Default port is 8080. 
const port = process.env.PORT || 3000;


// Listen on defined port 
app.listen(port, function () {
	console.log('Server running at http://127.0.0.1:' + port + '/');
});