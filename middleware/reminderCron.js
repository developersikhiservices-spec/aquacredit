const cron = require('node-cron');
const { Op } = require('sequelize');
const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');
const notificationService = require('../services/notification.service');

cron.schedule('0 9 * * *', async () => {
  console.log("Running Reminder Cron...");

  const today = new Date();
  const threeDaysLater = new Date();
  threeDaysLater.setDate(today.getDate() + 3);

  // 🔹 1. Subscription Expiry Reminder
  const expiringSubscriptions = await Subscription.findAll({
    where: {
      end_date: {
        [Op.between]: [today, threeDaysLater]
      },
      is_active: true
    }
  });

  for (const sub of expiringSubscriptions) {
    await notificationService.sendSubscriptionReminder(sub.user_id);
  }

  // 🔹 2. Due Payment Reminder
  const dueTransactions = await Transaction.findAll({
    where: {
      due_date: today
    }
  });

  for (const txn of dueTransactions) {
    await notificationService.sendDueReminder(txn.customer_id);
  }

  console.log("Reminder Cron Completed");
});
