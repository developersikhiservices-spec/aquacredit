const express = require('express');
const { User, Otp } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Utility: Generate random 5-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP
router.post('/send', async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }
    const user = await User.findOne({ where: { mobile } });
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry
    if (!user) {
      const newUser = await User.create({
        mobile,
      });
      await Otp.create({
        user_id: newUser.id,
        otp,
        expires_at: expiry
      });

    } else {
      await Otp.create({
        user_id: user.id,
        otp,
        expires_at: expiry
      });
    }

    // TODO: Send OTP via SMS/Email here

    res.json({ success: true, message: 'OTP sent successfully', otp }); // ⚠️ remove otp in production
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Resend OTP
router.post('/resend', async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Invalidate old OTPs
    await Otp.update(
      { is_used: true },
      { where: { user_id: user.id, is_used: false } }
    );

    const otps = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.create({
      user_id: user.id,
      otp: otps,
      expires_at: expiry
    });

    // TODO: Send OTP via SMS/Email here

    res.json({ success: true, message: 'OTP resent successfully', otps }); // ⚠️ remove otp in production
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Verify OTP
router.post('/verify', async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ error: 'Mobile and OTP are required' });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otpRecord = await Otp.findOne({
      where: {
        user_id: user.id,
        otp,
        // is_used: false,
        // expires_at: { [Op.gt]: new Date() }
      },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP', "Verification": 0, });
    }

    // Mark OTP as used
    await Otp.update(
      { is_used: true },
      { where: { id: otpRecord.id } }
    );
    // Success → generate session token / login user
    res.json({ success: true, message: 'OTP verified successfully', "Verification": 1, user: user });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

module.exports = router;



//TWILO NODE BACKEND SERVICE CODE

// Your AccountSID and Auth Token from console.twilio.com
// const accountSid = 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
// const authToken = 'your_auth_token';

// const client = require('twilio')(accountSid, authToken);

// client.messages
//   .create({
//     body: 'Hello from twilio-node',
//     to: '+12345678901', // Text your number
//     from: '+12345678901', // From a valid Twilio number
//   })
//   .then((message) => console.log(message.sid));
