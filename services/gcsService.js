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

module.exports = {
  uploadToGCS,
  deleteFromGCS,
};
