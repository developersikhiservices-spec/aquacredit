const express = require('express');
const Joi = require('joi');
const { Customer, Transaction, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { createCustomer } = require('../controller/customerController');
const router = express.Router();

const customerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow(''),
  userId: Joi.number().optional().allow(''),
  ownerId: Joi.number().optional().allow(''),
  created_user: Joi.number().optional().allow('')
});

const searchSchema = Joi.object({
  query: Joi.string().min(1).max(255).required()
});

// Add new customer
router.post('/', async (req, res) => {
  try {

    const { error, value } = customerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo, userId, ownerId, created_user } = value;

    const [customer, created] = await Customer.findOrCreate({
      where: {
        mobile,
        business_owner_id: ownerId,
      },
      defaults: {
        business_owner_id: ownerId,
        name,
        nickName:name,
        photo: photo || null,
        created_user
      }
    });

    if (!created) {
      return res.status(409).json({
        error: 'Customer already exists'
      });
    }
    const userData = await User.findOne({ where: { id: userId } })
    await createCustomer(customer.get({ plain: true }), userData);

    return res.status(201).json({
      message: 'Customer added successfully',
      customer
    });

  } catch (error) {
    console.error('Add customer error:', error);
    return res.status(500).json({
      error: 'Failed to add customer'
    });
  }
});

// Get all customers for business owner
router.post('/getAll', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = { created_user: req.body.userId };

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }
    whereCondition.status = "Active"
    // Get customers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: whereCondition,
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: 'Internal server error'
    });
  }
});

router.post('/getAllByUserId', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = { business_owner_id: req.body.ownerId, created_user: req.body.userId };

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }
    whereCondition.status = "Active"
    // Get customers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: whereCondition,
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: 'Internal server error'
    });
  }
});

router.post('/getCustomersByMobile', async (req, res) => {
  try {

    // Get customers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: { mobile: req.body.mobile, business_owner_id: req.body.ownerId, status: "Active" },
      include: [
        {
          model: User,
          as: 'businessOwner', // match the alias used in the association
          attributes: ['id', 'name', 'email', 'mobile'], // adjust fields as needed
        },
      ],
      order: [['updated_at', 'DESC']],
    },);


    res.json({
      customers,
      totalCustomers,
    });

  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: 'Internal server error'
    });
  }
});

router.post('/getCustomersByMobile/WithUserID', async (req, res) => {
  try {
    const { mobile, userId, ownerId } = req.body;
    // Validate input
    if (!mobile || !userId || isNaN(Number(userId) || !ownerId || isNaN(Number(ownerId)))) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number or userId"
      });
    }

    // Find customer
    const customer = await Customer.findOne({
      where: {
        mobile,
        business_owner_id: Number(ownerId),
      },
    });

    if (!customer) {
      return res.status(201).json({
        success: false,
        message: "Customer not found"
      });
    }

    // Find creator user
    const user = await User.findOne({
      where: { id: customer.created_user },
      attributes: ["id", "businessName"], // fetch only required fields
    });

    return res.status(200).json({
      success: true,
      message: user
        ? `This customer is already doing business with ${user.businessName}`
        : "Customer found",
      data: customer
    });

  } catch (error) {
    console.error('Fetch customers error:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

router.post('/getAllCustomers/ByUserId', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = { created_user: req.body.userId };

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }
    whereCondition.status = "Active"
    // Get suppliers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: whereCondition,
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Fetch suppliers error:', error);
    res.status(500).json({
      error: 'Failed to fetch suppliers',
      message: 'Internal server error'
    });
  }
});

// Get customer by ID
router.post('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);

    const customer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.ownerId, 
        created_user: req.body.userId
      },
    });

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }
    const { count, rows } = await Transaction.findAndCountAll({
      where: {
        customer_id: customerId,
        business_owner_id: customer.business_owner_id,
        transaction_for: "customer"
      },
      order: [['created_at', 'DESC']] // latest first
    });
    
    res.json({
      customer,
      transactionsCount: count,
      transactions: rows,
    });

  } catch (error) {
    console.error('Fetch customer error:', error);
    res.status(500).json({
      error: 'Failed to fetch customer',
      message: 'Internal server error'
    });
  }
});

