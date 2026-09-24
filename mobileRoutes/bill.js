const express = require('express');
const { Bill, Customer, Supplier, User, Transaction, sequelize } = require('../models');
const { where } = require('sequelize');
const { updateMirrorTransaction } = require('../controller/transactionController');
const router = express.Router();


// Helper function for balance changes
async function applyBalanceChanges({ type, amount, customerOrSupplier, user, reverse = false }) {
  const amt = Number(amount);
  const factor = reverse ? -1 : 1;
  const isCustOrSupp = !!customerOrSupplier;
  
  if (type === "you_gave") {
    // you_gave: you give credit to customer/supplier
    user.current_balance = Number(user.current_balance) - (amt * factor);
    user.total_credit_given = Number(user.total_credit_given) + (amt * factor);
    if (!reverse) user.credit_given_count += 1;
    else user.credit_given_count -= 1;
    if (isCustOrSupp) {
    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) - (amt * factor);
    customerOrSupplier.total_credit_given = Number(customerOrSupplier.total_credit_given) + (amt * factor);
    }
  } else if (type === "you_got") {
    // you_got: you receive payment from customer/supplier
    user.current_balance = Number(user.current_balance) + (amt * factor);
    user.total_payment_got = Number(user.total_payment_got) + (amt * factor);
    if (!reverse) user.payment_got_count += 1;
    else user.payment_got_count -= 1;

    if (isCustOrSupp) {
    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) + (amt * factor);
    customerOrSupplier.total_payment_got = Number(customerOrSupplier.total_payment_got) + (amt * factor);
    }

  } else if (type === "you_discount") {
    // you_discount: you give discount
    user.current_balance = Number(user.current_balance) + (amt * factor);
    user.total_discount_given = Number(user.total_discount_given) + (amt * factor);
    if (isCustOrSupp) {
    customerOrSupplier.current_balance = Number(customerOrSupplier.current_balance) + (amt * factor);
    customerOrSupplier.total_discount_got = Number(customerOrSupplier.total_discount_got) + (amt * factor);
    }
  }
}

// Add new Bill
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      customer_id,
      supplier_id,
      transaction_type,
      bill_type,
      transaction_for,
      items,
      ExtraCharges,
      bill_file,
      amount, payment_status,
      bill_id,
      description,
      transaction_id,
      bill_date
    } = req.body;

    // Simple validation
    if (!userId || !amount || !bill_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Optionally verify if customer/supplier exist and belong to user here...

    const newBill = await Bill.create({
      business_owner_id: userId,
      customer_id,
      supplier_id,
      transaction_type,
      bill_type,
      transaction_for,
      items, payment_status,
      bill_file,
      amount,
      ExtraCharges,
      bill_id,
      description, transaction_id,
      bill_date
    });

    res.status(201).json({ message: 'Bill created', bill: newBill });

  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all Bills for a user
router.post('/getUser', async (req, res) => {
  try {
    const userId = req.body.userId;

    const bills = await Bill.findAll({
      where: { business_owner_id: userId },
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name'] },
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: User, as: 'user', attributes: ['id', 'name'] }
      ],
      order: [['bill_date', 'DESC']],
    });

    res.json(bills);
  } catch (error) {
    console.error('Fetch bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Bill by ID
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await Bill.findByPk(id, {
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'address', 'mobile'] },
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'address', 'mobile'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'address', 'mobile'] }
      ]
    });

    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    res.json(bill);
  } catch (error) {
    console.error('Fetch bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Bill by ID
router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const userId = req.body.userId; // Make sure userId is sent in the request
    // Fetch bill with lock
    const bill = await Bill.findOne({
      where: { id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!bill) {
      await t.rollback();
      return res.status(404).json({ error: 'Bill not found' });
    }
    // Allowed fields
    const allowedFields = [
      'bill_type', 'items', 'bill_file', 'amount',
      'payment_status', 'bill_id', 'ExtraCharges', 'description',
      'transaction_id', 'bill_date'
    ];

    const updateData = {};

    // Add only keys that exist in req.body
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    const amountChanged = updateData.amount !== undefined && updateData.amount !== bill.amount;
    // Fetch user with lock
    const user = await User.findOne({
      where: { id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    let transactionUpdateResult = null;

    if (bill) {
      // Fetch old transaction with lock
      console.log("oldTx::",bill.id)

      const oldTx = await Transaction.findOne({
        where: { bill_id: bill.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (oldTx) {
        if (amountChanged) {
          // Fetch customer with lock
          const customer = await Customer.findOne({
            where: {
              id: oldTx.customer_id,
              business_owner_id: userId
            },
            transaction: t,
            lock: t.LOCK.UPDATE
          });

          if (!customer) {
            await t.rollback();
            return res.status(404).json({ error: "Customer not found" });
          }
          console.log("customer::",customer.id)
          // Reverse OLD transaction changes
          applyBalanceChanges({
            type: oldTx.transaction_type,
            amount: oldTx.amount,
            customerOrSupplier: customer,
            user,
            reverse: true
          });

          // Apply NEW transaction changes with new amount
          applyBalanceChanges({
            type: oldTx.transaction_type, // Keep same transaction type
            amount: updateData.amount,
            customerOrSupplier: customer,
            user
          });

          // Save updated balances
          await customer.save({ transaction: t });
          await user.save({ transaction: t });

          // Update transaction with new amount
          await oldTx.update({
            amount: updateData.amount,
            description: updateData.description !== undefined ? updateData.description : oldTx.description,
            bill_date: updateData.bill_date || oldTx.bill_date,
            payment_status: updateData.payment_status || oldTx.payment_status
          }, { transaction: t });

          // UPDATE MIRROR TRANSACTION IF EXISTS
          if (oldTx.mirror_transaction_id) {
            await updateMirrorTransaction(oldTx, updateData, t);
          }

          transactionUpdateResult = oldTx;
        } else {
          // Just update transaction fields without balance changes
          const transactionUpdateFields = {};
          console.log("not have amount")
          if (updateData.description !== undefined) transactionUpdateFields.description = updateData.description;
          if (updateData.bill_date !== undefined) transactionUpdateFields.bill_date = updateData.bill_date;
          if (updateData.payment_status !== undefined) transactionUpdateFields.payment_status = updateData.payment_status;

          if (Object.keys(transactionUpdateFields).length > 0) {
            await oldTx.update(transactionUpdateFields, { transaction: t });

            // Update mirror transaction if exists
            if (oldTx.mirror_transaction_id) {
              await updateMirrorTransaction(oldTx, transactionUpdateFields, t);
            }

            transactionUpdateResult = oldTx;
          }
        }
      }
    }

    // Update the bill
    await bill.update(updateData, { transaction: t });

    await t.commit();

    // Fetch updated bill with its transaction
    const updatedBill = await Bill.findByPk(id, {
      include: [{ model: Transaction, as: "transaction" }]
    });

    res.json({
      message: 'Bill updated successfully',
      bill: updatedBill,
      transaction: transactionUpdateResult
    });

  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Bill by ID
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const bill = await Bill.findByPk(id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    await bill.destroy();

    res.json({ message: 'Bill deleted' });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
