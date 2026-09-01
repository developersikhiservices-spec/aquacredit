const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { User, RefreshToken, AdminRefreshToken, Admin } = require('../models');
const checkActiveSubscription = require('../middleware/checkActiveSubscription');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().min(10).max(15).required(),
  password: Joi.string().min(6).optional().allow(''),
  role: Joi.string().optional().allow(''),
  owner_user_id: Joi.number().optional().allow(''),
  businessName: Joi.string().optional().allow(''),
  nickName: Joi.string().optional().allow(''),
});
const adminRegisterSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().min(10).max(15).required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().required(),
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
    const { role, owner_user_id, businessName, nickName } = req.body;
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user
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
      userPayload.businessName = businessName;
      userPayload.nickName = nickName;
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
      success: true,
      error: 'Registration failed',
      message: 'Internal server error'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
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


router.get('/protected-route',
  checkActiveSubscription
);


module.exports = router;