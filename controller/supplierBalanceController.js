async function updateSupplierBalances({ user, supplier, amount, transaction_type, t }) {

    const amt = Number(amount);
  
    let userUpdate = {};
    let supplierUpdate = {};
  
    if (transaction_type === "you_gave") {
      // You paid supplier
      supplierUpdate = {
        current_balance: supplier.current_balance - amt,
        total_credit_given: supplier.total_credit_given + amt
      };
  
      userUpdate = {
        current_balance: user.current_balance - amt,
        total_credit_given: user.total_credit_given + amt,
        credit_given_count: user.credit_given_count + 1
      };
  
    } else if (transaction_type === "you_got") {
      // Supplier refunded you
      supplierUpdate = {
        current_balance: supplier.current_balance + amt,
        total_payment_got: supplier.total_payment_got + amt
      };
  
      userUpdate = {
        current_balance: user.current_balance + amt,
        total_payment_got: user.total_payment_got + amt,
        payment_got_count: user.payment_got_count + 1
      };
  
    } else if (transaction_type === "you_discount") {
      // Supplier gave discount
      supplierUpdate = {
        current_balance: supplier.current_balance + amt,
        total_discount_given: supplier.total_discount_given + amt
      };
  
      userUpdate = {
        current_balance: user.current_balance + amt,
        total_discount_given: user.total_discount_given + amt
      };
    }
  
    await supplier.update(supplierUpdate, { transaction: t });
    await user.update(userUpdate, { transaction: t });
  }
  