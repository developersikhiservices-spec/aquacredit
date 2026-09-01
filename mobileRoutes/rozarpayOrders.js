const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { User, sequelize, Subscription, Plan, } = require('../models');
const { Op, where } = require('sequelize');
const Payment = require('../models/payments');
const { addDays } = require('date-fns');
const moment = require("moment");
const SubscriptionMember = require('../models/SubscriptionMember');

const router = express.Router();

const razorpay = new Razorpay({
  key_id: "rzp_test_RfcfxfJ2sIZdao",
  key_secret: "NzCej6Cd4rVLDdperQDgdhh4",
});

// Validation schemas
// Record new transaction
router.post("/create-order", async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const { amount, currency = "INR", subscriber_name, subscriber_email, subscriber_phone, subscribePlan, purchased_user_count = 1 } = body;

    // Get plan details to verify price and calculate total
    const plan = await Plan.findOne({
      where: {
        [Op.or]: [
          { id: subscribePlan },
          { name: subscribePlan }
        ]
      }
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Validate amount matches plan price * user count
    const expectedAmount = parseFloat(plan.price) * purchased_user_count;
    if (parseFloat(amount) !== expectedAmount) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const options = {
      amount: amount * 100, // convert to paise
      currency,
      receipt: "receipt_" + Date.now(),
      notes: {
        subscriber_name,
        subscriber_email,
        subscriber_phone,
        subscribePlan: plan.id, // Store plan ID instead of name
        subscribePlanName: plan.name,
        purchased_user_count,
        total_price: amount
      }
    };

    const order = await razorpay.orders.create(options);
    await Payment.create({
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      subscriber_name,
      subscriber_email,
      subscriber_phone,
      subscribePlan: plan.name,
      status: 'PENDING'
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpay.key_id
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating order");
  }
});

// Verify payment (alternative to webhook for client-side verification)
router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      subscriber_phone,
      NOU
    } = req.body;

    // Generate signature for verification
    const generated_signature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature"
      });
    }

    // Update payment record
    const payment = await Payment.findOne({
      where: { razorpay_order_id }
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    payment.razorpay_payment_id = razorpay_payment_id;
    payment.status = 'SUCCESS';
    await payment.save();

    // Create subscription
    const user = await User.findOne({
      where: { mobile: subscriber_phone || payment.subscriber_phone }
    });

    if (user) {
      const plan = await Plan.findOne({
        where: { name: payment.subscribePlan }
      });

      if (plan) {
        // Calculate end date based on plan duration
        const endDate = addDays(new Date(), plan.duration_days);

        // Check for existing active subscription
        const existingSubscription = await Subscription.findOne({
          where: {
            user_id: user.id,
            is_active: true
          }
        });

        if (!existingSubscription) {
          // Create subscription
          const subscription = await Subscription.create({
            user_id: user.id,
            plan_id: plan.id,
            purchased_user_count: NOU || 1,
            total_price: payment.amount,
            start_date: moment().format("YYYY-MM-DD"),
            end_date: moment(endDate).format("YYYY-MM-DD"),
            is_active: true,
            is_cancelled: false
          });

          // Add the main user as a subscription member
          await SubscriptionMember.create({
            subscription_id: subscription.id,
            user_id: user.id
          });
        } else {

        }
      }
    }

    res.json({
      success: true,
      message: "Payment verified and subscription activated"
    });

  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({
      success: false,
      message: "Payment verification failed"
    });
  }
});


