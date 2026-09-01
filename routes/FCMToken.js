// routes/fcmTokens.js
const express = require('express');
const UserFcmToken = require('../models/FCMToken');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);
// CREATE or UPDATE (Upsert)
router.post('/', async (req, res) => {
  const { user_id, fcm_token, device_type } = req.body;

  if (!user_id || !fcm_token) {
    return res.status(400).json({ error: 'user_id and fcm_token are required' });
  }

  try {
    const [token, created] = await UserFcmToken.findOrCreate({
      where: { fcm_token },
      defaults: {
        user_id,
        device_type,
        is_active: true
      }
    });

    if (!created) {
      // Update existing token if needed
      await token.update({ user_id, device_type, is_active: true });
    }

    res.status(created ? 201 : 200).json(token);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ ALL
router.get('/', async (req, res) => {
  try {
    const tokens = await UserFcmToken.findAll();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ ONE
router.get('/:id', async (req, res) => {
  try {
    const token = await UserFcmToken.findByPk(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const [updated] = await UserFcmToken.update(req.body, {
      where: { id: req.params.id }
    });

    if (!updated) return res.status(404).json({ error: 'Token not found' });

    const updatedToken = await UserFcmToken.findByPk(req.params.id);
    res.json(updatedToken);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE (soft deactivate or hard delete)
router.delete('/:id', async (req, res) => {
  try {
    const token = await UserFcmToken.findByPk(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });

    // Option 1: Soft delete (recommended)
    await token.update({ is_active: false });

    // Option 2: Hard delete (if really needed)
    // await token.destroy();

    res.json({ message: 'Token deactivated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
