const cron = require('node-cron');
const { Subscription, User } = require('../models');
const { Op } = require('sequelize');

cron.schedule('0 0 * * *', async () => {
  console.log("Running subscription expiry check...");

  const expiredSubscriptions = await Subscription.findAll({
    where: {
      end_date: { [Op.lt]: new Date() },
      is_active: true
    }
  });

  for (const subscription of expiredSubscriptions) {

    // deactivate subscription
    subscription.is_active = false;
    await subscription.save();

    // deactivate employees
    await User.update(
      { is_active: false },
      {
        where: {
          owner_user_id: subscription.user_id,
          role: 'employee'
        }
      }
    );
  }

  console.log("Subscription expiry check completed.");
});
