const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Otp = sequelize.define('Otp', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // 👈 must match your User table name
      key: 'id'
    }
  },
  otp: {
    type: DataTypes.STRING(6),
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  is_used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'otps',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['otp'] },
    { fields: ['expires_at'] },
    { fields: ['is_used'] }
  ]
});

module.exports = Otp;
