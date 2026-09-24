const express = require('express');
const Joi = require('joi');
const moment = require('moment');
const { Transaction, Customer, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { createTransaction } = require('../controller/transactionController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(authorizeRole('business_owner', 'admin'));

// Validation schemas
const transactionSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  transaction_type: Joi.string().valid('you_gave', 'you_got','you_discount').required(),
  amount: Joi.number().positive().precision(2).required(),
  description: Joi.string().max(1000).optional().allow(''),
  ownerId: Joi.number().integer().positive().required(),
  userId: Joi.number().integer().positive().required()
});

// Record new transaction
router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }
    const { customer_id, transaction_type, amount, description,ownerId } = value;

    // Verify customer belongs to this business owner
    const customer = await Customer.findOne({
      where: {
        id: customer_id,
        business_owner_id: ownerId
      },
      transaction: t
    });

    if (!customer) {
      await t.rollback();
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Insert transaction
    const newTransaction = await Transaction.create({
      business_owner_id: ownerId,
      created_user:req.body.userId,
      customer_id,
      transaction_type,
      amount,
      description: description || null
    }, { transaction: t });


    // Update customer balances
    let newBalance = parseFloat(customer.current_balance);
    let newCreditGiven = parseFloat(customer.total_credit_given);
    let newPaymentReceived = parseFloat(customer.total_payment_got);

    if (transaction_type === 'you_gave') {
      // Money lent to customer (increases their debt to you)
      newBalance += amount;
      newCreditGiven += amount;
    } else if (transaction_type === 'you_got') {
      // Payment received from customer (decreases their debt)
      newBalance -= amount;
      newPaymentReceived += amount;
    }

    // Update customer record
    await Customer.update({
      current_balance: newBalance,
      total_credit_given: newCreditGiven,
      total_payment_got: newPaymentReceived
    }, {
      where: { id: customer_id },
      transaction: t
    });

    await t.commit();
    await createTransaction(newTransaction.get({ plain: true }),userData);
    // Fetch the created transaction with customer details
    const transactionWithCustomer = await Transaction.findByPk(newTransaction.id, {
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['name', 'mobile']
      }]
    });

    res.status(201).json({
      message: 'Transaction recorded successfully',
      transaction: transactionWithCustomer
    });

  } catch (error) {
    await t.rollback();
    console.error('Transaction error:', error);
    res.status(500).json({
      error: 'Failed to record transaction',
      message: 'Internal server error'
    });
  } finally {
  }
});

// Get all transactions for business owner
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const customerId = req.query.customer_id;
    const transactionType = req.query.type;

    let whereCondition = { business_owner_id: req.body.userId };

    if (customerId) {
      whereCondition.customer_id = customerId;
    }

    if (transactionType && ['you_gave', 'you_got'].includes(transactionType)) {
      whereCondition.transaction_type = transactionType;
    }

    // Get transactions with customer details
    const { rows: transactions, count: totalTransactions } = await Transaction.findAndCountAll({
      where: whereCondition,
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['name', 'mobile', 'photo']
      }],
      attributes: ['id', 'customer_id', 'transaction_type', 'amount', 'description', 'transaction_date', 'created_at'],
      order: [['transaction_date', 'DESC'], ['id', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalTransactions / limit);

    res.json({
      transactions,
      pagination: {
        currentPage: page,
        totalPages,
        totalTransactions,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({
      error: 'Failed to fetch transactions',
      message: 'Internal server error'
    });
  }
});

// Get customer ledger
router.get('/ledger/:customer_id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.customer_id);

    // Verify customer belongs to this business owner
    const customer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.userId
      },
      attributes: ['id', 'name', 'mobile', 'current_balance', 'total_credit_given', 'total_payment_got']
    });

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Get all transactions for this customer
    const transactions = await Transaction.findAll({
      where: {
        customer_id: customerId,
        business_owner_id: req.body.userId
      },
      attributes: ['id', 'transaction_type', 'amount', 'description', 'transaction_date', 'created_at'],
      order: [['transaction_date', 'DESC'], ['id', 'DESC']]
    });

    // Calculate running balance for each transaction
    let runningBalance = 0;
    const transactionsWithBalance = transactions.reverse().map(transaction => {
      if (transaction.transaction_type === 'you_gave') {
        runningBalance += parseFloat(transaction.amount);
      } else {
        runningBalance -= parseFloat(transaction.amount);
      }
      
      return {
        ...transaction,
        running_balance: runningBalance
      };
    }).reverse();

    res.json({
      customer,
      transactions: transactionsWithBalance,
      summary: {
        total_transactions: transactions.length,
        current_balance: customer.current_balance,
        total_credit_given: customer.total_credit_given,
        total_payment_got: customer.total_payment_got
      }
    });

  } catch (error) {
    console.error('Fetch ledger error:', error);
    res.status(500).json({
      error: 'Failed to fetch ledger',
      message: 'Internal server error'
    });
  }
});

