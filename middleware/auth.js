const jwt = require('jsonwebtoken');
const { User, Admin } = require('../models');

const authenticateToken = async (req, res, next) => {
  let user;

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.userId) {
      console.log("USER:::", decoded.userId);
      user = await User.findByPk(decoded.userId, {
        attributes: ['id', 'name', 'email', 'is_active', 'is_verified']
      });
    } else if (decoded.adminId) {
      console.log("ADMIN :::", decoded.adminId);
      user = await Admin.findByPk(decoded.adminId, {
        attributes: ['id', 'name', 'email', 'mobile', 'role', 'is_active']
      });
    }

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended'
      });
    }

    req.user = user; // Attach user info to the request
    next();

  } catch (error) {
    console.error("JWT Verification Error:", error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please refresh your token'
      });
    }

    return res.status(403).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
};


const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};