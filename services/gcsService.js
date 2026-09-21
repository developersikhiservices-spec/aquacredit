const { bucket } = require('../config/storage');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a unique filename
 */
const generateFilename = (originalName) => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);

  const safeName = baseName
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  const uniqueId = crypto.randomBytes(8).toString('hex');

  return `${safeName}-${uniqueId}${ext}`;
};

/**
 * Upload buffer to Google Cloud Storage
 */
const uploadToGCS = async ({
  buffer,
  originalName,
  mimetype,
  folder = 'uploads',
}) => {
  const filename = generateFilename(originalName);

  const filePath = `${folder}/${filename}`;

  const file = bucket.file(filePath);

  await file.save(buffer, {
    metadata: {
      contentType: mimetype,
      cacheControl: 'public,max-age=31536000',
    },
    resumable: false,
  });

  return {
    filename,
    path: filePath,
    fullUrl: `https://storage.googleapis.com/${bucket.name}/${filePath}`,
    mimeType: mimetype,
    size: buffer.length,
  };
};

/**
 * Delete file from Google Cloud Storage
 */
const deleteFromGCS = async (filePath) => {
  const file = bucket.file(filePath);

  const [exists] = await file.exists();

  if (!exists) {
    return false;
  }

  await file.delete();

  return true;
};

/**
 * Generate a V4 signed URL for uploading a file.
 * @param {string} originalName - The original name of the file (e.g., 'profile.jpg').
 * @param {string} mimeType - The MIME type of the file (e.g., 'image/jpeg').
 * @param {string} subFolder - The folder in the bucket (e.g., 'images', 'documents').
 * @param {number} maxSizeBytes - The maximum file size in bytes (e.g., 10 * 1024 * 1024 for 10MB).
 * @returns {Promise<{url: string, filePath: string, requiredHeaders: object}>}
 */
const getUploadSignedUrl = async (originalName, mimeType, subFolder = 'uploads', maxSizeBytes = 10 * 1024 * 1024) => {
  console.log("subfolder::", subFolder);
  console.log("originalName::", originalName);
  console.log("mimeType::", mimeType);
  const ext = path.extname(originalName);
  // const uniqueId = uuidv4();
  // const fileName = `${uniqueId}-${Date.now()}${ext}`;
  const filePath = `${subFolder}/${originalName}`;
  const file = bucket.file(filePath);

  const options = {
    version: 'v4',
    action: 'write', // 'write' is for uploads (PUT)
    expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
    contentType: mimeType,
    // This header allows you to enforce a maximum file size on the client side.
    // The client MUST send this exact header with the same value when uploading.
    extensionHeaders: {
      'x-goog-content-length-range': `0,${maxSizeBytes}`,
    },
  };

  try {
    const [url] = await file.getSignedUrl(options);
    console.log(`✅ Generated signed upload URL for: ${filePath}`);

    // The client must send these headers when uploading to the signed URL.
    const requiredHeaders = {
      'Content-Type': mimeType,
      'x-goog-content-length-range': `0,${maxSizeBytes}`,
    };

    return {
      url,
      filename: originalName,
      filePath: `/${filePath}`,       // leading slash for DB storage
      requiredHeaders,
      fullUrl: `https://storage.googleapis.com/${bucket.name}/${filePath}`,
    };
  } catch (error) {
    console.error('❌ Failed to generate signed URL:', error);
    throw error;
  }
}
/**
 * Generate a V4 signed URL for reading/downloading a file.
 * @param {string} filePath - path inside the bucket (e.g. 'images/abc.webp')
 * @param {number} expiresInMs - expiry in ms (default 1 hour)
 */
const getReadSignedUrl = async (filePath, expiresInMs = 60 * 60 * 1000) => {
  // Normalize: strip leading slash if present
  const cleanPath = filePath.replace(/^\//, '');
  const file = bucket.file(cleanPath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${cleanPath}`);
  }

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',                      // 'read' for GET
    expires: Date.now() + expiresInMs,   // e.g. 1 hour
  });

  return url;
};

module.exports = {
  uploadToGCS,
  deleteFromGCS,
  getUploadSignedUrl,
  getReadSignedUrl
};
