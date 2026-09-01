const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserFcmToken = sequelize.define('UserFcmToken', {
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
  user_mobile: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  fcm_token: {
    type: DataTypes.STRING(600),
    allowNull: false,
  },
  device_type: {
    type: DataTypes.ENUM('android', 'ios', 'web'),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'user_fcm_tokens',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['fcm_token']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = UserFcmToken;
