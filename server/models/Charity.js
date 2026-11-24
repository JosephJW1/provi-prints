module.exports = (sequelize, DataTypes) => {
  const Charity = sequelize.define("Charity", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    charity_reg_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    logo_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payout_provider: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "manual_batch",
      validate: {
        isIn: [["manual_batch", "work_for_good", "wise", "goodstack"]],
      },
    },
    external_payout_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bank_sort_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bank_account_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  });

  Charity.associate = (models) => {
    Charity.belongsTo(models.Towns, {
      foreignKey: "townId",
      onDelete: "SET NULL",
    });
    if (models.CharityLedger) {
      Charity.hasMany(models.CharityLedger, {
        foreignKey: "charityId",
        onDelete: "RESTRICT",
      });
    }
  };

  return Charity;
};
