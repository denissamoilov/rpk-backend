const { Model, DataTypes } = require("sequelize");
const sequelize = require("../config/database");

class RefreshToken extends Model {}

RefreshToken.init(
  {
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "RefreshToken",
    timestamps: true,
  }
);

module.exports = RefreshToken;
