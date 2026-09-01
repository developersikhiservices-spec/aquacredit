const express = require('express');
const Joi = require('joi');
const { User, Customer, Transaction, Feedback, Notification, sequelize, Admin } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Apply authentication and admin role to all routes
// router.use(authenticateToken);
// router.use(authorizeRole('admin'));

router.post("/employee", async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;

    // Validation
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Name, email, mobile and password are required",
      });
    }

    // Check email already exists
    const existingEmail = await Admin.findOne({
      where: { email },
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
        message: "Please use another email address",
      });
    }

    // Check mobile already exists
    const existingMobile = await Admin.findOne({
      where: { mobile },
    });

    if (existingMobile) {
      return res.status(409).json({
        success: false,
        error: "Mobile already exists",
        message: "Please use another mobile number",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create employee
    const employee = await Admin.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      role: "employee",
      is_active: true,
    });

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        mobile: employee.mobile,
        role: employee.role,
        is_active: employee.is_active,
      },
    });

  } catch (error) {
    console.error("Create employee error:", error);

    res.status(500).json({
      success: false,
      error: "Employee creation failed",
      message: "Internal server error",
    });
  }
});

router.get("/employees", async (req, res) => {
  try {
    const employees = await Admin.findAll({
      where: {
        role: "employee",
      },
      attributes: {
        exclude: ["password"],
      },
      order: [["id", "DESC"]],
    });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error("Get employees error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch employees",
      message: "Internal server error",
    });
  }
});

router.get("/employees/:id", async (req, res) => {
  try {
    const employee = await Admin.findOne({
      where: {
        id: req.params.id,
        role: "employee",
      },
      attributes: {
        exclude: ["password"],
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    console.error("Get employee error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.put("/employees/:id/deactivate", async (req, res) => {
  try {
    const employee = await Admin.findOne({
      where: {
        id: req.params.id,
        role: "employee",
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    employee.is_active = false;
    await employee.save();

    res.status(200).json({
      success: true,
      message: "Employee deactivated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get user analytics
router.get('/users/analytics', async (req, res) => {
  try {
    // Get user statistics
    const [userStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN is_active = 0 THEN 1 END) as suspended_users,
        COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_users,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as new_signups_today,
        COUNT(CASE WHEN DATE(created_at) >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) THEN 1 END) as new_signups_week,
        COUNT(CASE WHEN DATE(created_at) >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) THEN 1 END) as new_signups_month
      FROM users
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    // Get monthly signups for the last 12 months
    const [monthlySignups] = await sequelize.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as signups
      FROM users
        AND created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      statistics: userStats[0],
      monthly_signups: monthlySignups
    });

  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch user analytics',
      message: 'Internal server error'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);

    const { name, mobile,email } = req.body;
    // Check if user exists and belongs to this business owner
    const existingAdmin = await Admin.findOne({
      where: {
        id: adminId,
      }
    });
    if (!existingAdmin) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or access denied'
      });
    }

    // Update user
    await Admin.update({ name, mobile,email },
      {
        where: { id: adminId }
      }
    );

    // Fetch updated user
    const updatedAdmin= await Admin.findByPk(adminId);

    res.json({
      message: 'Admin updated successfully',
      user: updatedAdmin
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: 'Internal server error'
    });
  }
});

router.put("/:id/password", async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: "Validation error",
        message: "Password is required",
      });
    }

    // Check if admin exists
    const existingAdmin = await Admin.findByPk(adminId);

    if (!existingAdmin) {
      return res.status(404).json({
        error: "User not found",
        message: "User not found",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password
    await Admin.update(
      { password: hashedPassword },
      {
        where: { id: adminId },
      }
    );

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {
    console.error("Update password error:", error);

    res.status(500).json({
      success: false,
      error: "Password update failed",
      message: "Internal server error",
    });
  }
});

// Get all users with pagination
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status; // 'active', 'suspended', 'unverified'

    let whereCondition = {};

    if (status === 'active') {
      whereCondition.is_active = true;
    } else if (status === 'suspended') {
      whereCondition.is_active = false;
    } else if (status === 'unverified') {
      whereCondition.is_verified = false;
    }

    // Get users
    const { rows: users, count: totalUsers } = await User.findAndCountAll({
      where: whereCondition,
      attributes: [
        'id', 'name', 'email', 'mobile', 'is_active', 'is_verified', 'created_at', 'updated_at',
        [sequelize.literal('(SELECT COUNT(*) FROM customers WHERE business_owner_id = User.id)'), 'customer_count'],
        [sequelize.literal('(SELECT COUNT(*) FROM transactions WHERE business_owner_id = User.id)'), 'transaction_count']
      ],
      order: [['created_at', 'DESC']],
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

// Suspend/Unsuspend user
router.patch('/users/:id/status', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'is_active must be a boolean value'
      });
    }

    // Check if user exists and is not admin
    const user = await User.findOne({
      where: {
        id: userId,
        role: { [Op.ne]: 'admin' }
      },
      attributes: ['id', 'name', 'email']
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or cannot modify admin users'
      });
    }

    // Update user status
    await User.update(
      { is_active },
      { where: { id: userId } }
    );

    // Create notification for the user
    const notificationTitle = is_active ? 'Account Activated' : 'Account Suspended';
    const notificationMessage = is_active 
      ? 'Your account has been activated by admin.' 
      : 'Your account has been suspended. Please contact support.';

    await Notification.create({
      user_id: userId,
      title: notificationTitle,
      message: notificationMessage,
      type: is_active ? 'success' : 'warning'
    });

    res.json({
      message: `User ${is_active ? 'activated' : 'suspended'} successfully`,
      user
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      error: 'Failed to update user status',
      message: 'Internal server error'
    });
  }
});

