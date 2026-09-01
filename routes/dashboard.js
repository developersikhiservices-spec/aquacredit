const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { User, RefreshToken, Admin, Customer, Transaction } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const { Op, fn, col } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths, subDays, startOfDay } = require('date-fns');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const now = new Date();

    const startOfLastMonth = startOfMonth(subMonths(now, 1));
    const endOfLastMonth = endOfMonth(subMonths(now, 1));

    const startOfThisMonth = startOfMonth(now);
    const endOfThisMonth = endOfMonth(now);

    // Users
    const totalUsers = await User.findAndCountAll();
    const lastMonthUsers = await User.count({
      where: {
        created_at: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
    });
    const thisMonthUsers = await User.count({
      where: {
        created_at: {
          [Op.between]: [startOfThisMonth, endOfThisMonth],
        },
      },
    });

    // Customers
    const totalCustomers = await Customer.findAndCountAll({
      distinct: true,
      col: 'mobile',
    });
    const lastMonthCustomers = await Customer.count({
      where: {
        created_at: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
      distinct: true,
      col: 'mobile',
    });
    const thisMonthCustomers = await Customer.count({
      where: {
        created_at: {
          [Op.between]: [startOfThisMonth, endOfThisMonth],
        },
      },
      distinct: true,
      col: 'mobile',
    });

    // Suppliers
    const totalSuppliers = await Supplier.findAndCountAll({
      distinct: true,
      col: 'mobile',
    });
    const lastMonthSuppliers = await Supplier.count({
      where: {
        created_at: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
      distinct: true,
      col: 'mobile',
    });
    const thisMonthSuppliers = await Supplier.count({
      where: {
        created_at: {
          [Op.between]: [startOfThisMonth, endOfThisMonth],
        },
      },
      distinct: true,
      col: 'mobile',
    });

    // Transactions - sum of amounts
    const totalTransactionsAmount = await Transaction.sum('amount');

    const lastMonthTransactionsAmount = await Transaction.sum('amount', {
      where: {
        created_at: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
    });

    const thisMonthTransactionsAmount = await Transaction.sum('amount', {
      where: {
        created_at: {
          [Op.between]: [startOfThisMonth, endOfThisMonth],
        },
      },
    });

    const giveTransactionsAmount = await Transaction.sum('amount', {
      where: {
        transaction_type: 'you_gave',
      },
    });

    const gotTransactionsAmount = await Transaction.sum('amount', {
      where: {
        transaction_type: 'you_got',
      },
    });

    // Response
    res.status(200).json({
      success: true,
      message: 'Dashboard stats fetched successfully',
      Users: totalUsers,
      lastMonthUsers,
      thisMonthUsers,
      Customers: totalCustomers,
      lastMonthCustomers,
      thisMonthCustomers,
      Suppliers: totalSuppliers,
      lastMonthSuppliers,
      thisMonthSuppliers,
      totalTransactionsAmount,
      giveTransactionsAmount,
      gotTransactionsAmount,
      lastMonthTransactionsAmount,
      thisMonthTransactionsAmount
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});


router.get('/user-stats', async (req, res) => {
  try {
    // Parse the 'days' query param, fallback to 30
    const days = parseInt(req.query.days, 10) || 30;

    // Calculate the start date X days ago
    const fromDate = startOfDay(subDays(new Date(), days));

    // Total users
    const totalUsers = await User.count();
    const AllUsers = await User.findAll();
    const totalBalance = await User.sum('current_balance');

    // Users created in the last X days
    const recentUsers = await User.count({
      where: {
        created_at: {
          [Op.gte]: fromDate,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: `User stats for the last ${days} days`,
      totalUsers,
      AllUsers,
      recentUsersLastXDays: recentUsers,
      totalBalance
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});


router.get('/customer-stats', async (req, res) => {
  try {
    // Parse the 'days' query param, fallback to 30
    const days = parseInt(req.query.days, 10) || 30;

    // Calculate the start date X days ago
    const fromDate = startOfDay(subDays(new Date(), days));

    // Total users


    // 2. Total customer count grouped by mobile
    const totalCustomerGrouped = await Customer.findAll({
      attributes: [
        'mobile',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['mobile']
    });

    // 3. Recent customer count grouped by mobile (last 7 days)
    const recentCustomerGrouped = await Customer.findAll({
      attributes: [
        'mobile',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        created_at: {
          [Op.gte]: fromDate,
        }
      },
      group: ['mobile']
    });

    const Customers = await Customer.findAll({ order: [['mobile', 'DESC']] },);
    const totalCustomers = totalCustomerGrouped.length;
    const recentCustomersLastXDays = recentCustomerGrouped.length;
    const totalBalance = await Transaction.sum('amount', {
      where: {
        customer_id: {
          [Op.and]: [
            { [Op.ne]: null },     // not null
            { [Op.ne]: '' },       // not empty string
          ],
        },
      },
    });
    res.status(200).json({
      success: true,
      message: `User stats for the last ${days} days`,
      Customers,
      totalCustomers,
      recentCustomersLastXDays,
      totalBalance
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

router.get('/supplier-stats', async (req, res) => {
  try {
    // Parse the 'days' query param, fallback to 30
    const days = parseInt(req.query.days, 10) || 30;

    // Calculate the start date X days ago
    const fromDate = startOfDay(subDays(new Date(), days));

    // Total users


    // 2. Total supplier count grouped by mobile
    const totalSupplierGrouped = await Supplier.findAll({
      attributes: [
        'mobile',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['mobile']
    });

    // 3. Recent supplier count grouped by mobile (last 7 days)
    const recentSupplierGrouped = await Supplier.findAll({
      attributes: [
        'mobile',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        created_at: {
          [Op.gte]: fromDate,
        }
      },
      group: ['mobile']
    });


    const Suppliers = await Supplier.findAll({ order: [['mobile', 'DESC']] });
    const totalSuppliers = totalSupplierGrouped.length;
    const recentSuppliersLastXDays = recentSupplierGrouped.length;
    const totalBalance = await Transaction.sum('amount', {
      where: {
        supplier_id: {
          [Op.and]: [
            { [Op.ne]: null },     // not null
            { [Op.ne]: '' },       // not empty string
          ],
        },
      },
    });
    res.status(200).json({
      success: true,
      message: `User stats for the last ${days} days`,
      Suppliers,
      totalSuppliers,
      recentSuppliersLastXDays,
      totalBalance
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

router.post('/businessOwner', async (req, res) => {
  try {
    const { userId } = req.body;

    // Use Promise.all to run in parallel for better performance
    const [Customers, Suppliers] = await Promise.all([
      Customer.findAll({ where: { business_owner_id: userId } }),
      Supplier.findAll({ where: { business_owner_id: userId } }),
    ]);
    const UserData = await User.findOne({ where: { id: userId } });
    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved',
      businessOwnerDetails: UserData,
      CustomersCount: Customers.length,
      Customers,
      SupplierCount: Suppliers.length,
      Suppliers,
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

module.exports = router;