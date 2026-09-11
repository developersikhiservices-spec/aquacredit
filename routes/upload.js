const express = require('express');

const {upload,processImage} = require('../middleware/upload');

const {processSingleFile,deleteFile} = require('../services/processUpload');

const {authenticateToken} = require('../middleware/auth');
const { bucket } = require('../config/storage');
const router = express.Router();

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

// router.use(authenticateToken);

/*
|--------------------------------------------------------------------------
| Upload customer photo
|--------------------------------------------------------------------------
|
| POST /customer-photo
| Form-data:
| photo = image
|
*/

router.post(
  '/customer-photo',
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a photo to upload'
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Only allow images for this endpoint
      |--------------------------------------------------------------------------
      */

      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: 'Customer photo must be an image'
        });
      }

      const uploaded = await processSingleFile(req.file);

      return res.json({
        message: 'Photo uploaded successfully',

        photo_path: uploaded.path,

        photo_url: uploaded.fullUrl,

        file_info: {
          filename: uploaded.filename,
          originalName: uploaded.originalName,
          mimetype: uploaded.mimeType,
          size: uploaded.size,
          path: uploaded.path,
          url: uploaded.fullUrl
        }
      });

    } catch (error) {
      console.error('Photo upload error:', error);

      return res.status(500).json({
        error: 'Photo upload failed',
        message: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Delete photo
|--------------------------------------------------------------------------
|
| DELETE /photo
|
| Body:
|
| {
|   "path": "images/abc-123.webp"
| }
|
*/

router.delete(
  '/photo',
  async (req, res) => {
    try {
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({
          error: 'File path required',
          message: 'Please provide the GCS file path'
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Only allow our known folders
      |--------------------------------------------------------------------------
      */

      if (
        !filePath.startsWith('images/') &&
        !filePath.startsWith('documents/')
      ) {
        return res.status(400).json({
          error: 'Invalid file path',
          message: 'Invalid GCS file path'
        });
      }

      const deleted = await deleteFile(filePath);

      if (!deleted) {
        return res.status(404).json({
          error: 'File not found',
          message: 'Photo does not exist in GCS'
        });
      }

      return res.json({
        message: 'Photo deleted successfully'
      });

    } catch (error) {
      console.error('Photo delete error:', error);

      return res.status(500).json({
        error: 'Photo delete failed',
        message: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Get photo info
|--------------------------------------------------------------------------
*/

router.get(
  '/photo-info',
  async (req, res) => {
    try {
      const filePath = req.query.path;

      if (!filePath) {
        return res.status(400).json({
          error: 'File path required'
        });
      }

      if (
        !filePath.startsWith('images/') &&
        !filePath.startsWith('documents/')
      ) {
        return res.status(400).json({
          error: 'Invalid file path'
        });
      }


      const file = bucket.file(filePath);

      const [exists] = await file.exists();

      if (!exists) {
        return res.status(404).json({
          error: 'File not found'
        });
      }

      const [metadata] = await file.getMetadata();

      return res.json({
        filename: filePath,
        size: Number(metadata.size),
        contentType: metadata.contentType,
        created: metadata.timeCreated,
        modified: metadata.updated,

        url:
          `https://storage.googleapis.com/` +
          `${bucket.name}/${filePath}`
      });

    } catch (error) {
      console.error('Photo info error:', error);

      return res.status(500).json({
        error: 'Failed to get photo info',
        message: error.message
      });
    }
  }
);

module.exports = router;