// Razorpay webhook handler
router.post("/razorpay-webhook", async (req, res) => {
  const secret = "SikhiServices01@";
  const receivedSig = req.headers["x-razorpay-signature"];
  const generatedSig = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  if (receivedSig !== generatedSig) {
    return res.status(403).send("Invalid signature");
  }

  try {
    const body = JSON.parse(req.body.toString());
    const event = body.event;
    const paymentEntity = body?.payload?.payment?.entity;

    if (!paymentEntity) {
      return res.status(200).json({ status: "ignored" });
    }

    // Determine payment status
    let status = "PENDING";
    switch (event) {
      case "payment.captured":
      case "order.paid":
        status = "SUCCESS";
        break;
      case "payment.failed":
        status = "FAILED";
        break;
      default:
        status = "PENDING";
    }

    // Fetch order details
    const order = await razorpay.orders.fetch(paymentEntity.order_id);

    // Find existing payment
    let payment = await Payment.findOne({
      where: { razorpay_order_id: paymentEntity.order_id }
    });

    const paymentData = {
      razorpay_order_id: paymentEntity.order_id,
      status,
      razorpay_payment_id: paymentEntity.id,
      error_message: paymentEntity.error_description || null,
      amount: paymentEntity.amount / 100,
      currency: paymentEntity.currency,
      subscriber_name: order.notes?.subscriber_name || payment?.subscriber_name,
      subscriber_email: order.notes?.subscriber_email || payment?.subscriber_email,
      subscriber_phone: order.notes?.subscriber_phone || payment?.subscriber_phone,
      subscribePlan: order.notes?.subscribePlanName || payment?.subscribePlan,
      // purchased_user_count: order.notes?.purchased_user_count || 1
    };

    if (payment) {
      await payment.update(paymentData);
    } else {
      payment = await Payment.create(paymentData);
    }

    // Handle successful payment - create subscription
    if (status === "SUCCESS" && payment.subscriber_phone) {
      const user = await User.findOne({
        where: { mobile: payment.subscriber_phone }
      });

      if (user) {
        const plan = await Plan.findOne({
          where: { name: payment.subscribePlan }
        });

        if (plan) {
          const endDate = addDays(new Date(), plan.duration_days);

          // Check for existing active subscription
          const existingSubscription = await Subscription.findOne({
            where: {
              user_id: user.id,
              is_active: true
            }
          });

          if (!existingSubscription) {
            // Create subscription
            const subscription = await Subscription.create({
              user_id: user.id,
              plan_id: plan.id,
              purchased_user_count: order.notes?.purchased_user_count || 1,
              total_price: payment.amount,
              start_date: moment().format("YYYY-MM-DD"),
              end_date: moment(endDate).format("YYYY-MM-DD"),
              is_active: true,
              is_cancelled: false
            });

            // Add the main user as a subscription member
            await SubscriptionMember.create({
              subscription_id: subscription.id,
              user_id: user.id
            });
          }
        }
      }
    }

    res.status(200).json({ status: "ok" });

  } catch (err) {
    console.log("Webhook processing error:", err);
    res.status(500).send("Webhook handling failed");
  }
});

