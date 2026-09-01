const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { User, RefreshToken, AdminRefreshToken, Admin } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().min(10).max(15).required(),
  password: Joi.string().min(6).optional(),
  role: Joi.string().optional(),
  owner_user_id: Joi.number().optional().allow(''),
});
const adminRegisterSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().min(10).max(15).required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().required(), // can be email or mobile
  newPassword: Joi.string().min(6).required()
});


const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, email, mobile, password } = value;
    const { role, owner_user_id } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: email },
          { mobile: mobile }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Email or mobile number already registered'
      });
    }
    let hashedPassword;

    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    // Insert new user
    // Base payload (always included)
    const userPayload = {
      name,
      email,
      mobile,
      password: hashedPassword || null
    };

    // Only add role & owner_user_id if employee
    if (role === 'employee') {
      userPayload.role = 'employee';
      userPayload.owner_user_id = owner_user_id;
    }

    const newUser = await User.create(userPayload);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: newUser.id
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: 'Internal server error'
    });
  }
});

router.post('/adminRegister', async (req, res) => {
  try {
    const { error, value } = adminRegisterSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, email, mobile, password, role } = value;

    // Check if user already exists
    const existingAdmin = await Admin.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: email },
          { mobile: mobile }
        ]
      }
    });

    if (existingAdmin) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Email or mobile number already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user
    const newAdmin = await Admin.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      message: 'User registered successfully',
      userId: newAdmin.id,
      success: true
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Internal server error',
      success: false
    });
  }
});

router.put('/resetPassword', async (req, res) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { email, newPassword } = value;

    // Find user by email or mobile
    const admin = await Admin.findOne({
      where: {
        email: email
      }
    });

    if (!admin) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No admin found with that email or mobile'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await admin.update({ password: hashedPassword });

    res.status(200).json({
      message: 'Password reset successful',
      success: true
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'Internal server error',
      success: false
    });
  }
});

router.post('/adminLogin', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { email, password } = value;

    // Find user
    const admin = await Admin.findOne({
      where: { email }
    });

    if (!admin) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password incorrect',
        success: false
      });
    }


    // Check if user is active
    if (!admin.is_active) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended. Contact admin.',
        success: false
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password incorrect',
        success: false
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { adminId: admin.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await AdminRefreshToken.create({
      admin_id: admin.id,
      token: refreshToken,
      expires_at: expiresAt,
    });

    // Clean up expired tokens
    await RefreshToken.destroy({
      where: {
        [require('sequelize').Op.or]: [
          { expires_at: { [require('sequelize').Op.lt]: new Date() } },
          { user_id: admin.id }
        ]
      }
    });

    res.json({
      message: 'Admin Login successful',
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        role: admin.role,
        is_verified: admin.is_verified
      },
      accessToken,
      refreshToken,
      success: true
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error',
      success: false
    });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'No refresh token provided',
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if refresh token exists in database
    const tokenRecord = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        expires_at: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!tokenRecord) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Token not found or expired'
      });
    }

    // Get user details
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'name', 'email', 'is_active']
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'User not found or inactive',
        message: 'Invalid user'
      });
    }


    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid refresh token'
    });
  }
});

router.post('/adminRefresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'No refresh token provided',
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if refresh token exists in database
    const tokenRecord = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        expires_at: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!tokenRecord) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Token not found or expired'
      });
    }

    // Get user details
    const admin = await Admin.findByPk(decoded.userId, {
      attributes: ['id', 'name', 'email', 'role', 'is_active']
    });

    if (!admin || !admin.is_active) {
      return res.status(401).json({
        error: 'admin not found or inactive',
        message: 'Invalid admin'
      });
    }


    // Generate new access token
    const newAccessToken = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    const newRefreshToken = jwt.sign(
      { adminId: admin.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid refresh token'
    });
  }
});

// Logout user
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Remove specific refresh token
      await RefreshToken.destroy({
        where: {
          token: refreshToken,
          user_id: req.body.userId
        }
      });
    } else {
      // Remove all refresh tokens for user
      await RefreshToken.destroy({
        where: { user_id: req.body.userId }
      });
    }

    res.json({
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'Internal server error'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.body.userId, {
      attributes: ['id', 'name', 'email', 'mobile', 'is_verified', 'created_at']
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found'
      });
    }

    res.json({
      user
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: 'Internal server error'
    });
  }
});

router.get('/adminProfile', authenticateToken, async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.body.userId, {
      attributes: ['id', 'name', 'email', 'mobile', 'role', 'created_at']
    });

    if (!admin) {
      return res.status(404).json({
        error: 'admin not found',
        message: 'admin profile not found'
      });
    }

    res.json({
      admin
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: 'Internal server error'
    });
  }
});

module.exports = router;