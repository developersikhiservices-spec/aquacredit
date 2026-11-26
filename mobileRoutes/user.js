const express = require('express');
const Joi = require('joi');
const { Transaction, User, Customer, Supplier, sequelize, ReferralTransaction } = require('../models');
const { Op, Sequelize } = require('sequelize');
const { sendSingleNotification } = require('./notification');
const router = express.Router();
const bcrypt = require("bcryptjs");

// Validation schemas
const userSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow('')
});

const employeeSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  email: Joi.string().email().optional().allow(''),
  password: Joi.string().min(6).optional(),
  photo: Joi.string().optional().allow(''),
  role: Joi.string().valid('employee').default('employee'),
  roleName: Joi.string().optional().allow(null, ''),
  ownerId: Joi.number().required(),          // fixed spelling
  permissions: Joi.string().optional().allow(null, '') // JSON string
});
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(255).required()
});

// Add new user
router.post('/', async (req, res) => {
  try {
    const { error, value } = userSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo } = value;
    // Check if user already exists for this business owner
    const existingUser = await User.findOne({
      where: {
        mobile: req.body.mobile,
      }
    });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'User with this name or mobile already exists'
      });
    }
    // Insert new user
    const newUser = await User.create({
      name,
      mobile,
      photo: photo || null
    });

    res.status(201).json({
      message: 'User added successfully',
      user: newUser
    });
    const payload = { title: `Welcome ${newUser.name}`, body: `Hi ${newUser.name}, we're glad to have you onboard!` }
    sendSingleNotification(newUser, payload);

  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      error: 'Failed to add user',
      message: 'Internal server error'
    });
  }
});

router.post('/employee', async (req, res) => {
  try {
    const { error, value } = userSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo } = value;
    // Check if user already exists for this business owner
    const existingUser = await User.findOne({
      where: {
        mobile: req.body.mobile,
      }
    });
    if (existingUser) {
      return res.status(409).json({
        error: 'Employee already exists',
        message: 'Employee with this name or mobile already exists'
      });
    }
    // Insert new user
    const newUser = await User.create({
      name,
      mobile,
      photo: photo || null,
      owner_user_id: req.body.owenId
    });

    res.status(201).json({
      message: 'Employee added successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Add Employee error:', error);
    res.status(500).json({
      error: 'Failed to add employee',
      message: 'Internal server error'
    });
  }
});

// Get all users for business owner
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = {};

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }

    // Get users with pagination
    const { rows: users, count: totalUsers } = await User.findAndCountAll({
      where: whereCondition,
      attributes: ['id', 'name', 'mobile', 'address', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at'],
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: 'Internal server error'
    });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const user = await User.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    res.json(
      user
    );

  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: 'Internal server error'
    });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const { name, mobile, email, businessName, nickName, businessType, address, GST, photo, is_active, is_verified, current_balance, total_credit_given, total_payment_got, status } = req.body;

    // Check if user exists and belongs to this business owner
    const existingUser = await User.findOne({
      where: {
        id: userId,
      }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    // Update user
    await User.update(req.body,
      {
        where: { id: userId }
      }
    );

    // Fetch updated user
    const updatedUser = await User.findByPk(userId);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: 'Internal server error'
    });
  }
});

router.put('/disableSubscription/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const existingUser = await User.findOne({
      where: { id: userId }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    if (!existingUser.isSubscribe) {
      return res.status(400).json({
        error: 'Already unsubscribed'
      });
    }

    // 🔹 Check if subscription exists
    if (!existingUser.subscribeEndAt) {
      return res.status(400).json({
        error: 'No active subscription',
        message: 'User does not have an active subscription'
      });
    }

    const now = new Date();
    const subscribeEndAt = new Date(existingUser.subscribeEndAt);

    // 🔹 Check if subscription is still active
    if (subscribeEndAt > now) {
      return res.status(400).json({
        error: 'Subscription still active',
        message: 'Cannot disable subscription before it expires'
      });
    }

    // 🔹 Disable subscription
    const userSubscribeData = {
      isSubscribe: false,
      subscribePlan: null,
      subscribeEndAt: null
    };

    await User.update(userSubscribeData, {
      where: { id: userId }
    });

    const updatedUser = await User.findByPk(userId);

    return res.json({
      message: 'Subscription disabled successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Disable subscription error:', error);
    return res.status(500).json({
      error: 'Failed to update user',
      message: 'Internal server error'
    });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Check if user exists and belongs to this business owner
    const existingUser = await User.findOne({
      where: {
        id: userId,
      }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    // Check if user has transactions
    const transactionCount = await Transaction.count({
      where: { user_id: userId }
    });

    if (transactionCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete user',
        message: 'User has existing transactions. Cannot delete.'
      });
    }

    // Delete user
    await User.destroy({
      where: { id: userId }
    });

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: 'Internal server error'
    });
  }
});

