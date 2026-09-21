const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { bucket } = require('../config/storage');
const { default: processImageBuffer } = require('../utils/imageProcessor');

/*
|--------------------------------------------------------------------------
| Generate unique filename
|--------------------------------------------------------------------------
*/

const generateFilename = (originalName, extension = null) => {
  const originalExt = path.extname(originalName).toLowerCase();

  const ext = extension || originalExt || '';

  return `${uuidv4()}-${Date.now()}${ext}`;
};

/*
|--------------------------------------------------------------------------
| Upload Buffer → Google Cloud Storage
|--------------------------------------------------------------------------
*/

const uploadBufferToBucket = async ({
  buffer,
  filename,
  folder,
  contentType
}) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Upload data must be a Buffer');
  }

  if (buffer.length === 0) {
    throw new Error('Upload buffer is empty');
  }

  const filePath = `${folder}/${filename}`;

  console.log('Uploading to GCS:', {
    bucket: bucket.name,
    filePath,
    contentType,
    size: buffer.length
  });

  const file = bucket.file(filePath);

  await file.save(buffer, {
    resumable: false,

    validation: false,

    metadata: {
      contentType,
      cacheControl: 'public,max-age=31536000'
    },

    preconditionOpts: {
      ifGenerationMatch: 0
    }
  });

  console.log('GCS upload successful:', filePath);

  return {
    filename,
    path: filePath,

    fullUrl:
      `https://storage.googleapis.com/` +
      `${bucket.name}/${filePath}`,

    contentType,
    size: buffer.length
  };
};

const processUploadedFileBuffer = async (buffer, options = {}) => {
  const {
    width = 1200,
    height = 1200,
    fit = 'inside',
    withoutEnlargement = true,
    outputFormat = 'webp',
    webpQuality = 75,
    jpegQuality = 85
  } = options;

  let pipeline = sharp(buffer).resize(width, height, {
    fit,
    withoutEnlargement
  });

  if (outputFormat === 'webp') {
    pipeline = pipeline.webp({
      quality: webpQuality
    });
  } else if (outputFormat === 'jpeg') {
    pipeline = pipeline.jpeg({
      quality: jpegQuality,
      progressive: true
    });
  }

  return pipeline.toBuffer();
};

/*
|--------------------------------------------------------------------------
| Process Image
|--------------------------------------------------------------------------
*/

const processSingleImage = async (file) => {
  if (!file || !file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Image buffer is missing');
  }

  console.log('Processing image:', {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.buffer.length
  });

  // Process image using the image-processing helper
  const processedBuffer = await processImageBuffer(file.buffer, {
    width: 1200,
    height: 1200,
    fit: 'inside',
    withoutEnlargement: true,
    outputFormat: 'webp',
    webpQuality: 75
  });

  console.log('Image processed:', {
    originalSize: file.buffer.length,
    processedSize: processedBuffer.length
  });

  const filename = generateFilename(
    file.originalname,
    '.webp'
  );

  const uploaded = await uploadBufferToBucket({
    buffer: processedBuffer,
    filename,
    folder: 'images',
    contentType: 'image/webp'
  });

  return {
    ...uploaded,
    originalName: file.originalname,
    mimeType: 'image/webp',
    size: processedBuffer.length
  };
};

/*
|--------------------------------------------------------------------------
| Process PDF
|--------------------------------------------------------------------------
*/

const processSingleDocument = async (file) => {
  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Document buffer is missing');
  }

  console.log('Processing document:', {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.buffer.length
  });

  /*
  |--------------------------------------------------------------------------
  | Validate PDF signature
  |--------------------------------------------------------------------------
  */

  const isPdf =
    file.buffer.length >= 5 &&
    file.buffer.subarray(0, 5).toString() === '%PDF-';

  if (!isPdf) {
    throw new Error('Uploaded file is not a valid PDF');
  }

  const filename = generateFilename(
    file.originalname,
    '.pdf'
  );

  const uploaded = await uploadBufferToBucket({
    buffer: file.buffer,
    filename,
    folder: 'documents',
    contentType: 'application/pdf'
  });

  return {
    ...uploaded,
    originalName: file.originalname,
    mimeType: 'application/pdf',
    size: file.buffer.length
  };
};

/*
|--------------------------------------------------------------------------
| Process Single File
|--------------------------------------------------------------------------
*/

const processSingleFile = async (file) => {
  if (!file) {
    throw new Error('No file provided');
  }

  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error('File buffer is missing');
  }

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  /*
  |--------------------------------------------------------------------------
  | PDF
  |--------------------------------------------------------------------------
  |
  | We check extension as well as MIME type.
  | This handles Chrome/client MIME differences.
  |
  */

  if (
    file.mimetype === 'application/pdf' ||
    extension === '.pdf'
  ) {
    return processSingleDocument(file);
  }

  /*
  |--------------------------------------------------------------------------
  | Image
  |--------------------------------------------------------------------------
  */

  if (file.mimetype.startsWith('image/')) {
    return processSingleImage(file);
  }

  throw new Error(
    `Unsupported file type: ${file.mimetype}`
  );
};

/*
|--------------------------------------------------------------------------
| Process Multiple Files
|--------------------------------------------------------------------------
*/

const processMultipleFiles = async (files) => {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }

  const results = [];

  for (const file of files) {
    const result = await processSingleFile(file);
    results.push(result);
  }

  return results;
};

/*
|--------------------------------------------------------------------------
| Delete File from GCS
|--------------------------------------------------------------------------
*/

const deleteFile = async (filePath) => {
  if (!filePath) {
    throw new Error('File path is required');
  }

  /*
  |--------------------------------------------------------------------------
  | Security validation
  |--------------------------------------------------------------------------
  */

  if (
    filePath.includes('..') ||
    filePath.startsWith('/') ||
    filePath.includes('\\')
  ) {
    throw new Error('Invalid file path');
  }

  const file = bucket.file(filePath);

  const [exists] = await file.exists();

  if (!exists) {
    return false;
  }

  await file.delete();

  console.log('GCS file deleted:', filePath);

  return true;
};

module.exports = {
  processSingleFile,
  processSingleImage, 
  processUploadedFileBuffer,
  processSingleDocument,
  processMultipleFiles,
  uploadBufferToBucket,
  deleteFile
};