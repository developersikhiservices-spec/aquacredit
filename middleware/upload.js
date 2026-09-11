const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { processUploadedFileBuffer } = require('../services/processUpload');
/*
|--------------------------------------------------------------------------
| Allowed file types
|--------------------------------------------------------------------------
*/

const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',

  'application/pdf',

  // Excel support if required
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const allowedExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.xls',
  '.xlsx'
];

/*
|--------------------------------------------------------------------------
| Multer memory storage
|--------------------------------------------------------------------------
|
| Files are kept in memory as Buffer objects.
|
| req.file.buffer
| req.files[].buffer
|
| This is required for uploading directly to Google Cloud Storage.
|
*/

const storage = multer.memoryStorage();

/*
|--------------------------------------------------------------------------
| File Filter
|--------------------------------------------------------------------------
|
| We check both MIME type and file extension.
|
| This is especially useful for PDFs where some clients/browsers may
| send a different MIME type.
|
*/

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const mimeAllowed = allowedMimeTypes.includes(file.mimetype);
  const extensionAllowed = allowedExtensions.includes(ext);

  console.log('Incoming file:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: ext
  });

  if (mimeAllowed || extensionAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype} (${ext})`
      ),
      false
    );
  }
};

/*
|--------------------------------------------------------------------------
| Multer configuration
|--------------------------------------------------------------------------
*/

const upload = multer({
  storage,

  limits: {
    fileSize:
      parseInt(process.env.MAX_FILE_SIZE, 10) ||
      10 * 1024 * 1024
  },

  fileFilter
});

/*
|--------------------------------------------------------------------------
| Validate PDF signature
|--------------------------------------------------------------------------
|
| A real PDF normally starts with:
|
| %PDF-
|
| This gives us an additional safety check.
|
*/

const validatePdfBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }

  if (buffer.length < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString() === '%PDF-';
};

/*
|--------------------------------------------------------------------------
| Normalize file type
|--------------------------------------------------------------------------
|
| If a browser sends a PDF with a strange MIME type such as:
|
| application/octet-stream
|
| but the extension is .pdf, we normalize it to application/pdf.
|
*/

const normalizeFileType = (file) => {
  if (!file) {
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') {
    file.mimetype = 'application/pdf';
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    file.mimetype = 'image/jpeg';
  }

  if (ext === '.png') {
    file.mimetype = 'image/png';
  }

  if (ext === '.gif') {
    file.mimetype = 'image/gif';
  }

  if (ext === '.webp') {
    file.mimetype = 'image/webp';
  }
};

/*
|--------------------------------------------------------------------------
| Process single uploaded file
|--------------------------------------------------------------------------
*/

const processUploadedFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    normalizeFileType(req.file);

    console.log('Uploaded file:', {
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    if (req.file.mimetype === 'application/pdf') {
      const validPdf = validatePdfBuffer(req.file.buffer);

      if (!validPdf) {
        return res.status(400).json({
          error: 'Invalid PDF',
          message: 'The uploaded file is not a valid PDF'
        });
      }

      return next();
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return next();
    }

    const processedBuffer = await processUploadedFileBuffer(req.file.buffer, {
      width: 800,
      height: 800,
      fit: 'inside',
      withoutEnlargement: true,
      outputFormat: 'jpeg',
      jpegQuality: 85
    });

    req.file.buffer = processedBuffer;
    req.file.size = processedBuffer.length;
    req.file.mimetype = 'image/jpeg';

    const originalName = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname)
    );

    req.file.originalname = `${originalName}.jpg`;

    return next();

  } catch (error) {
    console.error('File processing error:', error);

    return res.status(500).json({
      error: 'File processing failed',
      message: error.message
    });
  }
};

/*
|--------------------------------------------------------------------------
| Process multiple files
|--------------------------------------------------------------------------
*/

const multiProcessImage = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    for (const file of req.files) {
      normalizeFileType(file);

      /*
      |--------------------------------------------------------------------------
      | PDF
      |--------------------------------------------------------------------------
      */

      if (file.mimetype === 'application/pdf') {
        const validPdf = validatePdfBuffer(file.buffer);

        if (!validPdf) {
          return res.status(400).json({
            error: 'Invalid PDF',
            message: `${file.originalname} is not a valid PDF`
          });
        }

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | Non-image
      |--------------------------------------------------------------------------
      */

      if (!file.mimetype.startsWith('image/')) {
        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | Process image
      |--------------------------------------------------------------------------
      */

      const processedBuffer = await sharp(file.buffer)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();

      file.buffer = processedBuffer;
      file.size = processedBuffer.length;
      file.mimetype = 'image/jpeg';

      const originalName = path.basename(
        file.originalname,
        path.extname(file.originalname)
      );

      file.originalname = `${originalName}.jpg`;
    }

    next();

  } catch (error) {
    console.error('Multiple file processing error:', error);

    return res.status(500).json({
      error: 'Image processing failed',
      message: error.message
    });
  }
};

/*
|--------------------------------------------------------------------------
| Delete old image
|--------------------------------------------------------------------------
|
| This is kept only for backward compatibility.
| Actual GCS deletion should be done through deleteFile()
| from service/processUpload.js
|
*/

const deleteOldImage = async () => {
  console.warn(
    'deleteOldImage() is deprecated. Use deleteFile() from processUpload.js'
  );
};

module.exports = {
  upload,
  processUploadedFile,
  multiProcessImage,
  deleteOldImage,
  validatePdfBuffer,
  normalizeFileType
};