// Search users by name or mobile
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;

    if (!query || query.length < 1) {
      return res.status(400).json({
        error: 'Invalid search query',
        message: 'Search query must be at least 1 character'
      });
    }

    const searchTerm = `%${query}%`;

    const users = await User.findAll({
      where: {
        id: req.body.userId,
        [Op.or]: [
          { name: { [Op.like]: searchTerm } },
          { mobile: { [Op.like]: searchTerm } }
        ]
      },
      order: [['name', 'ASC']],
      limit: 20
    });

    res.json({
      users,
      searchQuery: query,
      totalResults: users.length
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error'
    });
  }
});

// Get user statistics
router.get('/stats/summary', async (req, res) => {
  try {
    // Get user statistics
    const { sequelize } = require('../models');

    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) as positive_balance_users,
        COUNT(CASE WHEN current_balance < 0 THEN 1 END) as negative_balance_users,
        COUNT(CASE WHEN current_balance = 0 THEN 1 END) as zero_balance_users,
        COALESCE(SUM(current_balance), 0) as total_outstanding,
        COALESCE(SUM(total_credit_given), 0) as total_credit_given,
        COALESCE(SUM(total_payment_got), 0) as total_payments_received
      FROM users 
      WHERE id = :userId
    `, {
      replacements: { id: req.body.userId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      statistics: stats[0]
    });

  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Internal server error'
    });
  }
});

router.post('/CreateReferral', async (req, res) => {
  const { referalCode, newUerId } = req.params;
  const useerData = await User.findOne({ where: { referral_code: referalCode } })
  if (referredById) {
    await ReferralTransaction.create({
      referrer_id: useerData.id,
      referred_user_id: newUerId,
      reward_amount: 50.00, // Set your reward amount
      status: 'pending'
    });
  }

  res.json({ success: true, user: newUerId });
});

router.get('/referral/validate/:code', async (req, res) => {
  const { code } = req.params;
  const referrer = await User.findOne({ where: { referral_code: code } });
  if (!referrer) return res.status(404).json({ success: false, message: 'Invalid referral code' });
  res.json({ success: true, referrer_id: referrer.id });
});

router.get('/referral/info', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'referral_code', 'referral_count', 'referral_earnings', 'current_balance']
    });
    const shareLink = `https://play.google.com/store/apps/details?id=com.yourpackage.id&referrer=${user.referral_code}`;
    res.json({ success: true, data: { ...user.toJSON(), shareLink } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/referral/complete', async (req, res) => {
  const user = req.user;
  const pendingTx = await ReferralTransaction.findOne({
    where: { referred_user_id: user.id, status: 'pending' }
  });
  if (!pendingTx) return res.json({ success: false, message: 'No pending referral' });

  // Update transaction
  await pendingTx.update({ status: 'completed', completed_at: new Date() });

  // Add reward to referrer's balance
  const referrer = await User.findByPk(pendingTx.referrer_id);
  await referrer.increment({
    referral_earnings: pendingTx.reward_amount,
    referral_count: 1
  });

  res.json({ success: true, message: 'Referral rewarded' });
});

router.put("/:id/secure-code", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { secureCode } = req.body;

    if (!secureCode) {
      return res.status(400).json({
        success: false,
        message: "Secure code is required",
      });
    }

    // Validate 6 digits
    if (!/^\d{6}$/.test(secureCode)) {
      return res.status(400).json({
        success: false,
        message: "Secure code must be exactly 6 digits",
      });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedCode = await bcrypt.hash(secureCode, 12);

    await user.update({
      secureCode: hashedCode,
    });

    res.status(200).json({
      success: true,
      message: "Secure code updated successfully",
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/:id/verify-secure-code", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { secureCode } = req.body;

    if (!secureCode) {
      return res.status(400).json({
        success: false,
        message: "Secure code is required",
      });
    }

    const user = await Admin.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.secureCode) {
      return res.status(400).json({
        success: false,
        message: "Secure code not set",
      });
    }

    const isMatch = await bcrypt.compare(
      secureCode,
      user.secureCode
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid secure code",
        matched: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "Secure code verified successfully",
      matched: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;