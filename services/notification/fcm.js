const { messaging } = require('../../config/firebase');

/**
 * Send push notification to single device
 */
const sendPushNotification = async (
  token,
  title,
  body,
  data = {},
  clickAction = null
) => {
  if (!messaging) {
    console.warn('Firebase not initialized; notification not sent');
    return null;
  }

  if (!token) {
    console.warn('No device token provided');
    return null;
  }

  const message = {
    token,
    notification: {
      title,
      body,
    },
    data: Object.fromEntries(
      Object.entries({
        ...data,
        click_action: clickAction || 'REACTNATIVE_NOTIFICATION_CLICK',
      }).map(([k, v]) => [k, String(v)])
    ),
  };
console.log("send notification::",message)
  try {
    const response = await messaging.send(message);
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

/**
 * Send notification to multiple tokens (up to 500)
 */
const sendMulticastNotification = async (
  tokens,
  title,
  body,
  data = {},
  clickAction = null
) => {
  if (!messaging || !tokens?.length) return null;

  const message = {
    tokens,
    notification: {
      title,
      body,
    },
    data: Object.fromEntries(
      Object.entries({
        ...data,
        click_action: clickAction || 'REACT_NOTIFICATION_CLICK',
      }).map(([k, v]) => [k, String(v)])
    ),
  };

  try {
    const response = await messaging.sendEachForMulticast(message);

    console.log(
      `Success: ${response.successCount}, Failed: ${response.failureCount}`
    );

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.error(`Token failed: ${tokens[idx]}`, resp.error);
      }
    });

    return response;
  } catch (error) {
    console.error('Error sending multicast:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotification,
  sendMulticastNotification,
};