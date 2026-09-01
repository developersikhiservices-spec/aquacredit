const { Op } = require('sequelize');
const { Subscription, SubscriptionMember, User } = require('../models');

async function checkActiveSubscription(req, res, next) {
  try {
    const userId = req.body.userId; // from auth middleware

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔹 If employee → check owner subscription
    let ownerId = user.role === 'employee'
      ? user.owner_user_id
      : user.id;

    const today = new Date();

    const activeSubscription = await Subscription.findOne({
      where: {
        owner_id: ownerId,
        is_active: true,
        is_cancelled: false,
        start_date: { [Op.lte]: today },
        end_date: { [Op.gte]: today }
      }
    });

    if (!activeSubscription) {
      return res.status(403).json({
        message: "Subscription expired or inactive"
      });
    }

    next();

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
}

module.exports = checkActiveSubscription;
