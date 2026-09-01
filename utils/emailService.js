const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email configuration not found. Email service disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send email function
const sendEmail = async (to, subject, html, text = null) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log('Email service not configured. Email not sent.');
      return false;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
      text: text || subject
    };

    const result = await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  const subject = 'Welcome to Credit Management System';
  const html = `
    <h2>Welcome ${name}!</h2>
    <p>Thank you for joining our Credit Management System.</p>
    <p>You can now start managing your customers and transactions efficiently.</p>
    <p>If you have any questions, feel free to contact our support team.</p>
    <br>
    <p>Best regards,<br>Credit Management Team</p>
  `;

  return await sendEmail(email, subject, html);
};

// Send notification email
const sendNotificationEmail = async (email, name, title, message) => {
  const subject = `Notification: ${title}`;
  const html = `
    <h2>Hello ${name}</h2>
    <h3>${title}</h3>
    <p>${message}</p>
    <br>
    <p>Best regards,<br>Credit Management Team</p>
  `;

  return await sendEmail(email, subject, html);
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendNotificationEmail
};