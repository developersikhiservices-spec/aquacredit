const express = require('express');
const Joi = require('joi');
const moment = require('moment');
const { Transaction, Customer, User, sequelize, Supplier, Bill } = require('../models');
const { Op, Sequelize } = require('sequelize');
const { createMirrorTransaction, updateMirrorTransaction } = require('../controller/transactionController');

const router = express.Router();


// Validation schemas
const transactionSchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional().allow(''),
  supplier_id: Joi.number().integer().positive().optional().allow(''),
  userId: Joi.number().integer().positive().required(),
  ownerId: Joi.number().integer().positive().required(),
  created_user: Joi.number().integer().positive().optional().allow(''),
  transaction_type: Joi.string().valid('you_gave', 'you_got', 'you_discount').required(),
  transaction_for: Joi.string().valid('customer', 'supplier').required(),
  paymentType: Joi.string().valid('paid', 'credit').required(),
  amount: Joi.number().positive().precision(2).required(),
  paidAmount: Joi.number().precision(2).required(),
  remainingAmount: Joi.number().precision(2).required(),
  description: Joi.string().max(1000).optional().allow(''),
  transaction_date: Joi.date().required(),
  due_date: Joi.date().optional().allow(),
  bill_id: Joi.number().integer().positive().optional().allow(),
  is_Approved: Joi.boolean().optional().allow(),
  status: Joi.string().max(100).optional().allow(''),
  // FIXED FIELD
  transaction_pic: Joi.alternatives(
    Joi.array().items(Joi.object()),
    Joi.object(),
    Joi.string(),
    Joi.allow(null)
  ).optional(),

});

const updateTransactionSchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional().allow(''),
  supplier_id: Joi.number().integer().positive().optional().allow(''),
  userId: Joi.number().integer().positive().required(),
  transaction_type: Joi.string().valid('you_gave', 'you_got').required(),
  transaction_for: Joi.string().valid('customer', 'supplier').required(),
  // due_date: Joi.date().optional().allow(),
  amount: Joi.number().positive().precision(2).required(),
});


// Helper function to apply balance changes
async function applyBalanceChanges({ type, amount, customerOrSupplier, user, reverse = false }) {
  const amt = Number(amount);
  const factor = reverse ? -1 : 1;

  if (type === "you_gave") {
    // you_gave: you give credit to customer/supplier
    user.current_balance = Number(user.current_balance) - (amt * factor);
    user.total_credit_given = Number(user.total_credit_given) + (amt * factor);
    if (!reverse) user.credit_given_count += 1;
    else user.credit_given_count -= 1;

    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) - (amt * factor);
    customerOrSupplier.total_credit_given = Number(customerOrSupplier.total_credit_given) + (amt * factor);

  } else if (type === "you_got") {
    // you_got: you receive payment from customer/supplier
    user.current_balance = Number(user.current_balance) + (amt * factor);
    user.total_payment_got = Number(user.total_payment_got) + (amt * factor);
    if (!reverse) user.payment_got_count += 1;
    else user.payment_got_count -= 1;

    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) + (amt * factor);
    customerOrSupplier.total_payment_got = Number(customerOrSupplier.total_payment_got) + (amt * factor);

  } else if (type === "you_discount") {
    // you_discount: you give discount
    user.current_balance = Number(user.current_balance) + (amt * factor);
    user.total_discount_given = Number(user.total_discount_given) + (amt * factor);

    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) + (amt * factor);
    customerOrSupplier.total_discount_given = Number(customerOrSupplier.total_discount_given) + (amt * factor);
  }
}

