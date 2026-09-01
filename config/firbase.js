const admin = require('firebase-admin');

// Initialize Firebase Admin SDK only once in your app
if (!admin.apps.length) {
  const serviceAccount = require('./aquacredit-421a9-firebase-adminsdk-fbsvc-633732cffa.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * Sends a push notification to a single device using FCM
 * @param {string} deviceToken - The target device's FCM registration token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Promise<object>} - Firebase response object
 */
async function sendNotification(deviceToken, title, body) {
  
  const message = {
    token: deviceToken,
    data: {
      title: title,
      body: body,
      extraData: 'any other info'
    },
    android: {
      priority: 'high',
    }
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Successfully sent message:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Error sending message:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendNotification };
