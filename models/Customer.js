const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');
const Supplier = require('./Supplier');
const { createCustomer } = require('../controller/customerController');

const Customer = sequelize.define('Customer', {
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
  photo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  nickName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  mobile: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      len: [10, 15]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  current_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_credit_given: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_payment_got: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_discount_got: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  defaulter_stage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  delay_days: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  status: {
    type: DataTypes.STRING(15),
    defaultValue: 'Active'
  }
}, {
  tableName: 'customers',
  indexes: [
    {
      fields: ['business_owner_id']
    },
    {
      fields: ['mobile']
    },
    {
      fields: ['name']
    },
    {
      fields: ['current_balance']
    }
  ]
});

module.exports = Customer;