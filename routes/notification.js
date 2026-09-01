const admin = require('../config/firbase');
const Notification = require('../models/Notification');
const UserFcmToken = require('../models/FCMToken');
const express = require('express');
const Joi = require('joi');
const router = express.Router();

// 🔧 Utility: Chunk array into pieces of given size (e.g., 500 tokens per batch)
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const notificationSchema = Joi.object({
  user_id: Joi.number().allow(null),
  title: Joi.string().max(255).required(),
  message: Joi.string().required(),
  type: Joi.string()
    .valid("info", "warning", "success", "error")
    .default("info"),
  is_push: Joi.boolean().default(false)
});

router.post("/", async (req, res) => {
  try {
    const { error, value } = notificationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: "Validation error",
        message: error.details[0].message
      });
    }

    const notification = await Notification.create({
      user_id: value.user_id || null,
      title: value.title,
      message: value.message,
      type: value.type,
      is_push: value.is_push
    });

    res.status(201).json({
      message: "Notification created successfully",
      notification
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create notification",
      message: "Internal server error"
    });
  }
});

router.get("/", async (req, res) => {
  try {

    const notifications = await Notification.findAll({
      order: [["createdAt", "DESC"]]
    });

    res.status(200).json({
      message: "Notifications fetched successfully",
      notifications
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to fetch notifications",
      message: "Internal server error"
    });

  }
});

router.get("/:id", async (req, res) => {

  try {

    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    res.status(200).json(notification);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to fetch notification"
    });

  }

});

router.put("/:id", async (req, res) => {

  try {

    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    const { error, value } = notificationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: "Validation error",
        message: error.details[0].message
      });
    }

    await notification.update({
      user_id: value.user_id,
      title: value.title,
      message: value.message,
      type: value.type,
      is_push: value.is_push
    });

    res.status(200).json({
      message: "Notification updated successfully",
      notification
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to update notification"
    });

  }

});

router.patch("/:id/read", async (req, res) => {

  try {

    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    await notification.update({
      is_read: true
    });

    res.status(200).json({
      message: "Notification marked as read",
      notification
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to update notification"
    });

  }

});

router.delete("/:id", async (req, res) => {

  try {

    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    await notification.destroy();

    res.status(200).json({
      message: "Notification deleted successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to delete notification"
    });

  }

});
/**
 * Sends a welcome notification to a user and saves it in the DB.
 * Supports token batching for >500 tokens.
 */
 async function sendMultiNotification(user, payload) {
  try {
    // 1. Get all active FCM tokens for the user
    const tokens = await UserFcmToken.findAll({
      where: {
        is_active: true
      },
      attributes: ['fcm_token']
    });

    if (!tokens) {
      console.log(`⚠️ No active FCM token for user ${user.id}`);
      return;
  }
    const fcmTokens = tokens.map(t => t.fcm_token);
    const tokenChunks = chunkArray(fcmTokens, 300);

    const title = payload.title;
    const body = payload.body;

    let totalSuccess = 0;
    let totalFailure = 0;

    // 2. Loop through token chunks and send in batches
    for (const chunk of tokenChunks) {
      const message = {
        notification: { title, body },
        tokens: chunk
      };

      const response = await admin.messaging().sendMulticast(message);

      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      // Optional: handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens = response.responses
          .map((r, i) => (!r.success ? chunk[i] : null))
          .filter(Boolean);

        console.warn(`⚠️ Failed to send to tokens:`, failedTokens);

        // Optional: mark failed tokens as inactive in DB
        await UserFcmToken.update(
          { is_active: false },
          { where: { fcm_token: failedTokens } }
        );
      }
    }

    console.log(`✅ Sent welcome notification to user ${user.id} | ✅ ${totalSuccess} success | ❌ ${totalFailure} failed`);

  } catch (err) {
    console.error('❌ Failed to send welcome notification:', err);
  }
}


 async function sendSingleNotification(user, payload) {
  try {
    // 1. Get all active FCM tokens for the user
    const tokens = await UserFcmToken.findOne({
      where: {
        user_id: user.id,
        is_active: true
      },
      attributes: ['fcm_token']
    });

    if (!tokens) {
      console.log(`⚠️ No active FCM token for user ${user.id}`);
      return;
  }
      const title = payload.title;
    const body = payload.body;

    // 2. Loop through token chunks and send in batches
    const message = {
      notification: { title, body },
      token: tokens.fcm_token
    };

    await admin.messaging().send(message);

  } catch (err) {
    console.error('❌ Failed to send welcome notification:', err);
  }
}

module.exports = {
  router,
  sendMultiNotification,
  sendSingleNotification
};