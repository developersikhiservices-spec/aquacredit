const express = require('express');
const path = require('path');
const fs = require('fs');
const { upload, processImage, deleteOldImage } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Upload customer photo
router.post('/customer-photo', upload.single('photo'), processImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a photo to upload'
      });
    }

    // Return the file path that can be stored in database
    const photoPath = req.file.filename;

    res.json({
      message: 'Photo uploaded successfully',
      photo_path: photoPath,
      file_info: {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
      }
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Photo upload error:', error);
    res.status(500).json({
      error: 'Photo upload failed',
      message: error.message
    });
  }
});

// Delete photo
router.delete('/photo/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Validate filename (security check)
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'Invalid filename provided'
      });
    }

    const filePath = path.join(__dirname, '../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'Photo file not found'
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.json({
      message: 'Photo deleted successfully'
    });

  } catch (error) {
    console.error('Photo delete error:', error);
    res.status(500).json({
      error: 'Photo delete failed',
      message: error.message
    });
  }
});

// Get photo info
router.get('/photo-info/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Validate filename
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'Invalid filename provided'
      });
    }

    const filePath = path.join(__dirname, '../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'Photo file not found'
      });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    
    res.json({
      filename: filename,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      url: `/uploads/${filename}`
    });

  } catch (error) {
    console.error('Photo info error:', error);
    res.status(500).json({
      error: 'Failed to get photo info',
      message: error.message
    });
  }
});

module.exports = router;