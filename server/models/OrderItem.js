module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define("OrderItem", {
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    unit_price_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    line_total_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    prodigi_sku_snapshot: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    estimated_unit_cost_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    allocated_profit_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  });

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, {
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
    OrderItem.belongsTo(models.Design, {
      foreignKey: "designId",
      onDelete: "SET NULL",
    });
    OrderItem.belongsTo(models.ProductVariant, {
      foreignKey: "productVariantId",
      onDelete: "SET NULL",
    });
    OrderItem.belongsTo(models.Charity, {
      foreignKey: "charityId",
      onDelete: "SET NULL",
    });
  };

  return OrderItem;
};
