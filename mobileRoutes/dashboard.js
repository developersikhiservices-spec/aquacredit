const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { User, RefreshToken, Admin, Customer, Transaction } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const { Op,fn, col, where,literal} = require('sequelize');
const { startOfMonth, endOfMonth, subMonths,subDays, startOfDay } = require('date-fns');

const router = express.Router();

router.post('/businessOwner', async (req, res) => {
  try {
    // Total users
    const whereCondition = {
      business_owner_id: req.body.ownerId,
      created_user: req.body.userId,
      status: { [Op.in]: ["Active", "Defaulter"] } 
    };
    
    const CustomersCount = await Customer.count({ where: whereCondition});
    const Customers = await Customer.findAll({
      where: whereCondition,
      include: [
        {
          model: Transaction,
          as: 'transactions',
          attributes: [], // ✅ fix
          required: false
        }
      ],
      attributes: {
        include: [
          [
            literal(`
              SUM(
                CASE 
                  WHEN transactions.status = 'collected' 
                  THEN transactions.amount 
                  ELSE 0 
                END
              )
            `),
            'totalCollected'
          ]
        ]
      },
      group: ['Customer.id']
    });    
    const SupplierCount = await Supplier.count({ where: whereCondition });
    const Suppliers = await Supplier.findAll({ where: whereCondition,      
      include: [
      {
        model: Transaction,
        as: 'transactions',
        attributes: [], // ✅ fix
        required: false
      }
    ],
    attributes: {
      include: [
        [
          literal(`
            SUM(
              CASE 
                WHEN transactions.status = 'collected' 
                THEN transactions.amount 
                ELSE 0 
              END
            )
          `),
          'totalCollected'
        ]
      ]
    },
    group: ['Supplier.id']
});
    
    res.status(200).json({
      success: true,
      message: `dashboard data retrieved`,
      CustomersCount,
      Customers,
      SupplierCount,
      Suppliers
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