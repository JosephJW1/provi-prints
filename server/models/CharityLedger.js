module.exports = (sequelize, DataTypes) => {
  const CharityLedger = sequelize.define("CharityLedger", {
    amount_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "gbp",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "estimated",
      validate: {
        isIn: [["estimated", "accrued", "paid", "reversed"]],
      },
    },
    payout_batch_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payout_provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notes: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });

  CharityLedger.associate = (models) => {
    CharityLedger.belongsTo(models.Charity, {
      foreignKey: "charityId",
      onDelete: "RESTRICT",
    });
    CharityLedger.belongsTo(models.Order, {
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
    CharityLedger.belongsTo(models.OrderItem, {
      foreignKey: "orderItemId",
      onDelete: "SET NULL",
    });
  };

  return CharityLedger;
};