// Add more users to existing subscription
router.post("/add-subscription-users", async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());

    const { subscription_id, additional_user_count, user_id, subscriber_name, subscriber_email, subscriber_phone } = body;

    // Validate required fields

    if (additional_user_count === undefined || additional_user_count === null || additional_user_count === '') {
      return res.status(400).json({
        error: "Missing required field: additional_user_count is required"
      });
    }

    if (user_id === undefined || user_id === null || user_id === '') {
      return res.status(400).json({
        error: "Missing required field: user_id is required"
      });
    }

    if (subscription_id === undefined || subscription_id === null || subscription_id === '') {
      return res.status(400).json({
        error: "Missing required field: subscription_id is required"
      });
    }

    // Find the active subscription
    const subscription = await Subscription.findOne({
      where: {
        id: parseInt(subscription_id),
        user_id: parseInt(user_id),
        is_active: true,
        is_cancelled: false
      },
      include: [{
        model: Plan,
        as: 'planDetails' // Make sure this matches your association name
      }]
    });

    if (!subscription) {
      return res.status(404).json({ error: "Active subscription not found" });
    }

    // Check if subscription is expired
    if (moment(subscription.end_date).isBefore(moment().format("YYYY-MM-DD"))) {
      return res.status(400).json({ error: "Subscription has expired. Please renew." });
    }

    // Get the plan - access it based on your association
    const plan = subscription.planDetails; // or subscription.planDetails based on your association

    if (!plan) {
      return res.status(404).json({ error: "Plan not found for this subscription" });
    }

    // Calculate additional amount
    const additionalAmount = parseFloat(plan.price) * additional_user_count;

    // Create Razorpay order for additional payment
    const options = {
      amount: additionalAmount * 100, // convert to paise
      currency: "INR",
      receipt: "receipt_add_users_" + Date.now(),
      notes: {
        subscription_id: subscription.id,
        additional_user_count,
        original_subscription_id: subscription.id,
        type: 'add_users',
        user_id: user_id
      }
    };

    const order = await razorpay.orders.create(options);

    // Create payment record for this addition
    await Payment.create({
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      subscriber_name: subscriber_name || "Existing User",
      subscriber_email: subscriber_email,
      subscriber_phone: subscriber_phone,
      subscribePlan: plan.name,
      status: 'PENDING',
      metadata: {  // Store as JSON string if your DB expects string
        type: 'add_users',
        subscription_id: subscription.id,
        additional_user_count, user_id
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpay.key_id,
      subscription_id: subscription.id
    });

  } catch (err) {
    console.error("Error adding users:", err);
    res.status(500).json({
      error: "Error processing request",
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});


// Verify additional users payment and add members
router.post("/verify-additional-users-payment", async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    console.log("=== VERIFY ADDITIONAL USERS PAYMENT ===");

    // Verify signature
    const generated_signature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature"
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      where: { razorpay_order_id }
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    console.log("Payment found:", {
      id: payment.id,
      status: payment.status,
      metadata: payment.metadata,
      metadata_type: typeof payment.metadata
    });

    // Update payment status
    payment.razorpay_payment_id = razorpay_payment_id;
    payment.status = 'SUCCESS';
    await payment.save();

    // Parse metadata - handle double stringification
    let metadata = payment.metadata;

    // Function to recursively parse JSON until we get an object
    function parseMetadata(data) {
      if (typeof data === 'object' && data !== null) {
        return data;
      }

      if (typeof data === 'string') {
        try {
          // Try to parse the string
          const parsed = JSON.parse(data);
          // If parsed result is still a string, parse again
          if (typeof parsed === 'string') {
            return parseMetadata(parsed);
          }
          return parsed;
        } catch (e) {
          console.error("Error parsing metadata:", e);
          return {};
        }
      }

      return {};
    }

    metadata = parseMetadata(metadata);

    // Get values from metadata
    const subscription_id = metadata.subscription_id;
    const additional_user_count = metadata.additional_user_count;

    // Validate metadata values
    if (!subscription_id) {
      return res.status(400).json({
        error: "Subscription ID not found in payment metadata",
        metadata: metadata,
        raw_metadata: payment.metadata
      });
    }

    if (!additional_user_count) {
      return res.status(400).json({
        error: "Additional user count not found in payment metadata",
        metadata: metadata,
        raw_metadata: payment.metadata
      });
    }

    // Convert to numbers
    const subId = parseInt(subscription_id);
    const addCount = parseInt(additional_user_count);

    if (isNaN(subId) || isNaN(addCount)) {
      return res.status(400).json({
        error: "Invalid metadata values",
        subscription_id,
        additional_user_count
      });
    }

    // Find subscription
    const subscription = await Subscription.findOne({
      where: { id: subId }
    });

    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found", subscription_id: subId });
    }

    console.log("Subscription found:", {
      id: subscription.id,
      current_user_count: subscription.purchased_user_count,
      current_price: subscription.total_price
    });

    // Update purchased_user_count
    const newUserCount = subscription.purchased_user_count + addCount;
    const additionalAmount = payment.amount / 100; // Convert paise to rupees
    const newTotalPrice = parseFloat(subscription.total_price) + additionalAmount;

    await subscription.update({
      purchased_user_count: newUserCount,
      total_price: newTotalPrice
    });

    console.log("Subscription updated:", {
      newUserCount,
      newTotalPrice
    });

    res.json({
      success: true,
      message: "Users added successfully",
      subscription: {
        id: subscription.id,
        purchased_user_count: newUserCount,
        total_price: newTotalPrice
      }
    });

  } catch (err) {
    console.error("Error verifying additional users payment:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      message: "Payment verification failed"
    });
  }
});

// Renew subscription
router.post("/renew-subscription", async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const { subscription_id, user_id, subscriber_name, subscriber_email, subscriber_phone } = body;

    // Find current subscription
    const currentSubscription = await Subscription.findOne({
      where: {
        id: subscription_id,
        user_id: user_id
      },
      include: [{ model: Plan, as: 'planDetails' }]
    });

    if (!currentSubscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const plan = currentSubscription.planDetails;
    const amount = parseFloat(plan.price) * currentSubscription.purchased_user_count;

    // Create Razorpay order for renewal
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_renew_" + Date.now(),
      notes: {
        original_subscription_id: currentSubscription.id,
        user_id: user_id,
        plan_id: plan.id,
        purchased_user_count: currentSubscription.purchased_user_count,
        type: 'renewal'
      }
    };

    const order = await razorpay.orders.create(options);
    const metaObj = {
      type: 'renewal',
      original_subscription_id: currentSubscription.id,
      purchased_user_count: currentSubscription.purchased_user_count,
      user_id
    }
    // Create payment record
    await Payment.create({
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      subscriber_name: subscriber_name,
      subscriber_email: subscriber_email,
      subscriber_phone: subscriber_phone,
      subscribePlan: plan.name,
      status: 'PENDING',
      metadata: metaObj
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpay.key_id,
      plan_name: plan.name,
      purchased_user_count: currentSubscription.purchased_user_count
    });

  } catch (err) {
    console.error("Error creating renewal:", err);
    res.status(500).json({ error: "Error processing renewal request" });
  }
});

