const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SubscriptionMember = sequelize.define('SubscriptionMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  subscription_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subscriptions',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  }

}, {
  indexes: [
    {
      unique: true,
      fields: ['subscription_id', 'user_id']
    }
  ],  
  tableName: 'subscription_members'
});

module.exports = SubscriptionMember;
