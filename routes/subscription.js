const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Plan = require('../models/Plan');
const SubscriptionMember = require('../models/SubscriptionMember');
const { Op } = require('sequelize');
const moment = require('moment');

// Create Subscription
router.post('/', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      user_id,
      plan_id,
      purchased_user_count = 1,
      total_price,
      start_date,
      end_date,
      member_ids = [] // Additional member user IDs
    } = req.body;

    // Validate plan exists
    const plan = await Plan.findByPk(plan_id, { transaction });
    if (!plan) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Check if user already has active subscription
    const existingSubscription = await Subscription.findOne({
      where: {
        user_id,
        is_active: true,
        is_cancelled: false,
        end_date: { [Op.gte]: moment().format('YYYY-MM-DD') }
      },
      transaction
    });

    if (existingSubscription) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: 'User already has an active subscription',
        subscription: existingSubscription
      });
    }

    // Validate purchased_user_count doesn't exceed plan limit
    if (purchased_user_count > plan.NOU) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: `Cannot purchase more than ${plan.NOU} users for this plan` 
      });
    }

    const calculatedStartDate = start_date || moment().format('YYYY-MM-DD');
    const calculatedEndDate = end_date || moment().add(plan.duration_days, 'days').format('YYYY-MM-DD');

    // Create subscription
    const subscription = await Subscription.create({
      user_id,
      plan_id,
      purchased_user_count,
      total_price,
      start_date: calculatedStartDate,
      end_date: calculatedEndDate,
      is_active: true,
      is_cancelled: false
    }, { transaction });

    // Add main user as subscription member
    await SubscriptionMember.create({
      subscription_id: subscription.id,
      user_id
    }, { transaction });

    // Add additional members if provided
    if (member_ids && member_ids.length > 0) {
      // Ensure total members don't exceed purchased count
      const totalMembers = 1 + member_ids.length; // Main user + additional
      if (totalMembers > purchased_user_count) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: `Cannot add more than ${purchased_user_count - 1} additional members` 
        });
      }

      // Add each member
      for (const memberId of member_ids) {
        // Check if user exists
        const member = await User.findByPk(memberId, { transaction });
        if (!member) {
          await transaction.rollback();
          return res.status(404).json({ error: `User with ID ${memberId} not found` });
        }

        await SubscriptionMember.create({
          subscription_id: subscription.id,
          user_id: memberId
        }, { transaction }); 
      }
    }

    await transaction.commit();

    // Fetch created subscription with relations
    const createdSubscription = await Subscription.findByPk(subscription.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile']
        },
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'description', 'price', 'duration_days', 'NOU', 'points']
        },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'mobile']
            }
          ]
        }
      ]
    });

    res.status(201).json({
      success:true,
      message: 'Subscription created successfully',
      subscription: createdSubscription
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Create subscription error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Get All Subscriptions with User, Plan and Members details
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      plan_id,
      user_id,
      startDate,
      endDate
    } = req.query;

    const offset = (page - 1) * limit;
    let whereCondition = {};

    // Filter by status
    if (status) {
      const currentDate = moment().format('YYYY-MM-DD');
      if (status === 'active') {
        whereCondition = {
          ...whereCondition,
          is_active: true,
          is_cancelled: false,
          end_date: { [Op.gte]: currentDate }
        };
      } else if (status === 'expired') {
        whereCondition = {
          ...whereCondition,
          end_date: { [Op.lt]: currentDate }
        };
      } else if (status === 'cancelled') {
        whereCondition = {
          ...whereCondition,
          is_cancelled: true
        };
      }
    }

    if (plan_id) whereCondition.plan_id = plan_id;
    if (user_id) whereCondition.user_id = user_id;
    
    if (startDate || endDate) {
      whereCondition.start_date = {};
      if (startDate) whereCondition.start_date[Op.gte] = startDate;
      if (endDate) whereCondition.start_date[Op.lte] = endDate;
    }

    const { rows: subscriptions, count: total } = await Subscription.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile', 'businessName']
        },
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'description', 'price', 'duration_days', 'NOU', 'points', 'is_active']
        },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'mobile']
            }
          ]
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate additional stats for each subscription
    const enrichedSubscriptions = subscriptions.map(sub => {
      const subData = sub.toJSON();
      const currentDate = moment();
      const endDate = moment(sub.end_date);
      
      subData.status = currentDate.isAfter(endDate) ? 'expired' : 
                       sub.is_cancelled ? 'cancelled' : 
                       sub.is_active ? 'active' : 'inactive';
      
      subData.daysRemaining = currentDate.isBefore(endDate) ? 
                              endDate.diff(currentDate, 'days') : 0;
      
      subData.memberCount = sub.members?.length || 0;
      subData.availableSlots = sub.purchased_user_count - (sub.members?.length || 0);
      
      return subData;
    });

    res.json({
      subscriptions: enrichedSubscriptions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get subscriptions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Current User's Active Subscription
router.get('/my', async (req, res) => {
  try {
    // Assuming user ID is available from auth middleware
    const userId = req.user.id; // Adjust based on your auth setup
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        is_active: true,
        is_cancelled: false,
        end_date: { [Op.gte]: moment().format('YYYY-MM-DD') }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile']
        },
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'description', 'price', 'duration_days', 'NOU', 'points']
        },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'mobile']
            }
          ]
        }
      ],
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subData = subscription.toJSON();
    const endDate = moment(subscription.end_date);
    subData.daysRemaining = endDate.diff(moment(), 'days');
    subData.memberCount = subscription.members?.length || 0;
    subData.availableSlots = subscription.purchased_user_count - (subscription.members?.length || 0);

    res.json(subData);
  } catch (err) {
    console.error('Get my subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Single Subscription by ID
router.get('/:id', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile', 'businessName']
        },
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'description', 'price', 'duration_days', 'NOU', 'points']
        },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'mobile']
            }
          ]
        }
      ]
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subData = subscription.toJSON();
    const currentDate = moment();
    const endDate = moment(subscription.end_date);
    
    subData.status = currentDate.isAfter(endDate) ? 'expired' : 
                     subscription.is_cancelled ? 'cancelled' : 
                     subscription.is_active ? 'active' : 'inactive';
    
    subData.daysRemaining = currentDate.isBefore(endDate) ? 
                            endDate.diff(currentDate, 'days') : 0;
    
    subData.memberCount = subscription.members?.length || 0;
    subData.availableSlots = subscription.purchased_user_count - (subscription.members?.length || 0);

    res.json(subData);
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Subscription Members
router.get('/:id/members', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const members = await SubscriptionMember.findAll({
      where: { subscription_id: req.params.id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile']
        }
      ]
    });

    res.json({
      subscription_id: req.params.id,
      total_members: members.length,
      purchased_user_count: subscription.purchased_user_count,
      available_slots: subscription.purchased_user_count - members.length,
      members
    });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add Member to Subscription
