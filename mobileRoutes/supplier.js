const express = require('express');
const Joi = require('joi');
const {Supplier, Transaction, User, sequelize} = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { createSupplier } = require('../controller/supplierController');
const router = express.Router();

// Validation schemas
const supplierSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  mobile: Joi.string().min(10).max(15).required(),
  photo: Joi.string().optional().allow(''),
  email: Joi.string().optional().allow(''),
  address: Joi.string().optional().allow(''),
  userId: Joi.number().optional().allow(''),
  ownerId: Joi.number().optional().allow(''),
  created_user: Joi.number().optional().allow('')
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

    const { name, mobile, photo,userId,ownerId, created_user } = value;

    const [supplier, created] = await Supplier.findOrCreate({
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

    const userData=await User.findOne({where:{id:userId}})
    await createSupplier(supplier.get({ plain: true }),userData.get({ plain: true }));

    return res.status(201).json({
      message: 'Supplier added successfully',
      supplier
    });

  } catch (error) {
    console.error('Add customer error:', error);
    return res.status(500).json({
      error: 'Failed to add customer'
    });
  }
});

// Get all suppliers for business owner
router.post('/getAll', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = {created_user:req.body.userId};
    whereCondition.status="Active"
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
router.post('/:id', async (req, res) => {

  try {
    const supplierId = parseInt(req.params.id);

    const supplier = await Supplier.findOne({
      where: {
        id: supplierId,
        business_owner_id: req.body.ownerId,
        created_user:req.body.userId,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }

    const transactionsCount = await Transaction.count({
      where: {
        supplier_id: supplierId,
        business_owner_id:supplier.business_owner_id,
        transaction_for: "supplier"
      },
    });
    const transactions = await Transaction.findAll({
      where: {
        supplier_id: supplierId,
        business_owner_id:supplier.business_owner_id,
        transaction_for: "supplier"
      },
      order: [["created_at", "ASC"]], // Oldest to newest
    });
    res.json({
      supplier,
      transactionsCount,
      transactions,
    });

  } catch (error) {
    console.error('Fetch supplier error:', error);
    res.status(500).json({
      error: 'Failed to fetch supplier',
      message: 'Internal server error'
    });
  }
});

// Update supplier
router.put('/:id', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const { name,nickName,mobile,email,address,photo,due_date,status } = req.body;

    // Check if supplier exists and belongs to this business owner
    const existingSupplier = await Supplier.findOne({
      where: {
        id: supplierId,
        business_owner_id: req.body.ownerId
      }
    });

    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }

    // Check for duplicate name/mobile (excluding current supplier)
    const orConditions = [];
    if (name) orConditions.push({ name });
    if (mobile) orConditions.push({ mobile });
    
    if (orConditions.length > 0) {
      const duplicate = await Supplier.findOne({
        where: {
          business_owner_id: req.body.ownerId,
          [Op.or]: orConditions,
          id: { [Op.ne]: supplierId }
        }
      });
    
      if (duplicate) {
        return res.status(409).json({
          error: 'Duplicate supplier',
          message: 'Another supplier with this name or mobile already exists'
        });
      }
    }

    // Update supplier
    await Supplier.update(
      {name,nickName,mobile,email,address,photo,due_date,status},
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
router.put('/delete/:id', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);

    // Check if supplier exists and belongs to this business owner
    const existingSupplier = await Supplier.findOne({
      where: {
        id: supplierId,
        created_user: req.body.userId
      }
    });

    if (!existingSupplier) {
      return res.status(404).json({
        error: 'Supplier not found',
        message: 'Supplier not found or access denied'
      });
    }
    // Delete supplier
    await Supplier.update(
      {
        status: 'Inactive'
      },
      {
        where: { id: supplierId }
      }
    )

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
        business_owner_id: req.body.ownerId,
        status:"Active",
        [Op.or]: [
          { name: { [Op.like]: searchTerm } },
          { mobile: { [Op.like]: searchTerm } }
        ]
      },
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

router.post('/upcoming/DueDate', async (req, res) => {
  try {
    const { supplier_id, user_id} = req.body;

    const unpaidTransactions = await Transaction.findAll({
      where: {
        supplier_id,
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
      WHERE business_owner_id = :businessOwnerId AND created_by_user_id = :userId;
    `, {
      replacements: { businessOwnerId: req.body.ownerId },
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

router.post('/web/getSupplierByMobile', async (req, res) => {
  try {

    // Get suppliers with pagination
    const { rows: suppliers, count: totalSupplier } = await Supplier.findAndCountAll({
      where: {mobile:req.body.mobile,business_owner_id: req.body.ownerId,status:"Active"},
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
    console.error('Fetch suppliers error:', error);
    res.status(500).json({
      error: 'Failed to fetch suppliers',
      message: 'Internal server error'
    });
  }
});

router.post('/getSupplierByMobile/WithUserID', async (req, res) => {
  try {
    const { mobile, userId,ownerId } = req.body;
        // Validate input
    if (!mobile || !userId || isNaN(Number(userId) ||!ownerId ||isNaN(Number(ownerId)) )) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number or userId"
      });
    }

    // Find supplier
    const supplier = await Supplier.findOne({
      where: {
        mobile,
        business_owner_id: Number(ownerId)
      },
    });

    // If supplier not found
    if (!supplier) {
      return res.status(201).json({
        success: false,
        message: "Supplier not found"
      });
    }

    // Fetch created user details
    const user = await User.findOne({
      where: { id: supplier.created_user },
      attributes: ["id", "businessName"] // Only fetch required fields
    });

    return res.status(200).json({
      success: true,
      message: user
        ? `This supplier is already doing business with ${user.businessName}`
        : "Supplier found",
      data: supplier
    });

  } catch (error) {
    console.error('Fetch suppliers error:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

router.post('/getAllsuppliers/ByUserId', async (req, res) => {
  try {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;
    const filter = req.body.filter; // 'positive', 'negative', 'zero'

    let whereCondition = {business_owner_id:req.body.userId};

    // Apply balance filter
    if (filter === 'positive') {
      whereCondition.current_balance = { [Op.gt]: 0 };
    } else if (filter === 'negative') {
      whereCondition.current_balance = { [Op.lt]: 0 };
    } else if (filter === 'zero') {
      whereCondition.current_balance = 0;
    }
    whereCondition.status="Active"
    // Get suppliers with pagination
    const { rows: suppliers, count: totalSuppliers } = await Supplier.findAndCountAll({
      where: whereCondition,
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


module.exports = router;