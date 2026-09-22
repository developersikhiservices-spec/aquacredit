const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Customer = require('./Customer');
const User = require('./User');
const Supplier = require('./Supplier');
const Bill = require('./Bill');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  business_owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  created_user: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'suppliers',
      key: 'id'
    }
  },
  transaction_type: {
    type: DataTypes.ENUM('you_gave', 'you_got', 'you_discount'),
    allowNull: false
  },
  transaction_for: {
    type: DataTypes.ENUM('customer', 'supplier'),
    allowNull: false
  },
  paymentType: {
    type: DataTypes.ENUM('paid', 'credit'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  paidAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  remainingAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  mirror_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id'
    },
    comment: 'Links to the mirror transaction in the opposite user\'s account'
  },

  // Optional: Add a group ID to link multiple related transactions
  transaction_group_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'UUID to group related transactions together'
  },
  description: {
    type: DataTypes.TEXT('long'), // optional: 'long' for very long text
    allowNull: true,
    charset: 'utf8mb4',           // supports full Unicode including emojis
    collate: 'utf8mb4_unicode_ci' // proper Unicode collation
  },
  is_Approved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_Deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  transaction_pic: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const value = this.getDataValue('transaction_pic');
      return Array.isArray(value) ? value : value ? [value] : [];
    },
    set(value) {
      // Ensure the value is always an array
      if (Array.isArray(value)) {
        this.setDataValue('transaction_pic', value);
      } else if (value === null || value === undefined) {
        this.setDataValue('transaction_pic', null);
      } else {
        // Wrap single values in an array
        this.setDataValue('transaction_pic', [value]);
      }
    }
  },
  is_Bill: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  bill_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  transaction_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  delete_date: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'transactions',
  indexes: [
    {
      fields: ['business_owner_id']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['supplier_id']
    },
    {
      fields: ['transaction_date']
    },
    {
      fields: ['transaction_type']
    }
  ]
});

Transaction.afterCreate(async (transaction, options) => {

  const t = options.transaction;

  if (!t) {
    throw new Error("Transaction hook must run inside a DB transaction");
  }

  const amt = Number(transaction.amount);

  // 🔒 Lock User
  const user = await User.findOne({
    where: { id: transaction.created_user },
    transaction: t,
    lock: t.LOCK.UPDATE
  });

  if (!user) throw new Error("User not found in afterCreate hook");

  // ===============================
  // CUSTOMER TRANSACTION
  // ===============================
  if (transaction.transaction_for === "customer") {

    const customer = await Customer.findOne({
      where: { id: transaction.customer_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!customer) throw new Error("Customer not found in afterCreate hook");

    if (transaction.transaction_type === "you_gave") {

      await user.update({
        current_balance: Number(user.current_balance) - amt,
        total_credit_given: Number(user.total_credit_given) + amt,
        credit_given_count: user.credit_given_count + 1
      }, { transaction: t });

      await customer.update({
        current_balance: Number(customer.current_balance) - amt,
        total_credit_given: Number(customer.total_credit_given) + amt
      }, { transaction: t });

    } else if (transaction.transaction_type === "you_got") {

      await user.update({
        current_balance: Number(user.current_balance) + amt,
        total_payment_got: Number(user.total_payment_got) + amt,
        payment_got_count: user.payment_got_count + 1
      }, { transaction: t });

      await customer.update({
        current_balance: Number(customer.current_balance) + amt,
        total_payment_got: Number(customer.total_payment_got) + amt
      }, { transaction: t });

    } else if (transaction.transaction_type === "you_discount") {

      await user.update({
        current_balance: Number(user.current_balance) + amt,
        total_discount_given: Number(user.total_discount_given) + amt
      }, { transaction: t });

      await customer.update({
        current_balance: Number(customer.current_balance) + amt,
        total_discount_given: Number(customer.total_discount_given) + amt
      }, { transaction: t });
    }
  }

  // ===============================
  // SUPPLIER TRANSACTION
  // ===============================
  else if (transaction.transaction_for === "supplier") {

    const supplier = await Supplier.findOne({
      where: { id: transaction.supplier_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!supplier) throw new Error("Supplier not found in afterCreate hook");

    if (transaction.transaction_type === "you_gave") {

      await user.update({
        current_balance: Number(user.current_balance) - amt,
        total_credit_given: Number(user.total_credit_given) + amt,
        credit_given_count: user.credit_given_count + 1
      }, { transaction: t });

      await supplier.update({
        current_balance: Number(supplier.current_balance) - amt,
        total_credit_given: Number(supplier.total_credit_given) + amt
      }, { transaction: t });

    } else if (transaction.transaction_type === "you_got") {

      await user.update({
        current_balance: Number(user.current_balance) + amt,
        total_payment_got: Number(user.total_payment_got) + amt,
        payment_got_count: user.payment_got_count + 1
      }, { transaction: t });

      await supplier.update({
        current_balance: Number(supplier.current_balance) + amt,
        total_payment_got: Number(supplier.total_payment_got) + amt
      }, { transaction: t });

    } else if (transaction.transaction_type === "you_discount") {

      await user.update({
        current_balance: Number(user.current_balance) + amt,
        total_discount_given: Number(user.total_discount_given) + amt
      }, { transaction: t });

      await supplier.update({
        current_balance: Number(supplier.current_balance) + amt,
        total_discount_given: Number(supplier.total_discount_given) + amt
      }, { transaction: t });
    }
  }

  if (bill_id !== null) {
    const bill = await Bill.findOne({ where: { id: transaction.bill_id } })
    if (bill) {
      await bill.update(
        { transaction_id: transaction.id },
        { transaction: t }
      );
    }
  }

});

module.exports = Transaction;