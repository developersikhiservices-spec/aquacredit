const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');

// Create Plan
router.post('/', async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    return res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
});

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

    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update Plan
router.put('/:id', async (req, res) => {
  try {
    const plan = await Plan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    await plan.update(req.body);
    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
});

// Delete Plan
router.delete('/:id', async (req, res) => {
  try {
    const plan = await Plan.findByPk(req.params.id);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    await plan.destroy();
    return res.json({ message: 'Plan deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