router.post('/:id/members', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { user_id } = req.body;
    const subscriptionId = req.params.id;

    // Check if subscription exists and is active
    const subscription = await Subscription.findByPk(subscriptionId, { transaction });
    
    if (!subscription) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (!subscription.is_active || subscription.is_cancelled) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    if (moment(subscription.end_date).isBefore(moment())) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Subscription has expired' });
    }

    // Check member count limit
    const currentMembers = await SubscriptionMember.count({
      where: { subscription_id: subscriptionId },
      transaction
    });

    if (currentMembers >= subscription.purchased_user_count) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: `Maximum ${subscription.purchased_user_count} members reached` 
      });
    }

    // Check if user exists
    const user = await User.findByPk(user_id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMember = await SubscriptionMember.findOne({
      where: {
        subscription_id: subscriptionId,
        user_id
      },
      transaction
    });

    if (existingMember) {
      await transaction.rollback();
      return res.status(400).json({ error: 'User is already a member of this subscription' });
    }

    // Add member
    const member = await SubscriptionMember.create({
      subscription_id: subscriptionId,
      user_id
    }, { transaction });

    await transaction.commit();

    // Fetch created member with user details
    const createdMember = await SubscriptionMember.findByPk(member.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile']
        }
      ]
    });

    res.status(201).json({
      message: 'Member added successfully',
      member: createdMember
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Add member error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove Member from Subscription
router.delete('/members/:memberId', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const memberId = req.params.memberId;

    const member = await SubscriptionMember.findByPk(memberId, {
      include: [{ model: Subscription, as: 'subscription' }],
      transaction
    });

    if (!member) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Member not found' });
    }

    // Prevent removing the main subscription owner
    if (member.subscription.user_id === member.user_id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cannot remove the main subscription owner' });
    }

    await member.destroy({ transaction });
    await transaction.commit();

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    await transaction.rollback();
    console.error('Remove member error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cancel Subscription
router.put('/:id/cancel', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const subscription = await Subscription.findByPk(req.params.id, {
      include: [{ model: SubscriptionMember, as: 'members' }],
      transaction
    });
    
    if (!subscription) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Update subscription
    await subscription.update({
      is_cancelled: true,
      is_active: false,
      cancellation_reason: req.body.cancellation_reason || 'Cancelled by user'
    }, { transaction });

    await transaction.commit();

    res.json({
      message: 'Subscription cancelled successfully',
      subscription
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Renew Subscription
router.post('/:id/renew', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const subscription = await Subscription.findByPk(req.params.id, {
      include: [{ model: Plan, as: 'planDetails' }],
      transaction
    });
    
    if (!subscription) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Calculate new end date based on plan duration
    const newEndDate = moment().add(subscription.plan.duration_days, 'days').format('YYYY-MM-DD');

    // Update subscription
    await subscription.update({
      start_date: moment().format('YYYY-MM-DD'),
      end_date: newEndDate,
      is_active: true,
      is_cancelled: false,
      cancellation_reason: null
    }, { transaction });

    await transaction.commit();

    res.json({
      message: 'Subscription renewed successfully',
      subscription
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Renew subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Subscription Statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const currentDate = moment().format('YYYY-MM-DD');
    
    const totalSubscriptions = await Subscription.count();
    
    const activeSubscriptions = await Subscription.count({
      where: {
        is_active: true,
        is_cancelled: false,
        end_date: { [Op.gte]: currentDate }
      }
    });
    
    const expiredSubscriptions = await Subscription.count({
      where: {
        end_date: { [Op.lt]: currentDate }
      }
    });
    
    const cancelledSubscriptions = await Subscription.count({
      where: {
        is_cancelled: true
      }
    });

    const totalRevenue = await Subscription.sum('total_price', {
      where: {
        is_active: true,
        is_cancelled: false,
        end_date: { [Op.gte]: currentDate }
      }
    });

    const planDistribution = await Subscription.findAll({
      attributes: [
        'plan_id',
        [sequelize.fn('COUNT', sequelize.col('Subscription.id')), 'count']
      ],
      include: [{
        model: Plan,
        as: 'planDetails',
        attributes: ['name']
      }],
      group: ['plan_id', 'plan.id', 'plan.name']
    });

    res.json({
      total: totalSubscriptions,
      active: activeSubscriptions,
      expired: expiredSubscriptions,
      cancelled: cancelledSubscriptions,
      totalRevenue: totalRevenue || 0,
      planDistribution: planDistribution.map(item => ({
        planName: item.plan?.name,
        count: parseInt(item.dataValues.count)
      }))
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;