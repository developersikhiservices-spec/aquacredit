// models/ReferralTransaction.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReferralTransaction = sequelize.define('ReferralTransaction', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    referrer_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    referred_user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    reward_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'completed'), defaultValue: 'pending' },
    completed_at: { type: DataTypes.DATE },
}, { tableName: 'referral_transactions', timestamps: true });

module.exports = ReferralTransaction;