// Record new transaction
router.post('/customer', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // -------------------- VALIDATE INPUT --------------------
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation error",
        message: error.details[0].message
      });
    }

    const {
      customer_id,
      transaction_type,
      ownerId,
      bill_id,
      transaction_for,
      transaction_pic,
      remainingAmount,
      paidAmount, 
      created_user,
      amount, 
      paymentType,
      due_date,
      description,
      is_Approved,
      transaction_date,
      status
    } = value;
    const userId = req.body.userId;
    // -------------------- VERIFY USER --------------------
    const user = await User.findOne({
      where: { id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({
        error: "User not found",
        message: "User not found or access denied"
      });
    }
    // -------------------- VERIFY CUSTOMER --------------------
    const customer = await Customer.findOne({
      where: { id: customer_id, business_owner_id: ownerId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    console.log("customer::",customer)
    if (!customer) {
      await t.rollback();
      return res.status(404).json({
        error: "Customer not found",
        message: "Customer not found or access denied"
      });
    }

    // -------------------- CREATE TRANSACTION --------------------
    const newTransaction = await Transaction.create({
      business_owner_id: ownerId,
      created_user,
      customer_id,
      transaction_type,
      transaction_for,
      amount,
      remainingAmount,
      paidAmount,
      transaction_pic,
      bill_id, 
      created_user,
      due_date, 
      paymentType,
      description,
      is_Approved,
      transaction_date,
      status
    }, { transaction: t });
    if (transaction_type === "you_got") {


      const unpaidTransactions = await Transaction.findAll({
        where: {
          customer_id,
          business_owner_id: ownerId,
          remainingAmount: {
            [Op.gt]: 0
          }
        },
        order: [['transaction_date', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE // prevents race conditions
      });

      let remainingPayment = amount; // e.g. 1500

      for (const trx of unpaidTransactions) {
        if (remainingPayment <= 0) break;

        const trxRemaining = parseFloat(trx.remainingAmount);

        if (remainingPayment >= trxRemaining) {
          // FULLY PAY THIS TRANSACTION
          await trx.update({
            paidAmount: Sequelize.literal(`paidAmount + ${trxRemaining}`),
            remainingAmount: 0
          }, { transaction: t });

          remainingPayment -= trxRemaining;

        } else {
          // PARTIALLY PAY THIS TRANSACTION
          await trx.update({
            paidAmount: Sequelize.literal(`paidAmount + ${remainingPayment}`),
            remainingAmount: Sequelize.literal(`remainingAmount - ${remainingPayment}`)
          }, { transaction: t });

          remainingPayment = 0;
        }
      }
    }

    await createMirrorTransaction(newTransaction, t);
    // Commit transaction
    await t.commit();

    // -------------------- FETCH TRANSACTION WITH CUSTOMER --------------------
    const transactionWithCustomer = await Transaction.findByPk(newTransaction.id, {
      include: [{
        model: Customer,
        as: "customer",
        attributes: ["name", "mobile"]
      }]
    });

    return res.status(201).json({
      message: "Transaction recorded successfully",
      transaction: transactionWithCustomer
    });

  } catch (error) {
    await t.rollback();
    console.error("Transaction error:", error);

    return res.status(500).json({
      error: "Failed to record transaction",
      message: "Internal server error"
    });
  }
});

router.post('/supplier', async (req, res) => {
  const t = await sequelize.transaction();

  try {
    // -------------------- VALIDATE INPUT --------------------
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation error",
        message: error.details[0].message
      });
    }
    const {
      supplier_id,
      ownerId,
      transaction_type,
      transaction_for,
      transaction_pic,
      remainingAmount,
      paidAmount,
      amount, created_user,
      paymentType,
      due_date,
      description,
      transaction_date
    } = value;

    const userId = req.body.userId;
    // -------------------- VERIFY USER --------------------
    const user = await User.findOne({
      where: { id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({
        error: "User not found",
        message: "User not found or access denied"
      });
    }
    // -------------------- VERIFY SUPPLIER --------------------
    const supplier = await Supplier.findOne({
      where: {
        id: supplier_id,
        business_owner_id: userId
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!supplier) {
      await t.rollback();
      return res.status(404).json({
        error: "Supplier not found",
        message: "Supplier not found or access denied"
      });
    }
    // -------------------- CREATE TRANSACTION --------------------
    const newTransaction = await Transaction.create({
      business_owner_id: ownerId,
      created_user: userId,
      supplier_id,
      transaction_type,
      transaction_for,
      transaction_pic,
      remainingAmount,
      paidAmount,
      amount, created_user,
      paymentType,
      due_date,
      description: description || null,
      transaction_date
    }, { transaction: t });
    if (transaction_type === "you_got") {

      const unpaidTransactions = await Transaction.findAll({
        where: {
          supplier_id,
          business_owner_id: userId,
          remainingAmount: {
            [Op.gt]: 0
          }
        },
        order: [['transaction_date', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE // prevents race conditions
      });

      let remainingPayment = amount; // e.g. 1500

      for (const trx of unpaidTransactions) {
        if (remainingPayment <= 0) break;

        const trxRemaining = parseFloat(trx.remainingAmount);

        if (remainingPayment >= trxRemaining) {
          // FULLY PAY THIS TRANSACTION
          await trx.update({
            paidAmount: Sequelize.literal(`paidAmount + ${trxRemaining}`),
            remainingAmount: 0
          }, { transaction: t });

          remainingPayment -= trxRemaining;

        } else {
          // PARTIALLY PAY THIS TRANSACTION
          await trx.update({
            paidAmount: Sequelize.literal(`paidAmount + ${remainingPayment}`),
            remainingAmount: Sequelize.literal(`remainingAmount - ${remainingPayment}`)
          }, { transaction: t });

          remainingPayment = 0;
        }
      }
    }
    await createMirrorTransaction(newTransaction, t);

    await t.commit();

    // -------------------- FETCH TRANSACTION WITH SUPPLIER --------------------
    const transactionWithSupplier = await Transaction.findByPk(newTransaction.id, {
      include: [{
        model: Supplier,
        as: "supplier",
        attributes: ["name", "mobile"]
      }]
    });

    return res.status(201).json({
      message: "Supplier transaction recorded successfully",
      transaction: transactionWithSupplier
    });

  } catch (error) {
    await t.rollback();
    console.error("Supplier Transaction Error:", error);

    return res.status(500).json({
      error: "Failed to record supplier transaction",
      message: "Internal server error"
    });
  }
});

router.put('/customer/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const transactionId = req.params.id;

    // Validate input
    const { error, value } = updateTransactionSchema.validate(req.body);
    if (error) {
      await t.rollback();
      return res.status(400).json({ error: "Validation error", message: error.details[0].message });
    }
    const {
      amount,
      transaction_type,
      description,
      due_date,
      paymentType,
      transaction_date
    } = value;

    const userId = req.body.userId;
    const ownerId = req.body.ownerId;

    // Fetch old transaction with lock
    const oldTx = await Transaction.findOne({
      where: {
        id: transactionId,
        transaction_for: 'customer'
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!oldTx) return res.status(404).json({ message: "Transaction not found" });
    // Fetch user with lock
    const user = await User.findOne({
      where: { id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    // Fetch customer with lock
    const customer = await Customer.findOne({
      where: {
        id: oldTx.customer_id,
        business_owner_id: ownerId
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!user || !customer) {
      await t.rollback();
      return res.status(404).json({ error: "Not found", message: "User or Customer not found" });
    }
    // Prepare updated data
    const updatedData = {
      amount,
      transaction_type,
      description: description !== undefined ? description : oldTx.description,
      due_date: due_date !== undefined ? due_date : oldTx.due_date,
      paymentType: paymentType !== undefined ? paymentType : oldTx.paymentType,
      transaction_date: transaction_date || oldTx.transaction_date
    };

    // Reverse OLD transaction changes
    applyBalanceChanges({
      type: oldTx.transaction_type,
      amount: oldTx.amount,
      customerOrSupplier: customer,
      user,
      reverse: true
    });

    // Apply NEW transaction changes
    applyBalanceChanges({
      type: req.body.transaction_type,
      amount,
      customerOrSupplier: customer,
      user
    });

    // Save updated balances
    await customer.save({ transaction: t });
    await user.save({ transaction: t });

    // Update the transaction itself
    await oldTx.update(updatedData, { transaction: t });

    // UPDATE MIRROR TRANSACTION IF EXISTS
    let mirrorTx = null;
    if (oldTx.mirror_transaction_id) {
      mirrorTx = await updateMirrorTransaction(oldTx, updatedData, t);
    }
    await t.commit();

    // Fetch updated transaction with customer details
    const updatedTx = await Transaction.findByPk(oldTx.id, {
      include: [{ model: Customer, as: "customer", attributes: ["name", "mobile"] }]
    });

    return res.status(200).json({
      message: "Customer transaction updated successfully",
      transaction: updatedTx
    });

  } catch (error) {
    console.error("Update customer transaction error:", error);
    await t.rollback();
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
});

router.put('/supplier/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const transactionId = req.params.id;

    // Validate input
    const { error, value } = updateTransactionSchema.validate(req.body);
    if (error) {
      await t.rollback();
      return res.status(400).json({ error: "Validation error", message: error.details[0].message });
    }
    const {
      amount,
      transaction_type,
      description,
      due_date,
      paymentType,
      transaction_date
    } = value;

    const userId = req.body.userId;
    const ownerId = req.body.ownerId;

    // Fetch old transaction with lock
    const oldTx = await Transaction.findOne({
      where: {
        id: transactionId,
        transaction_for: 'supplier'
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!oldTx) {
      await t.rollback();
      return res.status(404).json({ message: "Transaction not found" });
    }
    // Fetch user with lock
    const user = await User.findOne({
      where: { id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    // Fetch supplier with lock
    const supplier = await Supplier.findOne({
      where: {
        id: oldTx.supplier_id,
        business_owner_id: ownerId
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!user || !supplier) {
      await t.rollback();
      return res.status(404).json({ error: "Not found", message: "User or Supplier not found" });
    }

    // Prepare updated data
    const updatedData = {
      amount,
      transaction_type,
      description: description !== undefined ? description : oldTx.description,
      due_date: due_date !== undefined ? due_date : oldTx.due_date,
      paymentType: paymentType !== undefined ? paymentType : oldTx.paymentType,
      transaction_date: transaction_date || oldTx.transaction_date
    };
    // Reverse OLD transaction changes
    applyBalanceChanges({
      type: oldTx.transaction_type,
      amount: oldTx.amount,
      customerOrSupplier: supplier,
      user,
      reverse: true
    });

    // Apply NEW transaction changes
    applyBalanceChanges({
      type: transaction_type,
      amount,
      customerOrSupplier: supplier,
      user
    });

    // Save updated balances
    await supplier.save({ transaction: t });
    await user.save({ transaction: t });
    // Update the transaction itself
    await oldTx.update(updatedData, { transaction: t });

    // UPDATE MIRROR TRANSACTION IF EXISTS
    let mirrorTx = null;
    if (oldTx.mirror_transaction_id) {
      mirrorTx = await updateMirrorTransaction(oldTx, updatedData, t);
    }
    await t.commit();

    const updatedTx = await Transaction.findByPk(oldTx.id, {
      include: [{ model: Supplier, as: "supplier", attributes: ["name", "mobile"] }]
    });

    return res.status(200).json({
      message: "supplier transaction updated successfully",
      transaction: updatedTx
    });

  } catch (error) {
    console.error("Update supplier transaction error:", error);
    await t.rollback();
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    // Find existing transaction
    const oldTx = await Transaction.findByPk(id, { transaction: t });

    if (!oldTx) {
      await t.rollback();
      return res.status(404).json({
        message: 'Supplier transaction not found',
      });
    }

    // Update transaction
    await oldTx.update(req.body, { transaction: t });

    // Commit transaction
    await t.commit();

    return res.status(200).json({
      message: 'Transaction updated successfully',
      transaction: oldTx,
    });

  } catch (error) {
    await t.rollback();
    console.error('Update supplier transaction error:', error);

    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
});

router.put('/:groupId/transaction_group_id', async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { groupId } = req.params;

    if (!groupId) {
      await t.rollback();
      return res.status(400).json({
        message: 'groupId is required',
      });
    }

    // Update transactions
    const [updatedCount] = await Transaction.update(req.body, {
      where: { transaction_group_id: groupId },
      transaction: t
    });

    if (!updatedCount) {
      await t.rollback();
      return res.status(404).json({
        message: 'Transaction group not found',
      });
    }

    // Fetch updated transactions
    const updatedTransactions = await Transaction.findAll({
      where: { transaction_group_id: groupId },
      transaction: t
    });

    await t.commit();

    return res.status(200).json({
      message: 'Transaction updated successfully',
      data: updatedTransactions
    });

  } catch (error) {
    await t.rollback();
    console.error('Update supplier transaction error:', error);

    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
});

router.put('/updateTransactions/DueDate', async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      customer_id,
      supplier_id,
      isDuedateChange,
      dueDate,
    } = req.body;

    // 1️⃣ Validation
    if (!isDuedateChange) {
      return res.status(200).json({
        message: 'Due date change flag is false, no update performed',
      });
    }

    if (!dueDate) {
      await t.rollback();
      return res.status(400).json({
        message: 'dueDate is required',
      });
    }

    if (!customer_id && !supplier_id) {
      await t.rollback();
      return res.status(400).json({
        message: 'Either customer_id or supplier_id is required',
      });
    }

    // 2️⃣ Build WHERE condition
    const whereCondition = {
      is_Deleted: false,
      is_Approved: true,
      due_date: {
        [Op.lt]: dueDate, // only smaller due dates
      },
    };

    if (customer_id) {
      whereCondition.customer_id = customer_id;
    }

    if (supplier_id) {
      whereCondition.supplier_id = supplier_id;
    }

    // 3️⃣ Update matching transactions
    const [updatedCount] = await Transaction.update(
      { due_date: dueDate },
      {
        where: whereCondition,
        transaction: t,
      }
    );

    // 4️⃣ Commit
    await t.commit();

    return res.status(200).json({
      message: 'Due dates updated successfully',
      updated_records: updatedCount,
      new_due_date: dueDate,
    });

  } catch (error) {
    await t.rollback();
    console.error('Update due date error:', error);

    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
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

    let whereCondition = { business_owner_id: req.body.ownerId };

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

router.get('/:id', async (req, res) => {
  try {
    const transactionId = req.params.id;

    let whereCondition = { id: transactionId };
    // Get transactions with customer details
    const transactions = await Transaction.findOne({
      where: whereCondition,
      include: [{
        model: Customer,
        as: 'customer',
      },
      {
        model: Supplier,
        as: 'supplier',
      }, {
        model: User,
        as: 'businessOwner',  // <-- must match EXACT alias !!
      }],
    });

    // If transaction does not exist
    if (!transactions) {
      return res.status(404).json({
        message: "Transaction not found",
        transactions: null,
        billDetails: {}
      });
    }

    // Safe bill lookup
    let billDetails = {};

    if (transactions.bill_id) {
      billDetails = await Bill.findOne({
        where: { id: transactions.bill_id }
      }) || {};
    }

    // Final response
    res.json({
      transactions,
      billDetails
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
router.post('/ledger/:customer_id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.customer_id);

    // Verify customer belongs to this business owner
    const customer = await Customer.findOne({
      where: {
        id: customerId,
        business_owner_id: req.body.ownerId
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
        transaction_for: "customer",
        business_owner_id: req.body.ownerId
      },
      attributes: ['id', 'business_owner_id', 'transaction_type', 'amount', 'description', 'transaction_date', 'created_user', 'created_at'],
      order: [['transaction_date', 'DESC']]
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
      transactions: transactions,
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

router.post('/userLedger/', async (req, res) => {
  try {
    const { userId,ownerId, transaction_for } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Define attributes and include conditionally
    let attributes = ['id', 'transaction_type', 'amount', 'description', 'transaction_date'];
    let include = [];

    if (transaction_for === 'customer') {
      attributes.push('customer_id');
      include.push({
        model: Customer,
        as: 'customer',
        attributes: [
          'id', 'name', 'mobile', 'photo',
          'current_balance', 'business_owner_id',
          'total_credit_given', 'total_payment_got'
        ]
      });
    } else if (transaction_for === 'supplier') {
      attributes.push('supplier_id');
      include.push({
        model: Supplier,
        as: 'supplier',
        attributes: [
          'id', 'name', 'mobile', 'photo',
          'current_balance', 'business_owner_id',
          'total_credit_given', 'total_payment_got'
        ]
      });
    }

    // Now run the query
    const transactions = await Transaction.findAll({
      where: {
        transaction_for,
        business_owner_id: ownerId,
        created_user:userId
      },
      attributes,
      include,
      order: [['transaction_date', 'DESC']]
    });
    let runningBalance = 0;
    let totalYouGave = 0;
    let totalYouGot = 0;

    const transactionsWithBalance = transactions.reverse().map(tx => {
      const plainTx = tx.toJSON();
      const amount = parseFloat(plainTx.amount);

      if (plainTx.transaction_type === 'you_gave') {
        runningBalance += amount;
        totalYouGave += amount;
      } else {
        runningBalance -= amount;
        totalYouGot += amount;
      }

      return {
        ...plainTx,
        running_balance: runningBalance
      };
    }).reverse();

    res.json({
      transactions: transactionsWithBalance,
      summary: {
        total_transactions: transactions.length,
        total_you_gave: totalYouGave,
        total_you_got: totalYouGot,
        current_balance: runningBalance
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
router.put('/delete/:id', async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const transactionId = parseInt(req.params.id);
    const userId = req.body.userId;
    const ownerId = req.body.ownerId;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Fetch the transaction
    const transaction = await Transaction.findOne({
      where: { id: transactionId, business_owner_id: ownerId,created_user:userId},
      transaction: t,
    });

    if (!transaction) {
      await t.rollback();
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Fetch the user
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Determine if it's customer or supplier
    let targetRecord = null;
    let targetType = "";

    if (transaction.customer_id) {
      targetType = "customer";
      targetRecord = await Customer.findByPk(transaction.customer_id, { transaction: t });
    } else if (transaction.supplier_id) {
      targetType = "supplier";
      targetRecord = await Supplier.findByPk(transaction.supplier_id, { transaction: t });
    } else {
      return res.status(400).json({ message: "Invalid transaction type" });
    }

    if (!targetRecord) {
      await t.rollback();
      return res.status(404).json({ message: `${targetType} not found` });
    }

    // Convert to numbers
    let newBalance = parseFloat(targetRecord.current_balance);
    let newCredit = parseFloat(targetRecord.total_credit_given);
    let newPayment = parseFloat(targetRecord.total_payment_got);

    let userBalance = parseFloat(user.current_balance);
    let userCredit = parseFloat(user.total_credit_given);
    let userPayment = parseFloat(user.total_payment_got);

    // Reverse logic
    const amount = parseFloat(transaction.amount);

    /**
     * CUSTOMER LOGIC:
     * --------------------------------
     * you_gave → you gave money → balance decreases → reverse = increase balance + decrease credit
     * you_got → you got payment → balance increases → reverse = decrease balance + decrease payment
     */
    /**
     * SUPPLIER LOGIC:
     * --------------------------------
     * you_gave → you paid supplier → supplier balance decreases → reverse = increase balance + decrease credit
     * you_got → supplier refunded you → supplier balance increases → reverse = decrease balance + decrease payment
     */

    if (transaction.transaction_type === "you_gave") {
      newBalance += amount;      // reverse effect
      newCredit -= amount;

      userBalance += amount;
      userCredit -= amount;

    } else if (transaction.transaction_type === "you_got") {
      newBalance -= amount;
      newPayment -= amount;

      userBalance -= amount;
      userPayment -= amount;
    }

    // Update target (customer or supplier)
    await targetRecord.update(
      {
        current_balance: newBalance,
        total_credit_given: newCredit,
        total_payment_got: newPayment,
      },
      { transaction: t }
    );

    // Update user
    await user.update(
      {
        current_balance: userBalance,
        total_credit_given: userCredit,
        total_payment_got: userPayment,
      },
      { transaction: t }
    );

    // Delete the transaction
    await Transaction.update(
      {
        is_Deleted: true,
        delete_date: new Date(),
      },
      { where: { id: transactionId }, transaction: t }
    );

    await t.commit();

    return res.json({
      message: `${targetType} transaction deleted successfully`,
    });

  } catch (error) {
    if (!t.finished) await t.rollback();

    console.error("Delete transaction error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.get('/defaulters/customer/:customerId', async (req, res) => {

  try {

    const { customerId } = req.params;

    // 1️⃣ Get Selected Customer
    const customer = await Customer.findByPk(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const mobileNumber = customer.mobile;

    // 2️⃣ Get ALL Overdue Transactions Across System By Mobile
    const overdueTransactions = await Transaction.findAll({

      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'mobile'],
        where: { mobile: mobileNumber }
      },
      {
        model: User,
        as: 'businessOwner',  // <-- must match EXACT alias !!
      }],

      where: {
        transaction_for: 'customer',
        paymentType: 'credit',
        remainingAmount: { [Op.gt]: 0 },
        due_date: { [Op.lt]: new Date() },
        is_Deleted: false
      },

      order: [['due_date', 'ASC']]
    });

    // 3️⃣ Calculate Summary
    let totalOverdue = 0;
    let maxDelay = 0;

    let stage1 = 0;
    let stage2 = 0;
    let stage3 = 0;
    let stage4 = 0;

    const today = new Date();

    overdueTransactions.forEach(trx => {

      totalOverdue += Number(trx.remainingAmount);

      const delay = Math.floor(
        (today - new Date(trx.due_date)) / (1000 * 60 * 60 * 24)
      );

      if (delay > maxDelay) maxDelay = delay;

      if (delay <= 30) stage1++;
      else if (delay <= 60) stage2++;
      else if (delay <= 90) stage3++;
      else stage4++;

    });

    // 4️⃣ Decide Final Stage
    let finalStage = null;

    if (stage4 > 0) finalStage = "Stage 4";
    else if (stage3 > 0) finalStage = "Stage 3";
    else if (stage2 > 0) finalStage = "Stage 2";
    else if (stage1 > 0) finalStage = "Stage 1";

    const status = overdueTransactions.length > 0 ? "Defaulter" : "Active";

    // 5️⃣ Response
    return res.status(200).json({
      success: true,
      data: {
        customer_details: customer,

        defaulter_summary: {
          mobile: mobileNumber,
          status,
          total_overdue: totalOverdue,
          overdue_count: overdueTransactions.length,
          max_delay_days: maxDelay,
          final_stage: finalStage,

          stage_breakdown: {
            stage1_count: stage1,
            stage2_count: stage2,
            stage3_count: stage3,
            stage4_count: stage4
          }
        },

        skipped_transactions: overdueTransactions
      }
    });

  } catch (error) {

    console.error("Error fetching customer defaulter details:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});

router.get('/defaulters/supplier/:supplierId', async (req, res) => {

  try {

    const { supplierId } = req.params;

    // 1️⃣ Get Selected Customer
    const supplier = await Supplier.findByPk(supplierId);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    const mobileNumber = supplier.mobile;

    // 2️⃣ Get ALL Overdue Transactions Across System By Mobile
    const overdueTransactions = await Transaction.findAll({

      include: [{
        model: Supplier,
        as: 'supplier',
        attributes: ['id', 'name', 'mobile'],
        where: { mobile: mobileNumber }
      },
      {
        model: User,
        as: 'businessOwner',  // <-- must match EXACT alias !!
      }],

      where: {
        transaction_for: 'supplier',
        paymentType: 'credit',
        remainingAmount: { [Op.gt]: 0 },
        due_date: { [Op.lt]: new Date() },
        is_Deleted: false
      },

      order: [['due_date', 'ASC']]
    });

    // 3️⃣ Calculate Summary
    let totalOverdue = 0;
    let maxDelay = 0;

    let stage1 = 0;
    let stage2 = 0;
    let stage3 = 0;
    let stage4 = 0;

    const today = new Date();

    overdueTransactions.forEach(trx => {

      totalOverdue += Number(trx.remainingAmount);

      const delay = Math.floor(
        (today - new Date(trx.due_date)) / (1000 * 60 * 60 * 24)
      );

      if (delay > maxDelay) maxDelay = delay;

      if (delay <= 30) stage1++;
      else if (delay <= 60) stage2++;
      else if (delay <= 90) stage3++;
      else stage4++;

    });

    // 4️⃣ Decide Final Stage
    let finalStage = null;

    if (stage4 > 0) finalStage = "Stage 4";
    else if (stage3 > 0) finalStage = "Stage 3";
    else if (stage2 > 0) finalStage = "Stage 2";
    else if (stage1 > 0) finalStage = "Stage 1";

    const status = overdueTransactions.length > 0 ? "Defaulter" : "Active";

    // 5️⃣ Response
    return res.status(200).json({
      success: true,
      data: {
        supplier_details: supplier,

        defaulter_summary: {
          mobile: mobileNumber,
          status,
          total_overdue: totalOverdue,
          overdue_count: overdueTransactions.length,
          max_delay_days: maxDelay,
          final_stage: finalStage,

          stage_breakdown: {
            stage1_count: stage1,
            stage2_count: stage2,
            stage3_count: stage3,
            stage4_count: stage4
          }
        },

        skipped_transactions: overdueTransactions
      }
    });

  } catch (error) {

    console.error("Error fetching customer defaulter details:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});


module.exports = router;