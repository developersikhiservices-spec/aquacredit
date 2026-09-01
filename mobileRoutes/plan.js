const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');


// Get All Plans
router.get('/', async (req, res) => {
  try {
    const plans = await Plan.findAll();
    
    return res.json({
      message: 'plans fetched successfully',
      plans: plans
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get Single Plan
router.get('/:id', async (req, res) => {
  try {
    const plan = await Plan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.json({
      message: 'plan fetched successfully',
      plans: plan
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
