module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define("User", {
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30],
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "customer", // All new users default to customer
      validate: {
        isIn: [["customer", "admin"]],
      },
    },
    stripe_customer_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });

  User.associate = (models) => {
    if (models.Order) {
      User.hasMany(models.Order, {
        foreignKey: "userId",
        onDelete: "SET NULL",
      });
    }
  };

  return User;
};
