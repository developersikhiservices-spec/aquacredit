// models/Item.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Item = sequelize.define('Item', {
  itemName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  mrp: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  barcode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cess: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  unitValue: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gstValue: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  rateType: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'items',
  timestamps: false,
});

module.exports = Item;
