const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AdminRefreshToken = sequelize.define('AdminRefreshToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  admin_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'admin',
      key: 'id'
    }
  },
  token: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'admin_refresh_tokens',
  indexes: [
    {
      fields: ['admin_id']
    },
    {
      fields: ['token']
    },
    {
      fields: ['expires_at']
    }
  ]
});

module.exports = AdminRefreshToken;