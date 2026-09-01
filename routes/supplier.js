const express = require('express');
const Joi = require('joi');
const { Supplier, Transaction, User } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
// router.use(authorizeRole('business_owner', 'admin'));

// Validation schemas
const supplierSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow('')
});

const searchSchema = Joi.object({
  query: Joi.string().min(1).max(255).required()
});

// Add new supplier
router.post('/', async (req, res) => {
  try {
    const { error, value } = supplierSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo } = value;

    // Check if supplier already exists for this business owner
    const existingSupplier = await Supplier.findOne({
      where: {
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: name },
          { mobile: mobile }
        ]
      }
    });

    if (existingSupplier) {
      return res.status(409).json({
        error: 'Supplier already exists',
        message: 'Supplier with this name or mobile already exists'
      });
    }

    // Insert new supplier
    const newSupplier = await Supplier.create({
      business_owner_id: req.body.userId,
      name,
      mobile,
      photo: photo || null
    });

    res.status(201).json({
      message: 'Supplier added successfully',
      supplier: newSupplier
    });

  } catch (error) {
    console.error('Add supplier error:', error);
    res.status(500).json({
      error: 'Failed to add supplier',
      message: 'Internal server error'
    });
  }
});

// Get all suppliers for business owner
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

    // Get suppliers with pagination
    const { rows: suppliers, count: totalSuppliers } = await Supplier.findAndCountAll({
      where: whereCondition,
      attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at'],
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(totalSuppliers / limit);

    res.json({
      suppliers,
      pagination: {
        currentPage: page,
        totalPages,
        totalSuppliers,
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

// Get supplier by ID
router.get('/:id', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);

    const supplier = await Supplier.findOne({
      where: {
        id: supplierId,
        business_owner_id: req.body.userId
      },
      attributes: ['id', 'name', 'mobile', 'photo', 'current_balance', 'total_credit_given', 'total_payment_got', 'created_at', 'updated_at']
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }

    res.json({
      supplier
    });

  } catch (error) {
    console.error('Fetch supplier error:', error);
    res.status(500).json({
      error: 'Failed to fetch supplier',
      message: 'Internal server error'
    });
  }
});

//get by mobile No.
router.post('/web/getSupplierByMobile', async (req, res) => {
  try {

    // Get customers with pagination
    const { rows: suppliers, count: totalSupplier } = await Supplier.findAndCountAll({
      where: {mobile:req.body.mobile},
      include: [
        {
          model: User,
          as: 'businessOwner', // match the alias used in the association
          attributes: ['id', 'name', 'email','mobile'], // adjust fields as needed
        },
      ],
      order: [['updated_at', 'DESC']],
    },);


    res.json({
      suppliers,
      totalSupplier,
    });

  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({
      error: 'Failed to fetch customers',
      message: 'Internal server error'
    });
  }
});


// Update supplier
router.put('/:id', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const { error, value } = supplierSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }

    const { name, mobile, photo } = value;

    // Check if supplier exists and belongs to this business owner
    const existingSupplier = await Supplier.findOne({
      where: {
        id: supplierId,
        business_owner_id: req.body.userId
      }
    });

    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }

    // Check for duplicate name/mobile (excluding current supplier)
    const duplicate = await Supplier.findOne({
      where: {
        business_owner_id: req.body.userId,
        [Op.or]: [
          { name: name },
          { mobile: mobile }
        ],
        id: { [Op.ne]: supplierId }
      }
    });

    if (duplicate) {
      return res.status(409).json({
        error: 'Duplicate supplier',
        message: 'Another supplier with this name or mobile already exists'
      });
    }

    // Update supplier
    await Supplier.update(
      {
        name,
        mobile,
        photo: photo || null
      },
      {
        where: { id: supplierId }
      }
    );

    // Fetch updated supplier
    const updatedSupplier = await Supplier.findByPk(supplierId);

    res.json({
      message: 'Supplier updated successfully',
      supplier: updatedSupplier
    });

  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({
      error: 'Failed to update supplier',
      message: 'Internal server error'
    });
  }
});

// Delete supplier
router.delete('/:id', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);

    // Check if supplier exists and belongs to this business owner
    const existingSupplier = await Supplier.findOne({
      where: {
        id: supplierId,
        business_owner_id: req.body.userId
      }
    });

    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }

    // Check if supplier has transactions
    const transactionCount = await Transaction.count({
      where: { supplier_id: supplierId }
    });

    if (transactionCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete supplier',
        message: 'Supplier has existing transactions. Cannot delete.'
      });
    }

    // Delete supplier
    await Supplier.destroy({
      where: { id: supplierId }
    });

    res.json({
      message: 'Supplier deleted successfully'
    });

  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({
      error: 'Failed to delete supplier',
      message: 'Internal server error'
    });
  }
});

// Search suppliers by name or mobile
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

    const suppliers = await Supplier.findAll({
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
      suppliers,
      searchQuery: query,
      totalResults: suppliers.length
    });

  } catch (error) {
    console.error('Search suppliers error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error'
    });
  }
});

// Get supplier statistics
router.get('/stats/summary', async (req, res) => {
  try {
    // Get supplier statistics
    const { sequelize } = require('../models');
    
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_suppliers,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) as positive_balance_suppliers,
        COUNT(CASE WHEN current_balance < 0 THEN 1 END) as negative_balance_suppliers,
        COUNT(CASE WHEN current_balance = 0 THEN 1 END) as zero_balance_suppliers,
        COALESCE(SUM(current_balance), 0) as total_outstanding,
        COALESCE(SUM(total_credit_given), 0) as total_credit_given,
        COALESCE(SUM(total_payment_got), 0) as total_payments_received
      FROM suppliers 
      WHERE business_owner_id = :businessOwnerId
    `, {
      replacements: { businessOwnerId: req.body.userId },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      statistics: stats[0]
    });

  } catch (error) {
    console.error('Supplier stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Internal server error'
    });
  }
});

module.exports = router;