// Get transaction summaries (Daily/Weekly/Monthly)
router.get('/summary/:period', async (req, res) => {
  try {
    const period = req.params.period;
    const customerId = req.query.customer_id;

    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({
        error: 'Invalid period',
        message: 'Period must be daily, weekly, or monthly'
      });
    }

    let dateFormat, dateInterval;
    switch (period) {
      case 'daily':
        dateFormat = '%Y-%m-%d';
        dateInterval = 'DAY';
        break;
      case 'weekly':
        dateFormat = '%Y-%u';
        dateInterval = 'WEEK';
        break;
      case 'monthly':
        dateFormat = '%Y-%m';
        dateInterval = 'MONTH';
        break;
    }

    let whereCondition = 'WHERE business_owner_id = :businessOwnerId';
    let replacements = { businessOwnerId: req.body.userId };

    if (customerId) {
      whereCondition += ' AND customer_id = :customerId';
      replacements.customerId = customerId;
    }

    // Get summary data
    const [summaryData] = await sequelize.query(`
      SELECT 
        DATE_FORMAT(transaction_date, '${dateFormat}') as period_label,
        SUM(CASE WHEN transaction_type = 'you_gave' THEN amount ELSE 0 END) as total_credit_given,
        SUM(CASE WHEN transaction_type = 'you_got' THEN amount ELSE 0 END) as total_payment_got,
        COUNT(*) as total_transactions,
        MIN(transaction_date) as period_start,
        MAX(transaction_date) as period_end
      FROM transactions 
      ${whereCondition}
      AND transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 ${dateInterval})
      GROUP BY DATE_FORMAT(transaction_date, '${dateFormat}')
      ORDER BY period_label DESC
      LIMIT 50
    `, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Calculate net amounts
    const summaryWithNet = summaryData.map(row => ({
      ...row,
      net_amount: parseFloat(row.total_credit_given) - parseFloat(row.total_payment_got)
    }));

    res.json({
      period,
      summary: summaryWithNet,
      customer_id: customerId || null
    });

  } catch (error) {
    console.error('Fetch summary error:', error);
    res.status(500).json({
      error: 'Failed to fetch summary',
      message: 'Internal server error'
    });
  }
});

// Get transaction statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const customerId = req.query.customer_id;

    let whereCondition = 'WHERE business_owner_id = :businessOwnerId';
    let replacements = { businessOwnerId: req.body.userId };

    if (customerId) {
      whereCondition += ' AND customer_id = :customerId';
      replacements.customerId = customerId;
    }

    // Get overall statistics
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN transaction_type = 'you_gave' THEN 1 END) as total_credit_transactions,
        COUNT(CASE WHEN transaction_type = 'you_got' THEN 1 END) as total_payment_transactions,
        COALESCE(SUM(CASE WHEN transaction_type = 'you_gave' THEN amount ELSE 0 END), 0) as total_credit_given,
        COALESCE(SUM(CASE WHEN transaction_type = 'you_got' THEN amount ELSE 0 END), 0) as total_payment_got,
        COALESCE(AVG(CASE WHEN transaction_type = 'you_gave' THEN amount END), 0) as avg_credit_amount,
        COALESCE(AVG(CASE WHEN transaction_type = 'you_got' THEN amount END), 0) as avg_payment_amount
      FROM transactions 
      ${whereCondition}
    `, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Get today's statistics
    const [todayStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as today_transactions,
        COALESCE(SUM(CASE WHEN transaction_type = 'you_gave' THEN amount ELSE 0 END), 0) as today_credit_given,
        COALESCE(SUM(CASE WHEN transaction_type = 'you_got' THEN amount ELSE 0 END), 0) as today_payment_received
      FROM transactions 
      ${whereCondition} AND DATE(transaction_date) = CURRENT_DATE
    `, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const result = {
      ...stats[0],
      ...todayStats[0],
      net_outstanding: parseFloat(stats[0].total_credit_given) - parseFloat(stats[0].total_payment_got),
      today_net: parseFloat(todayStats[0].today_credit_given) - parseFloat(todayStats[0].today_payment_received)
    };

    res.json({
      statistics: result,
      customer_id: customerId || null
    });

  } catch (error) {
    console.error('Transaction stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Internal server error'
    });
  }
});

// Delete transaction (with balance recalculation)
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const transactionId = parseInt(req.params.id);

    // Get transaction details
    const transaction = await Transaction.findOne({
      where: {
        id: transactionId,
        business_owner_id: req.body.userId
      },
      transaction: t
    });

    if (!transaction) {
      await t.rollback();
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found or access denied'
      });
    }

    // Get customer current balances
    const customer = await Customer.findByPk(transaction.customer_id, {
      attributes: ['current_balance', 'total_credit_given', 'total_payment_got'],
      transaction: t
    });

    // Reverse the transaction effects
    let newBalance = parseFloat(customer.current_balance);
    let newCreditGiven = parseFloat(customer.total_credit_given);
    let newPaymentReceived = parseFloat(customer.total_payment_got);

    if (transaction.transaction_type === 'you_gave') {
      newBalance -= transaction.amount;
      newCreditGiven -= transaction.amount;
    } else if (transaction.transaction_type === 'you_got') {
      newBalance += transaction.amount;
      newPaymentReceived -= transaction.amount;
    }

    // Update customer record
    await Customer.update({
      current_balance: newBalance,
      total_credit_given: newCreditGiven,
      total_payment_got: newPaymentReceived
    }, {
      where: { id: transaction.customer_id },
      transaction: t
    });

    // Delete transaction
    await Transaction.destroy({
      where: { id: transactionId },
      transaction: t
    });

    await t.commit();

    res.json({
      message: 'Transaction deleted successfully'
    });

  } catch (error) {
    await t.rollback();
    console.error('Delete transaction error:', error);
    res.status(500).json({
      error: 'Failed to delete transaction',
      message: 'Internal server error'
    });
  } finally {
  }
});

module.exports = router;