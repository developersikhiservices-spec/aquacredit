const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

async function updateDefaulters() {

  const today = new Date();

  const overdueTransactions = await Transaction.findAll({
    where: {
      paymentType: 'credit',
      remainingAmount: { [Op.gt]: 0 },
      due_date: { [Op.lt]: today },
      is_Deleted: false
    }
  });

  for (let trx of overdueTransactions) {

    const delayDays = Math.floor(
      (today - new Date(trx.due_date)) / (1000 * 60 * 60 * 24)
    );

    let stage = "Stage 1";

    if (delayDays > 90) stage = "Stage 4";
    else if (delayDays > 60) stage = "Stage 3";
    else if (delayDays > 30) stage = "Stage 2";

    // ================= CUSTOMER =================
    if (trx.transaction_for === "customer") {

      await Customer.update(
        {
          status: "Defaulter",
          defaulter_stage: stage,
          delay_days: delayDays
        },
        {
          where: { id: trx.customer_id }
        }
      );

    }

    // ================= SUPPLIER =================
    if (trx.transaction_for === "supplier") {

      await Supplier.update(
        {
          status: "Defaulter",
          defaulter_stage: stage,
          delay_days: delayDays
        },
        {
          where: { id: trx.supplier_id }
        }
      );

    }
  }
}
module.exports = updateDefaulters;
