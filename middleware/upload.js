const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed MIME types
const allowedTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf' // ✅ Added PDF support
];

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images and PDFs are allowed'), false);
  }
};

// Create multer instance
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
  },
  fileFilter
});

// Middleware: Process image only if not PDF
const processImage = async (req, res, next) => {
  if (!req.file) return next();

  const isImage = req.file.mimetype.startsWith('image/');
  if (!isImage) return next(); // Skip sharp for PDFs

  try {
    const inputPath = req.file.path;
    const outputPath = path.join(uploadsDir, 'processed-' + req.file.filename);

    // Resize & optimize with sharp
    await sharp(inputPath)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toFile(outputPath);

    // Delete original image
    fs.unlinkSync(inputPath);

    // Update req.file with processed path & name
    req.file.path = outputPath;
    req.file.filename = 'processed-' + req.file.filename;

    next();
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Image processing failed',
      message: error.message
    });
  }
};

const multiProcessImage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const processedFiles = [];

    for (const file of req.files) {
      const isImage = file.mimetype.startsWith('image/');

      const originalPath = file.path;

      // Skip non-image files (PDF etc.)
      if (!isImage) {
        processedFiles.push(file);
        continue;
      }

      const processedPath = path.join(uploadsDir, `processed-${file.filename}`);

      // Process image with Sharp
      await sharp(originalPath)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFormat('jpeg', { quality: 85 })
        .toFile(processedPath);

      // Delete original file
      if (fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }

      // Push updated file info
      processedFiles.push({
        ...file,
        filename: `processed-${file.filename}`,
        path: processedPath
      });
    }

    // Replace req.files with the processed ones
    req.files = processedFiles;

    next();
  } catch (error) {
    // Cleanup if something goes wrong
    if (req.files) {
      req.files.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    return res.status(500).json({
      error: 'Image processing failed',
      message: error.message
    });
  }
};

// Delete file (used externally)
const deleteOldImage = (oldImagePath) => {
  
  const fullPath = path.join(__dirname, './uploads', oldImagePath);
  if (oldImagePath && fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }
};

module.exports = {
  upload,
  processImage,
  multiProcessImage,
  deleteOldImage
};
