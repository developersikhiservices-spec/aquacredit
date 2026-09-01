const express = require('express');
const Joi = require('joi');
const { Customer, Transaction, User } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
// router.use(authorizeRole('business_owner', 'admin'));

// Validation schemas
const customerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow('')
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

    const { name, mobile, photo } = value;

    // Check if customer already exists for this business owner
    const existingCustomer = await Customer.findOne({
      where: {
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: name },
          { mobile: mobile }
        ]
      }
    });

    if (existingCustomer) {
      return res.status(409).json({
        error: 'Customer already exists',
        message: 'Customer with this name or mobile already exists'
      });
    }

    // Insert new customer
    const newCustomer = await Customer.create({
      business_owner_id: req.body.userId,
      name,
      mobile,
      photo: photo || null
    });

    res.status(201).json({
      message: 'Customer added successfully',
      customer: newCustomer
    });

  } catch (error) {
    console.error('Add customer error:', error);
    res.status(500).json({
      error: 'Failed to add customer',
      message: 'Internal server error'
    });
  }
});

// Get all customers for business owner
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.query.filter; // 'positive', 'negative', 'zero'

    let whereCondition = { business_owner_id: req.body.userId };

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }

    // Get customers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: whereCondition,
      // attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at'],
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

// Get customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);

    const customer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.userId
      },
      attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at']
    });

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    res.json({
      customer
    });

  } catch (error) {
    console.error('Fetch customer error:', error);
    res.status(500).json({
      error: 'Failed to fetch customer',
      message: 'Internal server error'
    });
  }
});

router.post('/getCustomersByMobile', async (req, res) => {
  try {

    // Get customers with pagination
    const { rows: customers, count: totalCustomers } = await Customer.findAndCountAll({
      where: {mobile:req.body.mobile},
      include: [
        {
          model: User,
          as: 'businessOwner', // match the alias used in the association
          attributes: ['id', 'name', 'email','mobile'], // adjust fields as needed
        },
      ],
      order: [['created_at', 'DESC']],
    });


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


// Update customer
router.put('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { error, value } = customerSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo } = value;
    // Check if customer exists and belongs to this business owner
    const existingCustomer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.userId
      }
    });
    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Check for duplicate name/mobile (excluding current customer)
    const duplicate = await Customer.findOne({
      where: {
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: name },
          { mobile: mobile }
        ],
        id: { [Op.ne]: customerId }
      }
    });

    if (duplicate) {
      return res.status(409).json({
        error: 'Duplicate customer',
        message: 'Another customer with this name or mobile already exists'
      });
    }

    // Update customer
    await Customer.update(
      {
        name,
        mobile,
        photo: photo
      },
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
router.delete('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);

    // Check if customer exists and belongs to this business owner
    const existingCustomer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.userId
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer not found or access denied'
      });
    }

    // Check if customer has transactions
    const transactionCount = await Transaction.count({
      where: { customer_id: customerId }
    });

    if (transactionCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete customer',
        message: 'Customer has existing transactions. Cannot delete.'
      });
    }

    // Delete customer
    await Customer.destroy({
      where: { id: customerId }
    });

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
      WHERE business_owner_id = :businessOwnerId
    `, {
      replacements: { businessOwnerId: req.body.userId },
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