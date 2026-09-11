const { Storage } = require('@google-cloud/storage');
const path = require('path');

const bucketName = process.env.GCP_BUCKET_NAME;

if (!bucketName) {
  throw new Error('GCP_BUCKET_NAME is not configured');
}

// Option 1: Use GOOGLE_APPLICATION_CREDENTIALS
// Option 2: Fall back to ../service-account.json
const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : path.resolve(__dirname, '../service-account.json');

console.log('GCS configuration:', {
  bucketName,
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename,
});

const storage = new Storage({
  keyFilename,
  projectId: process.env.GCP_PROJECT_ID,
});

const bucket = storage.bucket(bucketName);

module.exports = {
  storage,
  bucket,
  bucketName,
};