// Update customer
router.put('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);

    const { name, mobile,nickName, email, address, photo, due_date, status } = req.body;

    // Check if customer exists and belongs to this business owner
    const existingCustomer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.ownerId
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Check for duplicate name/mobile (excluding current customer)
    const orConditions = [];
    if (name) orConditions.push({ name });
    if (mobile) orConditions.push({ mobile });

    if (orConditions.length > 0) {
      const duplicate = await Customer.findOne({
        where: {
          business_owner_id: req.body.ownerId,
          [Op.or]: orConditions,
          id: { [Op.ne]: customerId }
        }
      });

      if (duplicate) {
        return res.status(409).json({
          error: 'Duplicate customer',
          message: 'Another customer with this name or mobile already exists'
        });
      }
    }

    // Update customer
    await Customer.update(
      { name,nickName, mobile, email, address, photo, due_date, status },
      {
        where: { id: customerId }
      }
    );

    // Fetch updated customer
    const updatedCustomer = await Customer.findByPk(customerId);

    res.json({
      message: 'Customer updated successfully',
      customer: updatedCustomer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      error: 'Failed to update customer',
      message: 'Internal server error'
    });
  }
});

// Delete customer
router.put('/delete/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    // Check if customer exists and belongs to this business owner
    const existingCustomer = await Customer.findOne({
      where: {
        id: customerId,
        created_user: req.body.userId
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Delete customer
    await Customer.update(
      {
        status: 'Inactive'
      },
      {
        where: { id: customerId }
      }
    )

    res.json({
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      error: 'Failed to delete customer',
      message: 'Internal server error'
    });
  }
});

// Search customers by name or mobile
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

    const customers = await Customer.findAll({
      where: {
        business_owner_id: req.body.ownerId,
        status: "Active",
        [Op.or]: [
          { name: { [Op.like]: searchTerm } },
          { mobile: { [Op.like]: searchTerm } }
        ]
      },
      order: [['name', 'ASC']],
      limit: 20
    });

    res.json({
      customers,
      searchQuery: query,
      totalResults: customers.length
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error'
    });
  }
});

router.post('/upcoming/DueDate', async (req, res) => {
  try {
    const { customer_id, user_id } = req.body;

    const unpaidTransactions = await Transaction.findAll({
      where: {
        customer_id,
        created_user: user_id,
        remainingAmount: { [Op.gt]: 0 }
      },
      order: [['due_date', 'ASC']]
    });

    if (!unpaidTransactions.length) {
      return res.json({
        upcoming_due_date: null,
        message: 'No pending dues'
      });
    }

    const upcomingDueDate = unpaidTransactions[0].due_date;

    res.json({
      upcoming_due_date: upcomingDueDate,
      formatted_due_date: moment(upcomingDueDate).format('DD MMM YYYY'),
      total_pending_transactions: unpaidTransactions.length,
      total_pending_amount: unpaidTransactions.reduce(
        (sum, tx) => sum + Number(tx.remainingAmount),
        0
      )
    });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error'
    });
  }
});

// Get customer statistics
router.get('/stats/summary', async (req, res) => {
  try {
    // Get customer statistics
    const { sequelize } = require('../models');

    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) as positive_balance_customers,
        COUNT(CASE WHEN current_balance < 0 THEN 1 END) as negative_balance_customers,
        COUNT(CASE WHEN current_balance = 0 THEN 1 END) as zero_balance_customers,
        COALESCE(SUM(current_balance), 0) as total_outstanding,
        COALESCE(SUM(total_credit_given), 0) as total_credit_given,
        COALESCE(SUM(total_payment_got), 0) as total_payments_received
      FROM customers 
      WHERE business_owner_id = :businessOwnerId   AND created_by_user_id = :userId;
    `, {
      replacements: { businessOwnerId: req.body.ownerId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      statistics: stats[0]
    });

  } catch (error) {
    console.error('Customer stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Internal server error'
    });
  }
});

module.exports = router;