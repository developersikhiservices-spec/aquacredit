const express = require('express');
const Joi = require('joi');
const { Payment, Transaction, sequelize } = require('../models');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const paymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().max(5).optional(),
});

// Record new payment
router.post('/', async (req, res) => {
  try {
    const { error, value } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message,
      });
    }

    const { razorpay_order_id, amount, currency } = value;

    // Create payment
    const newPayment = await Payment.create(
      {
        razorpay_order_id,
        amount,
        currency: currency || 'INR',
        status: 'PENDING',
      },
    );

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

// Get all payments (with optional transaction filter)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let whereCondition = {};
    if (status) whereCondition.status = status;

    // Get payments with transaction info
    const { rows: payments, count: totalPayments } = await Payment.findAndCountAll({
      where: whereCondition,
      order: [['payment_date', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(totalPayments / limit);

    res.json({
      payments,
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
router.patch('/:id/status', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const { status, razorpay_payment_id, error_message } = req.body;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    payment.status = status || payment.status;
    if (razorpay_payment_id) payment.razorpay_payment_id = razorpay_payment_id;
    if (error_message) payment.error_message = error_message;

    await payment.save();

    res.json({ message: 'Payment updated successfully', payment });
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(500).json({
      error: 'Failed to update payment',
      message: 'Internal server error',
    });
  }
});

// Delete payment
router.delete('/:id', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await Payment.destroy({ where: { id: paymentId }});

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({
      error: 'Failed to delete payment',
      message: 'Internal server error',
    });
  }
});

// Get payment by ID
router.get('/:id', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (err) {
    console.error('Get payment error:', err);
    res.status(500).json({
      error: 'Failed to fetch payment',
      message: 'Internal server error',
    });
  }
});

module.exports = router;
