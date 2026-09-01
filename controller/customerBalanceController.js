async function updateBalances({ user, customer, amount, transaction_type, t }) {

    const amt = Number(amount);
  
    let userUpdate = {};
    let customerUpdate = {};
  
    if (transaction_type === "you_gave") {
      userUpdate = {
        current_balance: user.current_balance - amt,
        total_credit_given: user.total_credit_given + amt,
        credit_given_count: user.credit_given_count + 1
      };
  
      customerUpdate = {
        current_balance: customer.current_balance - amt,
        total_credit_given: customer.total_credit_given + amt
      };
  
    } else if (transaction_type === "you_got") {
  
      userUpdate = {
        current_balance: user.current_balance + amt,
        total_payment_got: user.total_payment_got + amt,
        payment_got_count: user.payment_got_count + 1
      };
  
      customerUpdate = {
        current_balance: customer.current_balance + amt,
        total_payment_got: customer.total_payment_got + amt
      };
  
    } else if (transaction_type === "you_discount") {
  
      userUpdate = {
        current_balance: user.current_balance + amt,
        total_discount_given: user.total_discount_given + amt
      };
  
      customerUpdate = {
        current_balance: customer.current_balance + amt,
        total_discount_given: customer.total_discount_given + amt
      };
    }
  
    await user.update(userUpdate, { transaction: t });
    await customer.update(customerUpdate, { transaction: t });
  }
  