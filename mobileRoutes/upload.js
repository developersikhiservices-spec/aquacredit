const express = require('express');
const path = require('path');
const fs = require('fs');
const { upload, processImage, deleteOldImage, multiProcessImage } = require('../middleware/upload');

const router = express.Router();

// ✅ Upload route for photo or PDF
router.post('/', upload.single('file'), processImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a file (image or PDF)'
      });
    }

    res.json({
      message: 'File uploaded successfully',
      file_info: {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      }
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

router.post(
  '/multi',
  upload.array('files', 10),
  multiProcessImage,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: 'No files uploaded',
          message: 'Please upload one or more files (image or PDF)'
        });
      }

      const uploadedFiles = req.files.map(file => ({
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path
      }));

      return res.json({
        message: 'Files uploaded successfully',
        files: uploadedFiles
      });

    } catch (error) {
      // Cleanup uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      return res.status(500).json({
        error: 'Upload failed',
        message: error.message
      });
    }
  }
);


// ✅ Delete uploaded file
router.delete('/upload/:filename', (req, res) => {
  const filename = req.params.filename;

  // Validate filename
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({
      error: 'Invalid filename',
      message: 'Filename must be safe and valid'
    });
  }

  // Use the shared middleware function
  deleteOldImage(`upload/${filename}`);

  res.json({
    message: 'File deleted successfully'
  });
});
module.exports = router;
