module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define("Order", {
    order_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    customer_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customer_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shipping_address_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    charity_selection_mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "per_item",
      validate: {
        isIn: [["per_item", "per_order"]],
      },
    },
    stripe_session_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    prodigi_order_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    prodigi_stage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tracking_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tracking_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subtotal_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    shipping_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_paid_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    stripe_fee_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    prodigi_cost_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    net_profit_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    charity_profit_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fulfillment_error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending_payment",
      validate: {
        isIn: [
          [
            "pending_payment",
            "paid",
            "in_production",
            "shipped",
            "fulfillment_error",
            "cancelled",
            "refunded",
          ],
        ],
      },
    },
  });

  Order.associate = (models) => {
    Order.belongsTo(models.User, {
      foreignKey: "userId",
      onDelete: "SET NULL",
    });
    Order.belongsTo(models.Charity, {
      as: "OrderCharity",
      foreignKey: "orderCharityId",
      onDelete: "SET NULL",
    });
    Order.hasMany(models.OrderItem, {
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
    Order.hasMany(models.CharityLedger, {
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
  };

  return Order;
};
