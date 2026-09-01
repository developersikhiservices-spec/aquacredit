const express = require('express');
const { User, Otp } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Utility: Generate random 5-digit OTP
const generateOTP = () => Math.floor(10000 + Math.random() * 90000).toString();

// Send OTP
router.post('/send', async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      return res.status(404).json({ error: 'User not found with this mobile number' });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry
    console.log("rrr :{ user_id:", user.id, "otp :", otp, "expires_at: ", expiry, "}")
    await Otp.create({
      user_id: user.id,
      otp,
      expires_at: expiry
    });

    // TODO: Send OTP via SMS/Email here

    res.json({ message: 'OTP sent successfully', otp }); // ⚠️ remove otp in production
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
    await otp.update(
      { is_used: true },
      { where: { user_id: user.id, is_used: false } }
    );

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await otp.create({
      user_id: user.id,
      otp,
      expires_at: expiry
    });

    // TODO: Send OTP via SMS/Email here

    res.json({ message: 'OTP resent successfully', otp }); // ⚠️ remove otp in production
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

    const otpRecord = await otp.findOne({
      where: {
        user_id: user.id,
        otp,
        is_used: false,
        expires_at: { [Op.gt]: new Date() }
      },
      order: [['created_at', 'DESC']]
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await otp.update(
      { is_used: true },
      { where: { id: otpRecord.id } }
    );

    // Success → generate session token / login user
    res.json({ message: 'OTP verified successfully', user_id: user.id });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

module.exports = router;
