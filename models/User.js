const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { addBusinessDays } = require('date-fns');
const crypto = require('crypto');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  nickName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  secureCode: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  businessName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
 
  businessType: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  
  owner_user_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    },
    allowNull:true,
    onDelete: 'SET NULL'
  },      
  role: {
    type: DataTypes.ENUM('owner', 'employee'),
    allowNull: false,
    defaultValue:"owner"
  },
    
  mobile: {
    type: DataTypes.STRING(20),
    allowNull: false,
    // unique: true,
    validate: {
      len: [10, 15]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    // unique: true,
    validate: {
      isEmail: true
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },  
  GST: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  photo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },  
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  current_balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_credit_given: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  credit_given_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_payment_got: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  payment_got_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_discount_given: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  // Add inside the define() fields object
referral_code: {
  type: DataTypes.STRING(20),
  unique: true,
  allowNull: true,
},
referred_by: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'users',
    key: 'id'
  },
  onDelete: 'SET NULL'
},
referral_count: {
  type: DataTypes.INTEGER,
  defaultValue: 0,
},
referral_earnings: {
  type: DataTypes.DECIMAL(15, 2),
  defaultValue: 0.00,
},
  status: {
    type: DataTypes.STRING(15),
    defaultValue: 'Active'
  }
}, {
  tableName: 'users',
  indexes: [
    {
      fields: ['mobile']
    },
  ]
});
User.afterCreate(async (user, options) => {
  if (user.role === 'owner') {
    await user.update({
      owner_user_id: user.id
    });
  }
// Generate unique referral code if not already present
if (!user.referral_code) {
  let code;
  let exists = true;
  while (exists) {
    code = crypto.randomBytes(6).toString('hex').toUpperCase(); // e.g., "A3F9E1B2"
    const existing = await User.findOne({ where: { referral_code: code } });
    if (!existing) exists = false;
  }
  await user.update({ referral_code: code });
}  
});

module.exports = User;