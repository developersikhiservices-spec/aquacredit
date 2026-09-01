// routes/fcmTokens.js
const express = require('express');
const router = express.Router();
const UserFcmToken = require('../models/FCMToken');
const { sendNotification } = require('../config/firbase');
const { where } = require('sequelize');

// CREATE or UPDATE (Upsert)
// POST /
// Save or update FCM token for a user

router.post('/', async (req, res) => {
  try {
    const { user_id, user_mobile, fcm_token, device_type } = req.body;

    // Basic validation
    if (!user_id || !fcm_token) {
      return res.status(400).json({
        success: false,
        message: 'user_id and fcm_token are required'
      });
    }

    // Try to find an existing token record
    let tokenRecord = await UserFcmToken.findOne({ where: { fcm_token } });

    if (tokenRecord) {
      // Update if token already exists
      await tokenRecord.update({
        user_id,
        user_mobile,
        device_type,
        is_active: true,
      });

      return res.status(200).json({
        success: true,
        message: 'Token updated successfully',
        data: tokenRecord
      });
    }

    // Otherwise, create a new token record
    tokenRecord = await UserFcmToken.create({
      user_id,
      user_mobile,
      fcm_token,
      device_type,
      is_active: true
    });

    return res.status(201).json({
      success: true,
      message: 'Token created successfully',
      data: tokenRecord
    });

  } catch (error) {
    console.error('FCM Token Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
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


router.post('/pushNotification', async (req, res) => {
  try {
    const { title, message, fcm_token, userMobile } = req.body;

    // ---------- Validate Required Fields ----------
    if (!title || !message || (!fcm_token && !userMobile)) {
      return res.status(400).json({
        success: false,
        message: 'title, message, and either fcm_token or userMobile are required',
      });
    }

    // ---------- Find FCM Token in DB ----------
    let FCMtoken = fcm_token; // default fallback

    if (userMobile) {
      const FCMdata = await UserFcmToken.findOne({
        where: { user_mobile: userMobile }
      });

      if (FCMdata && FCMdata.fcm_token) {
        FCMtoken = FCMdata.fcm_token;  // override if found
      }
    }

    if (!FCMtoken) {
      return res.status(400).json({
        success: false,
        message: "No valid FCM token found",
      });
    }
    // ---------- Send Push Notification ----------
    const pushResult = await sendNotification(FCMtoken, title, message);
    console.log("rrr:::",pushResult)
    if (pushResult.success) {
      return res.json({
        success: true,
        message: 'Notification sent successfully',
        messageId: pushResult.messageId,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: pushResult.error,
    });

  } catch (error) {
    console.error("Push Notification Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

module.exports = router;
