// models/Plan.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    // unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  points: {
    type: DataTypes.JSON, // Use JSONB if you're on Postgres
    allowNull: true,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('points');
      try {
        return Array.isArray(rawValue) ? rawValue : JSON.parse(rawValue || "[]");
      } catch (e) {
        return [];
      }
    }
  },
  NOU: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  duration_days: {
    type: DataTypes.INTEGER, // Duration in days (e.g., 30, 365)
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'plans'
});

module.exports = Plan;
