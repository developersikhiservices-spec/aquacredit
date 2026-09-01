const { sequelize } = require('../config/database');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Supplier = require('../models/Supplier');

async function createCustomer(data,userData) {
    const existingUser = await User.findOne({
      where: { mobile: data.mobile },
    });
  
    let user;
  
    if (!existingUser) {
      user = await User.create({
        name:data.name,
        nickName:data.name?.trim(),
        mobile: data.mobile.trim(),
        role: 'owner',
        owner_user_id: null
      });
  
      user.owner_user_id = user.id;
      await user.update({
        owner_user_id: user.id
      });  
    } else {
      user = existingUser;
    }
  
    await Supplier.findOrCreate({
      where: { mobile: data.mobile },
      defaults: {
        business_owner_id: user.id,
        ownerId: user.id,
        name: userData.name?.trim(),
        nickName:userData.name?.trim(),
        mobile: userData.mobile?.trim(),
        created_user: user.id
      },
    });
  
    return true;
  }
      
module.exports = { createCustomer };
