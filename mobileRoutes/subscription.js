// mobile route subscription 
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
      member_ids = [] // Additional members to add
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

    // Calculate dates if not provided
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

    await transaction.commit();

    // Fetch created subscription with all relations
    const createdSubscription = await Subscription.findByPk(subscription.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile', 'companyName']
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

// Get all subscriptions for mobile (simplified)
router.get('/', async (req, res) => {
  try {
    const subscriptions = await Subscription.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile']
        },
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'price', 'duration_days']
        },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ]
    });

    // Add computed status for each subscription
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
      
      return subData;
    });

    res.json(enrichedSubscriptions);
  } catch (err) {
    console.error('Get subscriptions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get current user's active subscription (for mobile app)
router.get('/my/:userId', async (req, res) => {
  try {
    // Get user ID from auth middleware - adjust based on your auth setup
    const userId = req.params?.userId ;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
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
      ]
    });

    if (!subscription) {
      return res.json({ 
        success:true,
        message: 'No active subscription found' });
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

// Get single subscription by ID
router.get('/:id', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id, {
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

// Get subscription members
router.get('/:id/members', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id, {
      include: [
        {
          model: Plan,
          as: 'planDetails'
        }
      ]
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const members = await SubscriptionMember.findAll({
      where: { subscription_id: req.params.id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'mobile','owner_user_id']
        },
      ]
    });

    res.json({
      subscription_id: req.params.id,
      plan: subscription.planDetails,   // 👈 plan data
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

// Add member to subscription
router.post('/:id/members', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { user_id } = req.body;
    const subscriptionId = req.params.id;

    // Check subscription exists and is active
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
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add member
    const member = await SubscriptionMember.create({
      subscription_id: subscriptionId,
      user_id
    }, { transaction });

    await transaction.commit();

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

// Remove member from subscription
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
    const subscription = await Subscription.findByPk(req.params.id, { transaction });
    
    if (!subscription) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Subscription not found' });
    }

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

// Check if user has active subscription
router.get('/check/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        is_active: true,
        is_cancelled: false,
        end_date: { [Op.gte]: moment().format('YYYY-MM-DD') }
      },
      include: [
        {
          model: Plan,
          as: 'planDetails',
          attributes: ['id', 'name', 'points']
        }
      ]
    });

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        message: 'No active subscription found'
      });
    }

    const endDate = moment(subscription.end_date);
    
    res.json({
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        plan: subscription.plan.name,
        end_date: subscription.end_date,
        daysRemaining: endDate.diff(moment(), 'days'),
        purchased_user_count: subscription.purchased_user_count,
        features: subscription.plan.points
      }
    });
  } catch (err) {
    console.error('Check subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;