// Verify renewal payment and create new subscription
router.post("/verify-renewal-payment", async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = body;

    // Verify signature
    const generated_signature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature"
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      where: { razorpay_order_id }
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Update payment status
    payment.razorpay_payment_id = razorpay_payment_id;
    payment.status = 'SUCCESS';
    await payment.save();

    // Get metadata
    let metadata = payment.metadata;

    // Function to recursively parse JSON until we get an object
    function parseMetadata(data) {
      if (typeof data === 'object' && data !== null) {
        return data;
      }

      if (typeof data === 'string') {
        try {
          // Try to parse the string
          const parsed = JSON.parse(data);
          // If parsed result is still a string, parse again
          if (typeof parsed === 'string') {
            return parseMetadata(parsed);
          }
          return parsed;
        } catch (e) {
          console.error("Error parsing metadata:", e);
          return {};
        }
      }

      return {};
    }

    metadata = parseMetadata(metadata);
    const original_subscription_id = metadata.original_subscription_id;
    const purchased_user_count = metadata.purchased_user_count;

    // Find original subscription
    const originalSubscription = await Subscription.findOne({
      where: { id: original_subscription_id },
      include: [{ model: Plan, as: 'planDetails' }]
    });

    if (!originalSubscription) {
      return res.status(404).json({ error: "Original subscription not found" });
    }

    // Deactivate old subscription
    await originalSubscription.update({
      is_active: false
    });

    // Calculate new dates
    const plan = originalSubscription.planDetails;
    const startDate = moment().format("YYYY-MM-DD");
    const endDate = moment().add(plan.duration_days, 'days').format("YYYY-MM-DD");

    // Create new subscription
    const newSubscription = await Subscription.create({
      user_id: originalSubscription.user_id,
      plan_id: plan.id,
      purchased_user_count: purchased_user_count,
      total_price: payment.amount / 100,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      is_cancelled: false
    });

    // Copy all members from old subscription to new one
    const oldMembers = await SubscriptionMember.findAll({
      where: { subscription_id: original_subscription_id }
    });

    if (oldMembers.length > 0) {
      const memberPromises = oldMembers.map(member =>
        SubscriptionMember.update({
          subscription_id: newSubscription.id,
          user_id: member.user_id
        },{where:{subscription_id:original_subscription_id,user_id: member.user_id}})
      );
      await Promise.all(memberPromises);
    }

    res.json({
      success: true,
      message: "Subscription renewed successfully",
      subscription: {
        id: newSubscription.id,
        start_date: startDate,
        end_date: endDate,
        purchased_user_count: purchased_user_count
      }
    });

  } catch (err) {
    console.error("Error verifying renewal payment:", err);
    res.status(500).json({
      success: false,
      message: "Renewal verification failed"
    });
  }
});

// Get subscription details with members
router.get("/subscription-details/:subscription_id", async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      where: { id: req.params.subscription_id },
      include: [
        { model: Plan, as: 'planDetails' },
        {
          model: SubscriptionMember,
          as: 'members',
          include: [{
            model: User, as: 'user',
            attributes: ['id', 'name', 'mobile', 'email']
          }]
        }
      ]
    });

    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    res.json({
      subscription: {
        id: subscription.id,
        plan_name: subscription.plan.name,
        purchased_user_count: subscription.purchased_user_count,
        current_members: subscription.members.length,
        total_price: subscription.total_price,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        is_active: subscription.is_active,
        members: subscription.members.map(m => m.user)
      }
    });

  } catch (err) {
    console.error("Error fetching subscription details:", err);
    res.status(500).json({ error: "Error fetching subscription details" });
  }
});

module.exports = router;