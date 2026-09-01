const express = require('express');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const startDefaulterCron = require('./middleware/updateDefaultersCron');
const { sequelize, testConnection } = require('./config/database');
const models = require('./models');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const supplierRoutes = require('./routes/supplier');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const OTPRoutes = require('./routes/OTP');
const dashboardRoutes = require('./routes/dashboard');
const planRoutes = require('./routes/plan');
const subscriptionRoutes = require('./routes/subscription');
const fcmTokenRoutes = require('./routes/FCMToken');
const paymentsRoutes = require('./routes/payments');
const userRoutes = require('./routes/user');
const {router: notificationRoutes} = require('./routes/notification');

const authMobileRoutes = require('./mobileRoutes/auth');
const billMobileRoutes = require('./mobileRoutes/bill');
const customerMobileRoutes = require('./mobileRoutes/customers');
const supplierMobileRoutes = require('./mobileRoutes/supplier');
const transactionMobileRoutes = require('./mobileRoutes/transactions');
const uploadMobileRoutes = require('./mobileRoutes/upload');
const OTPMobileRoutes = require('./mobileRoutes/OTP');
const dashboardMobileRoutes = require('./mobileRoutes/dashboard');
const planMobileRoutes = require('./mobileRoutes/plan');
const subscriptionMobileRoutes = require('./mobileRoutes/subscription');
const userMobileRoutes = require('./mobileRoutes/user');
const itemMobileRoutes = require('./mobileRoutes/item');
const fcmTokenMobileRoutes = require('./mobileRoutes/FCMToken');
const rozarpayOrdersRoutes = require('./mobileRoutes/rozarpayOrders');
const paymentsMobileRoutes = require('./mobileRoutes/payments');
const {
  router: notificationMobileRoutes,
  sendMultiNotification,
  sendSingleNotification
} = require('./mobileRoutes/notification');

const razorpay = new Razorpay({
  key_id: "rzp_test_RfcfxfJ2sIZdao",
  key_secret: "NzCej6Cd4rVLDdperQDgdhh4",
});

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration - Accept all origins
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

/* ===========================
   RAZORPAY WEBHOOK (FIRST)
=========================== */
app.use(
  '/9023/api/payment_rozarpay',
  express.raw({ type: 'application/json' }),
  rozarpayOrdersRoutes
);

/* ===========================
   BODY PARSERS (AFTER)
=========================== */
// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/uploads', express.static('uploads'));

const WEB_PREFIX = '/api';

// Routes
app.use(`${WEB_PREFIX}/auth`, authRoutes);
app.use(`${WEB_PREFIX}/customers`, customerRoutes);
app.use(`${WEB_PREFIX}/supplier`, supplierRoutes);
app.use(`${WEB_PREFIX}/transactions`, transactionRoutes);
app.use(`${WEB_PREFIX}/admin`, adminRoutes);
app.use(`${WEB_PREFIX}/upload`, uploadRoutes);
app.use(`${WEB_PREFIX}/otp`, OTPRoutes);
app.use(`${WEB_PREFIX}/dashboard`,dashboardRoutes);
app.use(`${WEB_PREFIX}/plans`, planRoutes);
app.use(`${WEB_PREFIX}/subscriptions`, subscriptionRoutes);
app.use(`${WEB_PREFIX}/notification`, notificationRoutes);
app.use(`${WEB_PREFIX}/fcmToken`, fcmTokenRoutes);
app.use(`${WEB_PREFIX}/payment`, paymentsRoutes);
app.use(`${WEB_PREFIX}/user`, userRoutes);

const MOBILE_PREFIX = '/9023/api';
// MobileRoutes
app.use(`${MOBILE_PREFIX}/auth`, authMobileRoutes);
app.use(`${MOBILE_PREFIX}/bill`, billMobileRoutes);
app.use(`${MOBILE_PREFIX}/item`, itemMobileRoutes);
app.use(`${MOBILE_PREFIX}/customers`, customerMobileRoutes);
app.use(`${MOBILE_PREFIX}/supplier`, supplierMobileRoutes);
app.use(`${MOBILE_PREFIX}/transactions`, transactionMobileRoutes);
app.use(`${MOBILE_PREFIX}/upload`, uploadMobileRoutes);
app.use(`${MOBILE_PREFIX}/otp`, OTPMobileRoutes);
app.use(`${MOBILE_PREFIX}/dashboard`,dashboardMobileRoutes);
app.use(`${MOBILE_PREFIX}/plans`, planMobileRoutes);
app.use(`${MOBILE_PREFIX}/subscriptions`, subscriptionMobileRoutes);
app.use(`${MOBILE_PREFIX}/notification`, notificationMobileRoutes);
app.use(`${MOBILE_PREFIX}/user`, userMobileRoutes);
app.use(`${MOBILE_PREFIX}/fcmToken`, fcmTokenMobileRoutes);
app.use(`${MOBILE_PREFIX}/payment_rozarpay`, rozarpayOrdersRoutes);
app.use(`${MOBILE_PREFIX}/payment`, paymentsMobileRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Credit Management API is running',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    
    // Sync database models
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
    } else {
      await sequelize.sync();
    }
        console.log('✅ Database models synchronized');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      startDefaulterCron()
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();