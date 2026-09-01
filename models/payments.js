const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Transaction = require('./Transaction'); // your existing Transaction model

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  razorpay_order_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  razorpay_payment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'INR'
  },
  subscriber_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  subscriber_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  subscriber_phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  subscribePlan: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED'),
    defaultValue: 'PENDING'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
    // Add this field to your Payment model
metadata: {
  type: DataTypes.JSON,
  allowNull: true,
  defaultValue: {}
}
}, {
  tableName: 'payments',
  indexes: [
    { fields: ['razorpay_order_id'] },
    { fields: ['status'] }
  ]
});

// Relationship: Payment belongs to a Transaction
// Payment.belongsTo(Transaction, { foreignKey: 'transaction_id' });

module.exports = Payment;
