// paymentRoutes.js
const express = require('express');
const Joi = require('joi');
const { Payment, Subscription, User, Plan, SubscriptionMember } = require('../models');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { Op } = require('sequelize');
const moment = require('moment');

const router = express.Router();

// Validation schemas
const paymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().max(5).optional().default('INR'),
  subscriber_name: Joi.string().optional(),
  subscriber_email: Joi.string().email().optional(),
  subscriber_phone: Joi.string().optional(),
  subscribePlan: Joi.string().optional(),
  purchased_user_count: Joi.number().integer().min(1).default(1)
});

const statusUpdateSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'SUCCESS', 'FAILED').required(),
  razorpay_payment_id: Joi.string().optional(),
  error_message: Joi.string().optional().allow('')
});

// Record new payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { error, value } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
      });
    }

    const { razorpay_order_id, amount, currency, subscriber_name, subscriber_email, subscriber_phone, subscribePlan, purchased_user_count } = value;

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      where: { razorpay_order_id }
    });

    if (existingPayment) {
      return res.status(409).json({
        error: 'Duplicate payment',
        message: 'Payment with this order ID already exists'
      });
    }

    // Create payment
    const newPayment = await Payment.create({
      razorpay_order_id,
      amount,
      currency: currency || 'INR',
      status: 'PENDING',
      subscriber_name,
      subscriber_email,
      subscriber_phone,
      subscribePlan,
      purchased_user_count
    });

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment: newPayment,
    });
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({
      error: 'Failed to create payment',
      message: 'Internal server error',
    });
  }
});

// Get all payments (with optional filters)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let whereCondition = {};
    
    if (status) whereCondition.status = status;
    
    if (search) {
      whereCondition[Op.or] = [
        { razorpay_order_id: { [Op.like]: `%${search}%` } },
        { razorpay_payment_id: { [Op.like]: `%${search}%` } },
        { subscriber_name: { [Op.like]: `%${search}%` } },
        { subscriber_email: { [Op.like]: `%${search}%` } },
        { subscriber_phone: { [Op.like]: `%${search}%` } },
        { subscribePlan: { [Op.like]: `%${search}%` } }
      ];
    }

    if (startDate || endDate) {
      whereCondition.payment_date = {};
      if (startDate) whereCondition.payment_date[Op.gte] = new Date(startDate);
      if (endDate) whereCondition.payment_date[Op.lte] = new Date(endDate);
    }

    // Get payments with pagination
    const { rows: payments, count: totalPayments } = await Payment.findAndCountAll({
      where: whereCondition,
      order: [['payment_date', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    // Calculate statistics
    const statistics = await Payment.findAll({
      where: whereCondition,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('status')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      group: ['status']
    });

    const totalPages = Math.ceil(totalPayments / limit);

    res.json({
      payments,
      statistics,
      pagination: {
        currentPage: page,
        totalPages,
        totalPayments,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error('Fetch payments error:', err);
    res.status(500).json({
      error: 'Failed to fetch payments',
      message: 'Internal server error',
    });
  }
});

// Update payment status
router.put('/:id/status', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { error, value } = statusUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
      });
    }

    const paymentId = parseInt(req.params.id);
    const { status, razorpay_payment_id, error_message } = value;

    const payment = await Payment.findByPk(paymentId, { transaction });
    if (!payment) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment
    payment.status = status;
    if (razorpay_payment_id) payment.razorpay_payment_id = razorpay_payment_id;
    if (error_message !== undefined) payment.error_message = error_message;
    
    await payment.save({ transaction });

    // If payment is successful, create subscription
    if (status === 'SUCCESS' && payment.subscriber_phone) {
      const user = await User.findOne({
        where: { mobile: payment.subscriber_phone },
        transaction
      });

      if (user) {
        const plan = await Plan.findOne({
          where: { name: payment.subscribePlan },
          transaction
        });

        if (plan) {
          // Check for existing active subscription
          const existingSubscription = await Subscription.findOne({
            where: { 
              user_id: user.id, 
              is_active: true 
            },
            transaction
          });

          if (!existingSubscription) {
            const endDate = moment().add(plan.duration_days, 'days').toDate();
            
            // Create subscription
            const subscription = await Subscription.create({
              user_id: user.id,
              plan_id: plan.id,
              purchased_user_count: payment.purchased_user_count || 1,
              total_price: payment.amount,
              start_date: moment().format("YYYY-MM-DD"),
              end_date: moment(endDate).format("YYYY-MM-DD"),
              is_active: true,
              is_cancelled: false
            }, { transaction });

            // Add the main user as a subscription member
            await SubscriptionMember.create({
              subscription_id: subscription.id,
              user_id: user.id
            }, { transaction });

            // Update user record
            await user.update({
              isSubscribe: true,
              subscribePlan: plan.name,
              subscribeEndAt: endDate
            }, { transaction });
          }
        }
      }
    }

    await transaction.commit();
    res.json({ message: 'Payment updated successfully', payment });

  } catch (err) {
    await transaction.rollback();
    console.error('Update payment error:', err);
    res.status(500).json({
      error: 'Failed to update payment',
      message: 'Internal server error',
    });
  }
});

// Get payment statistics
router.get('/statistics/summary', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let whereCondition = {};
    if (startDate || endDate) {
      whereCondition.payment_date = {};
      if (startDate) whereCondition.payment_date[Op.gte] = new Date(startDate);
      if (endDate) whereCondition.payment_date[Op.lte] = new Date(endDate);
    }

    const statistics = await Payment.findAll({
      where: whereCondition,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('status')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      group: ['status']
    });

    const totalRevenue = await Payment.sum('amount', {
      where: {
        ...whereCondition,
        status: 'SUCCESS'
      }
    });

    const dailyRevenue = await Payment.findAll({
      where: {
        ...whereCondition,
        status: 'SUCCESS'
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('payment_date')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'revenue']
      ],
      group: [sequelize.fn('DATE', sequelize.col('payment_date'))],
      order: [[sequelize.fn('DATE', sequelize.col('payment_date')), 'DESC']],
      limit: 30
    });

    res.json({
      statistics,
      totalRevenue: totalRevenue || 0,
      dailyRevenue
    });

  } catch (err) {
    console.error('Get payment statistics error:', err);
    res.status(500).json({
      error: 'Failed to fetch payment statistics',
      message: 'Internal server error',
    });
  }
});

// Get payment by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // If payment is successful, fetch related subscription info
    let subscriptionInfo = null;
    if (payment.status === 'SUCCESS' && payment.subscriber_phone) {
      const user = await User.findOne({
        where: { mobile: payment.subscriber_phone },
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { is_active: true },
          required: false,
          include: [{
            model: Plan,
            as: 'planDetails'
          }]
        }]
      });
      
      if (user && user.subscriptions && user.subscriptions.length > 0) {
        subscriptionInfo = user.subscriptions[0];
      }
    }

    res.json({
      payment,
      subscription: subscriptionInfo
    });
  } catch (err) {
    console.error('Get payment error:', err);
    res.status(500).json({
      error: 'Failed to fetch payment',
      message: 'Internal server error',
    });
  }
});

// Delete payment (admin only)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await Payment.destroy({ where: { id: paymentId } });

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({
      error: 'Failed to delete payment',
      message: 'Internal server error',
    });
  }
});

module.exports = router;