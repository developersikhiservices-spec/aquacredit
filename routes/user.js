const express = require('express');
const Joi = require('joi');
const { Transaction, User } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
// router.use(authorizeRole('business_owner', 'admin'));

// Validation schemas
const userSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow('')
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
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: name },
          { mobile: mobile }
        ]
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
      business_owner_id: req.body.userId,
      name,
      mobile,
      photo: photo || null
    });

    res.status(201).json({
      message: 'User added successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      error: 'Failed to add user',
      message: 'Internal server error'
    });
  }
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

// Get all users for business owner
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Apply balance filter

    const { rows: users, count: totalUsers } = await User.findAndCountAll({
      attributes: [
        'id',
        'name',
        'mobile',
        'photo',
        'current_balance',
        'total_credit_given',
        'total_payment_got',
        'created_at',
        'updated_at',
        'status',
        'is_verified'
      ],
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNext: page * limit < totalUsers,
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
        business_owner_id: req.body.userId
      },
      attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at']
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    res.json({
      user
    });

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
    // Check if user exists and belongs to this business owner
    const existingUser = await User.findOne({
      where: {
        id: userId,
        // business_owner_id: req.body.userId
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

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Check if user exists and belongs to this business owner
    const existingUser = await User.findOne({
      where: {
        id: userId,
        business_owner_id: req.body.userId
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
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: { [Op.like]: searchTerm } },
          { mobile: { [Op.like]: searchTerm } }
        ]
      },
      attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at'],
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
      WHERE business_owner_id = :businessOwnerId
    `, {
      replacements: { businessOwnerId: req.body.userId },
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

module.exports = router;