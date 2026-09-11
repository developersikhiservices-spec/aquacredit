const express = require('express');

const {
  upload,
  processUploadedFile,
  multiProcessImage
} = require('../middleware/upload');

const {
  processSingleFile,
  processMultipleFiles,
  deleteFile
} = require('../services/processUpload');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Upload single file
|--------------------------------------------------------------------------
|
| POST /
| Form-data:
| file = image/pdf
|
*/

router.post(
  '/',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please upload a file (image or PDF)'
        });
      }

      const uploaded = await processSingleFile(req.file);

      return res.json({
        message: 'File uploaded successfully',

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
      console.error('Upload error:', error);

      return res.status(500).json({
        error: 'Upload failed',
        message: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Upload multiple files
|--------------------------------------------------------------------------
|
| POST /multi
| Form-data:
| files[] = images/pdf
|
*/

router.post(
  '/multi',
  upload.array('files', 10),
  multiProcessImage,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: 'No files uploaded',
          message: 'Please upload one or more files'
        });
      }

      const uploadedFiles = await processMultipleFiles(
        req.files
      );

      return res.json({
        message: 'Files uploaded successfully',

        files: uploadedFiles.map(file => ({
          filename: file.filename,
          originalName: file.originalName,
          mimetype: file.mimeType,
          size: file.size,
          path: file.path,
          url: file.fullUrl
        }))
      });

    } catch (error) {
      console.error('Multiple upload error:', error);

      return res.status(500).json({
        error: 'Upload failed',
        message: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Delete uploaded file
|--------------------------------------------------------------------------
|
| DELETE /upload/:filename
|
| IMPORTANT:
| The filename should be the GCS object path.
|
| Example:
| documents/abc-123.pdf
|
*/

router.delete(
  '/upload',
  async (req, res) => {
    try {
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({
          error: 'File path required',
          message: 'Please provide the GCS file path'
        });
      }

      const deleted = await deleteFile(filePath);

      if (!deleted) {
        return res.status(404).json({
          error: 'File not found',
          message: 'File does not exist in GCS'
        });
      }

      return res.json({
        message: 'File deleted successfully'
      });

    } catch (error) {
      console.error('Delete error:', error);

      return res.status(500).json({
        error: 'Delete failed',
        message: error.message
      });
    }
  }
);

module.exports = router;
