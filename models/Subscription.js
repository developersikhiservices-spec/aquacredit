// models/Subscription.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },

  // FOREIGN KEY BASED ON PLAN NAME
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'plans',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },  
  purchased_user_count: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  
  total_price: {
    type: DataTypes.DECIMAL(10,2),
    allowNull: false
  },  
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },

  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_cancelled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'subscriptions'
});

module.exports = Subscription;