// Verify user
router.patch('/users/:id/verify', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { is_verified } = req.body;

    if (typeof is_verified !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid verification status',
        message: 'is_verified must be a boolean value'
      });
    }

    // Check if user exists
    const user = await User.findOne({
      where: {
        id: userId,
        role: { [Op.ne]: 'admin' }
      },
      attributes: ['id', 'name', 'email']
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found or cannot modify admin users'
      });
    }

    // Update user verification status
    await User.update(
      { is_verified },
      { where: { id: userId } }
    );

    // Create notification for the user
    const notificationTitle = is_verified ? 'Account Verified' : 'Verification Removed';
    const notificationMessage = is_verified 
      ? 'Your account has been verified by admin.' 
      : 'Your account verification has been removed.';

    await Notification.create({
      user_id: userId,
      title: notificationTitle,
      message: notificationMessage,
      type: is_verified ? 'success' : 'info'
    });

    res.json({
      message: `User ${is_verified ? 'verified' : 'unverified'} successfully`,
      user
    });

  } catch (error) {
    console.error('Update user verification error:', error);
    res.status(500).json({
      error: 'Failed to update user verification',
      message: 'Internal server error'
    });
  }
});

// Get all feedback
router.get('/feedback', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status; // 'pending', 'resolved', 'closed'

    let whereCondition = {};

    if (status && ['pending', 'resolved', 'closed'].includes(status)) {
      whereCondition.status = status;
    }

    // Get feedback with user details
    const { rows: feedback, count: totalFeedback } = await Feedback.findAndCountAll({
      where: whereCondition,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'email', 'mobile']
      }],
      attributes: ['id', 'subject', 'message', 'status', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalFeedback / limit);

    res.json({
      feedback,
      pagination: {
        currentPage: page,
        totalPages,
        totalFeedback,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch feedback error:', error);
    res.status(500).json({
      error: 'Failed to fetch feedback',
      message: 'Internal server error'
    });
  }
});

// Update feedback status
router.patch('/feedback/:id/status', async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['pending', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be pending, resolved, or closed'
      });
    }

    // Check if feedback exists
    const feedback = await Feedback.findByPk(feedbackId, {
      attributes: ['id', 'user_id']
    });

    if (!feedback) {
      return res.status(404).json({
        error: 'Feedback not found',
        message: 'Feedback not found'
      });
    }

    // Update feedback status
    await Feedback.update(
      { status },
      { where: { id: feedbackId } }
    );

    // Create notification for the user
    const statusMessages = {
      'pending': 'Your feedback is being reviewed.',
      'resolved': 'Your feedback has been resolved.',
      'closed': 'Your feedback has been closed.'
    };

    await Notification.create({
      user_id: feedback.user_id,
      title: 'Feedback Update',
      message: statusMessages[status],
      type: 'info'
    });

    res.json({
      message: 'Feedback status updated successfully'
    });

  } catch (error) {
    console.error('Update feedback status error:', error);
    res.status(500).json({
      error: 'Failed to update feedback status',
      message: 'Internal server error'
    });
  }
});

// Send notification to user(s)
router.post('/notifications/send', async (req, res) => {
  try {
    const { user_id, title, message, type, is_push } = req.body;

    // Validation
    if (!title || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Title and message are required'
      });
    }

    const validTypes = ['info', 'warning', 'success', 'error'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid notification type',
        message: 'Type must be one of: ' + validTypes.join(', ')
      });
    }

    if (user_id) {
      // Send to specific user
      const user = await User.findByPk(user_id, {
        attributes: ['id']
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User not found'
        });
      }

      await Notification.create({
        user_id,
        title,
        message,
        type: type || 'info',
        is_push: is_push || false
      });
    } else {
      // Send to all active business owners
      const activeUsers = await User.findAll({
        where: {
          role: 'business_owner',
          is_active: true
        },
        attributes: ['id']
      });

      const notifications = activeUsers.map(user => ({
        user_id: user.id,
        title,
        message,
        type: type || 'info',
        is_push: is_push || false
      }));

      await Notification.bulkCreate(notifications);
    }

    res.json({
      message: user_id ? 'Notification sent to user' : 'Notification sent to all users'
    });

  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({
      error: 'Failed to send notification',
      message: 'Internal server error'
    });
  }
});

// Get platform statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    // Get comprehensive platform statistics
    const [platformStats] = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'business_owner') as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'business_owner' AND is_active = 1) as active_users,
        (SELECT COUNT(*) FROM users WHERE role = 'business_owner' AND DATE(created_at) = CURRENT_DATE) as new_signups_today,
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        (SELECT COUNT(*) FROM feedback WHERE status = 'pending') as pending_feedback,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE transaction_type = 'you_gave') as total_credit_given,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE transaction_type = 'you_got') as total_payments_received
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    // Get daily activity for the last 7 days
    const [dailyActivity] = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transactions
      FROM transactions
      WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    const stats = platformStats[0];
    stats.net_platform_amount = parseFloat(stats.total_credit_given) - parseFloat(stats.total_payments_received);

    res.json({
      platform_statistics: stats,
      daily_activity: dailyActivity
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: 'Internal server error'
    });
  }
});

router.delete("/employees/:id", async (req, res) => {
  try {
    const employee = await Admin.findOne({
      where: {
        id: req.params.id,
        role: "employee",
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    await employee.destroy();

    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete employee error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;