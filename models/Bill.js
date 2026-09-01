const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Bill = sequelize.define('Bill', {
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
    type: DataTypes.ENUM('you_gave', 'you_got'),
    allowNull: false
  },
  payment_status: {
    type: DataTypes.ENUM('paid', 'unpaid'),
    allowNull: true
  },
  items: {
    type: DataTypes.JSON, // Use JSONB if you're on Postgres
    allowNull: true,
    defaultValue: []
  },
  ExtraCharges: {
    type: DataTypes.JSON, // Use JSONB if you're on Postgres
    allowNull: true,
    defaultValue: []
  }, 
  bill_type: {
    type: DataTypes.ENUM('BILL', 'QUOTATION'),
    allowNull: false
  },
  transaction_for: {
    type: DataTypes.ENUM('customer', 'supplier'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bill_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bill_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  bill_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'bills',
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
      fields: ['bill_date']
    },
    {
      fields: ['transaction_type']
    }
  ]
});

module.exports = Bill;