// cron/defaulterCron.js

const cron = require('node-cron');
const  updateDefaulters  = require('./updateDefaulters');
const { Op, Sequelize } = require('sequelize');

function startDefaulterCron() {

  cron.schedule('0 0 * * *', async () => {
    console.log("Running defaulter check at midnight...");

    try {
      await updateDefaulters();
    } catch (error) {
      console.error("Cron error:", error);
    }

  });

  console.log("Defaulter cron initialized.");
}

module.exports = startDefaulterCron;
