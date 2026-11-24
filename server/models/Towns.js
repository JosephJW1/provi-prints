module.exports = (sequelize, DataTypes) => {
  const Towns = sequelize.define("Towns", {
    townName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  });

  Towns.associate = (models) => {
    Towns.belongsToMany(models.Design, {
      through: "DesignTowns",
      foreignKey: "townId",
    });
    if (models.Charity) {
      Towns.hasMany(models.Charity, {
        foreignKey: "townId",
        onDelete: "SET NULL",
      });
    }
  };

  return Towns;
};
