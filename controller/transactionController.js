const { sequelize } = require('../config/database');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const { Transaction } = require('../models');


// Helper function to apply balance changes
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

// Helper function to handle payment distribution for you_got transactions
async function handlePaymentDistribution(transaction, userId, t) {
  if (transaction.transaction_type === "you_got") {
    const model = transaction.transaction_for === "customer" ? Customer : Supplier;
    const entityId = transaction.transaction_for === "customer" ? transaction.customer_id : transaction.supplier_id;

    const unpaidTransactions = await Transaction.findAll({
      where: {
        [transaction.transaction_for === "customer" ? 'customer_id' : 'supplier_id']: entityId,
        business_owner_id: userId,
        remainingAmount: {
          [Op.gt]: 0
        }
      },
      order: [['transaction_date', 'ASC']],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let remainingPayment = Number(transaction.amount);

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
}

// Helper function to reverse payment distribution for you_got transactions
async function reversePaymentDistribution(oldTransaction, userId, t) {
  if (oldTransaction.transaction_type === "you_got") {
    const model = oldTransaction.transaction_for === "customer" ? Customer : Supplier;
    const entityId = oldTransaction.transaction_for === "customer" ? oldTransaction.customer_id : oldTransaction.supplier_id;

    // Find all transactions that were paid by this payment
    const affectedTransactions = await Transaction.findAll({
      where: {
        [oldTransaction.transaction_for === "customer" ? 'customer_id' : 'supplier_id']: entityId,
        business_owner_id: userId,
        [Op.or]: [
          { paidAmount: { [Op.gt]: 0 } },
          { remainingAmount: { [Op.lt]: Sequelize.col('amount') } }
        ]
      },
      order: [['transaction_date', 'ASC']],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    // Reverse the payment distribution logic
    // This is complex - we need to rebuild the payment distribution
    // For simplicity, we'll recalculate all payments for this entity
    await recalculateEntityPayments(entityId, oldTransaction.transaction_for, userId, t);
  }
}

// Helper function to recalculate all payments for an entity
async function recalculateEntityPayments(entityId, entityType, userId, t) {
  // Get all transactions for this entity in chronological order
  const allTransactions = await Transaction.findAll({
    where: {
      [entityType === "customer" ? 'customer_id' : 'supplier_id']: entityId,
      business_owner_id: userId
    },
    order: [['transaction_date', 'ASC'], ['createdAt', 'ASC']],
    transaction: t
  });

  // Separate you_gave and you_got transactions
  const gaveTransactions = allTransactions.filter(tx => tx.transaction_type === "you_gave");
  const gotTransactions = allTransactions.filter(tx => tx.transaction_type === "you_got");

  // Reset all paidAmount and remainingAmount for you_gave transactions
  for (const tx of gaveTransactions) {
    await tx.update({
      paidAmount: 0,
      remainingAmount: tx.amount
    }, { transaction: t });
  }

  // Apply each you_got transaction to pay off oldest you_gave transactions first
  for (const gotTx of gotTransactions) {
    let remainingPayment = Number(gotTx.amount);

    for (const gaveTx of gaveTransactions) {
      if (remainingPayment <= 0) break;
      if (gaveTx.remainingAmount <= 0) continue;

      const gaveRemaining = parseFloat(gaveTx.remainingAmount);

      if (remainingPayment >= gaveRemaining) {
        // FULLY PAY THIS TRANSACTION
        await gaveTx.update({
          paidAmount: Sequelize.literal(`paidAmount + ${gaveRemaining}`),
          remainingAmount: 0
        }, { transaction: t });

        remainingPayment -= gaveRemaining;
      } else {
        // PARTIALLY PAY THIS TRANSACTION
        await gaveTx.update({
          paidAmount: Sequelize.literal(`paidAmount + ${remainingPayment}`),
          remainingAmount: Sequelize.literal(`remainingAmount - ${remainingPayment}`)
        }, { transaction: t });

        remainingPayment = 0;
      }
    }
  }
}

async function createMirrorTransaction(originalTransaction, t) {

  const trx = originalTransaction.get({ plain: true });

  const sourceEntity = trx.transaction_for === "customer"
    ? await Customer.findByPk(trx.customer_id, { transaction: t })
    : await Supplier.findByPk(trx.supplier_id, { transaction: t });

  if (!sourceEntity) throw new Error("Source entity not found");

  const oppositeUser = await User.findOne({
    where: { mobile: sourceEntity.mobile },
    transaction: t
  });

  if (!oppositeUser) return; // silently skip if not linked

  const creatorUser = await User.findByPk(sourceEntity.created_user, { transaction: t });

  if (!creatorUser) throw new Error("Creator user not found");

  const relatedEntity = trx.transaction_for === "customer"
    ? await Supplier.findOne({
      where: { created_user: oppositeUser.id, mobile: creatorUser.mobile },
      transaction: t
    })
    : await Customer.findOne({
      where: { created_user: oppositeUser.id, mobile: creatorUser.mobile },
      transaction: t
    });

  if (!relatedEntity) return;

  const oppositeType =
    trx.transaction_type === "you_gave" ? "you_got" :
      trx.transaction_type === "you_got" ? "you_gave" :
        "you_discount";

  // Generate a unique group ID for this transaction pair
  const transactionGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Create mirror transaction
  const mirrorTransaction = await Transaction.create({
    business_owner_id: oppositeUser.owner_user_id,
    created_user: oppositeUser.id,
    transaction_type: oppositeType,
    transaction_for: trx.transaction_for === "customer" ? "supplier" : "customer",
    customer_id: trx.transaction_for === "supplier" ? relatedEntity.id : null,
    supplier_id: trx.transaction_for === "customer" ? relatedEntity.id : null,
    amount: trx.amount,
    paidAmount: trx.paidAmount,
    remainingAmount: trx.remainingAmount,
    description: trx.description,
    transaction_date: trx.transaction_date,
    due_date: trx.due_date,
    paymentType: trx.paymentType,
    transaction_pic: trx.transaction_pic,
    bill_id: trx.bill_id,
    is_Approved: trx.is_Approved,
    status: trx.status,
    transaction_group_id: transactionGroupId, // Store group ID
    mirror_transaction_id: null // Will update after both are created
  }, { transaction: t });

  // Update original transaction with mirror ID and group ID
  await originalTransaction.update({
    mirror_transaction_id: mirrorTransaction.id,
    transaction_group_id: transactionGroupId
  }, { transaction: t });

  // Update mirror transaction with original transaction ID
  await mirrorTransaction.update({
    mirror_transaction_id: originalTransaction.id
  }, { transaction: t });
}

// Helper function to update mirror transaction using direct relation
async function updateMirrorTransaction(oldTransaction, updatedData, t) {
  try {
    if (!oldTransaction.mirror_transaction_id) {
      console.log("No mirror transaction linked");
      return null;
    }
console.log("updatedData::",updatedData)
    const mirrorTransaction = await Transaction.findOne({
      where: {
        id: oldTransaction.mirror_transaction_id
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!mirrorTransaction) {
      throw new Error("Mirror transaction not found");
    }

    const oppositeUser = await User.findOne({
      where: {
        id: mirrorTransaction.created_user
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!oppositeUser) {
      throw new Error("Opposite user not found");
    }

    let oppositeEntity = null;

    if (mirrorTransaction.transaction_for === "customer") {
      oppositeEntity = await Customer.findOne({
        where: {
          id: mirrorTransaction.customer_id,
          business_owner_id: oppositeUser.id
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    } else if (mirrorTransaction.transaction_for === "supplier") {
      oppositeEntity = await Supplier.findOne({
        where: {
          id: mirrorTransaction.supplier_id,
          business_owner_id: oppositeUser.id
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    if (!oppositeEntity) {
      throw new Error("Opposite entity not found");
    }

    // ============================================
    // DETERMINE MIRROR TYPE
    // ============================================

    const oppositeTypeMap = {
      you_gave: "you_got",
      you_got: "you_gave",
      you_discount: "you_discount"
    };

    const oppositeType =
      oppositeTypeMap[updatedData.transaction_type];

    if (!oppositeType) {
      throw new Error(
        `Invalid transaction type: ${updatedData.transaction_type}`
      );
    }

    console.log("MIRROR UPDATE:", {
      mainTransactionId: oldTransaction.id,
      mainOldType: oldTransaction.transaction_type,
      mainNewType: updatedData.transaction_type,

      mirrorTransactionId: mirrorTransaction.id,
      mirrorOldType: mirrorTransaction.transaction_type,
      mirrorNewType: oppositeType,

      oldAmount: mirrorTransaction.amount,
      newAmount: updatedData.amount
    });

    // ============================================
    // REVERSE OLD MIRROR EFFECT
    // ============================================

    await applyBalanceChanges({
      type: mirrorTransaction.transaction_type,
      amount: mirrorTransaction.amount,
      customerOrSupplier: oppositeEntity,
      user: oppositeUser,
      reverse: true
    });

    // ============================================
    // APPLY NEW MIRROR EFFECT
    // ============================================

    await applyBalanceChanges({
      type: oppositeType,
      amount: updatedData.amount,
      customerOrSupplier: oppositeEntity,
      user: oppositeUser,
      reverse: false
    });

    // ============================================
    // SAVE BALANCES
    // ============================================

    await oppositeEntity.save({
      transaction: t
    });

    await oppositeUser.save({
      transaction: t
    });

    // ============================================
    // UPDATE MIRROR TRANSACTION
    // ============================================

    await mirrorTransaction.update({
      amount: updatedData.amount,

      transaction_type: oppositeType,

      paidAmount:
        updatedData.paymentType === "paid"
          ? updatedData.amount
          : 0,

      remainingAmount:
        updatedData.paymentType === "credit"
          ? updatedData.amount
          : 0,

      description:
        updatedData.description !== undefined
          ? updatedData.description
          : mirrorTransaction.description,

      due_date:
        updatedData.due_date !== undefined
          ? updatedData.due_date
          : mirrorTransaction.due_date,

      paymentType:
        updatedData.paymentType !== undefined
          ? updatedData.paymentType
          : mirrorTransaction.paymentType,

      transaction_date:
        updatedData.transaction_date !== undefined
          ? updatedData.transaction_date
          : mirrorTransaction.transaction_date

    }, {
      transaction: t
    });

    return mirrorTransaction;

  } catch (error) {
    console.error("Error updating mirror transaction:", error);
    throw error;
  }
}

// Helper function for updating mirror transactions when bill is updated
async function updateMirrorTransactionForBill(oldTransaction, updateData, t) {
  try {
    if (!oldTransaction.mirror_transaction_id) {
      console.log("No mirror transaction linked");
      return null;
    }

    // Find the mirror transaction
    const mirrorTransaction = await Transaction.findOne({
      where: { id: oldTransaction.mirror_transaction_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!mirrorTransaction) {
      console.log("Mirror transaction not found");
      return null;
    }

    // Find the opposite user (owner of mirror transaction)
    const oppositeUser = await User.findOne({
      where: { id: mirrorTransaction.created_user },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!oppositeUser) {
      console.log("Opposite user not found");
      return null;
    }

    // Find the opposite entity (customer)
    let oppositeEntity = null;
    if (mirrorTransaction.transaction_for === "customer") {
      oppositeEntity = await Customer.findOne({
        where: {
          id: mirrorTransaction.customer_id,
          business_owner_id: oppositeUser.id
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    if (!oppositeEntity) {
      console.log("Opposite entity not found");
      return null;
    }

    // If amount is being updated, reverse old and apply new
    if (updateData.amount !== undefined && updateData.amount !== oldTransaction.amount) {
      // Calculate opposite transaction type
      const oppositeType =
        oldTransaction.transaction_type === "you_gave" ? "you_got" :
          oldTransaction.transaction_type === "you_got" ? "you_gave" :
            "you_discount";

      // Reverse old mirror transaction effects
      await applyBalanceChanges({
        type: mirrorTransaction.transaction_type,
        amount: mirrorTransaction.amount,
        customerOrSupplier: oppositeEntity,
        user: oppositeUser,
        reverse: true
      });

      // Apply new mirror transaction effects
      await applyBalanceChanges({
        type: oppositeType,
        amount: updateData.amount,
        customerOrSupplier: oppositeEntity,
        user: oppositeUser
      });

      // Save opposite user and entity
      await oppositeEntity.save({ transaction: t });
      await oppositeUser.save({ transaction: t });
    }

    // Update mirror transaction fields
    const mirrorUpdateData = {};
    if (updateData.amount !== undefined) mirrorUpdateData.amount = updateData.amount;
    if (updateData.description !== undefined) mirrorUpdateData.description = updateData.description;
    if (updateData.bill_date !== undefined) mirrorUpdateData.bill_date = updateData.bill_date;
    if (updateData.payment_status !== undefined) mirrorUpdateData.payment_status = updateData.payment_status;

    if (Object.keys(mirrorUpdateData).length > 0) {
      await mirrorTransaction.update(mirrorUpdateData, { transaction: t });
    }

    return mirrorTransaction;

  } catch (error) {
    console.error("Error updating mirror transaction for bill:", error);
    throw error;
  }
}

module.exports = {
  createMirrorTransaction,
  updateMirrorTransaction,
  updateMirrorTransactionForBill,
  handlePaymentDistribution,
  reversePaymentDistribution
};
