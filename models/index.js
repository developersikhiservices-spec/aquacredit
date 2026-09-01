const { sequelize } = require('../config/database');
const User = require('./User');
const Admin = require('./admin');
const Customer = require('./Customer');
const Transaction = require('./Transaction');
const RefreshToken = require('./RefreshToken');
const Feedback = require('./Feedback');
const Notification = require('./Notification');
const FCMToken = require('./FCMToken');
const Supplier = require('./Supplier');
const Subscription = require('./Subscription');
const Plan = require('./Plan');
const Otp = require('./OTP');
const AdminRefreshToken = require('./AdminRefreshToken');
const Bill = require('./Bill'); // ✅ Fixed casing
const Item = require('./Items');
const Payment = require('./payments');
const SubscriptionMember = require('./SubscriptionMember');
const ReferralTransaction = require('./ReferralTransaction');

// Define associations
User.hasMany(Customer, {
  foreignKey: 'business_owner_id',
  as: 'customers',
  onDelete: 'CASCADE'
});

Customer.belongsTo(User, {
  foreignKey: 'business_owner_id',
  as: 'businessOwner'
});

User.hasMany(Supplier, {
  foreignKey: 'business_owner_id',
  as: 'suppliers',
  onDelete: 'CASCADE'
});

Supplier.belongsTo(User, {
  foreignKey: 'business_owner_id',
  as: 'businessOwner',
});

User.hasMany(Transaction, {
  foreignKey: 'business_owner_id',
  as: 'transactions',
  onDelete: 'CASCADE'
});

Transaction.belongsTo(User, {
  foreignKey: 'business_owner_id',
  as: 'businessOwner'
});

Customer.hasMany(Transaction, {
  foreignKey: 'customer_id',
  as: 'transactions',
  onDelete: 'CASCADE'
});

Transaction.belongsTo(Customer, {
  foreignKey: 'customer_id',
  as: 'customer'
});

Supplier.hasMany(Transaction, {
  foreignKey: 'supplier_id',
  as: 'transactions',
  onDelete: 'CASCADE'
});

Transaction.belongsTo(Supplier, {
  foreignKey: 'supplier_id',
  as: 'supplier'
});

User.hasMany(RefreshToken, {
  foreignKey: 'user_id',
  as: 'refreshTokens',
  onDelete: 'CASCADE'
});

RefreshToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

Admin.hasMany(AdminRefreshToken, {
  foreignKey: 'admin_id',
  as: 'adminRefreshTokens',
  onDelete: 'CASCADE'
});

AdminRefreshToken.belongsTo(Admin, {
  foreignKey: 'admin_id',
  as: 'admin'
});

User.hasMany(Feedback, {
  foreignKey: 'user_id',
  as: 'feedback',
  onDelete: 'CASCADE'
});

Feedback.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'CASCADE'
});

Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

User.hasMany(FCMToken, {
  foreignKey: 'user_id',
  as: 'fcmTokens',
  onDelete: 'CASCADE'
});

// Each FCM token belongs to one user
FCMToken.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

Otp.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

User.hasMany(Otp, {
  foreignKey: 'user_id',
  as: 'otps',
  onDelete: 'CASCADE'
});

User.hasMany(Subscription, {
  foreignKey: 'user_id',
  as: 'subscriptions',
  onDelete: 'CASCADE'
});

Subscription.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE'
});

// Plan -> Subscription
// Plan -> Subscription
Plan.hasMany(Subscription, {
  foreignKey: 'plan_id',
  as: 'subscriptions'
});

Subscription.belongsTo(Plan, {
  foreignKey: 'plan_id',
  as: 'planDetails'
}); 

Bill.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Bill.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Bill.belongsTo(User, { foreignKey: 'business_owner_id', as: 'user' });

Customer.hasMany(Bill, { foreignKey: 'customer_id', as: 'bills' });
Supplier.hasMany(Bill, { foreignKey: 'supplier_id', as: 'bills' });
User.hasMany(Bill, { foreignKey: 'business_owner_id', as: 'bills' });

Bill.belongsTo(Transaction, {
  foreignKey: 'transaction_id',
  as: 'transaction'
});

Transaction.hasOne(Bill, {
  foreignKey: 'transaction_id',
  as: 'bill'
});

/* OWNER -> EMPLOYEES */
User.hasMany(User, {
  foreignKey: 'owner_user_id',
  as: 'employees'
});

User.belongsTo(User, {
  foreignKey: 'owner_user_id',
  as: 'owner'
});

Subscription.hasMany(SubscriptionMember, {
  foreignKey: 'subscription_id',
  as: 'members', 
});

SubscriptionMember.belongsTo(Subscription, {
  as: 'subscription',
  foreignKey: 'subscription_id'
});

User.hasMany(SubscriptionMember, {
  foreignKey: 'user_id'
});

SubscriptionMember.belongsTo(User, {
  as: 'user',
  foreignKey: 'user_id'
});


module.exports = {
  sequelize,
  Admin,
  User,
  AdminRefreshToken,
  Subscription,
  Plan,
  FCMToken,
  Supplier,
  Otp,
  Item,
  Customer,
  Bill,
  Transaction,
  RefreshToken,
  Feedback,
  Notification,
  Payment,
  ReferralTransaction
};
