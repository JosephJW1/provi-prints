module.exports = (sequelize, DataTypes) => {
  const ProductVariant = sequelize.define("ProductVariant", {
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    prodigi_sku: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "GLOBAL-PAP-A4",
    },
    estimated_cost_pence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  });

  ProductVariant.associate = (models) => {
    ProductVariant.belongsTo(models.Product, {
      foreignKey: "productId",
      onDelete: "CASCADE",
    });
  };

  return ProductVariant;
};
