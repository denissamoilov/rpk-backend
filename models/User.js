const { Model, DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const sequelize = require("../config/database");
const passwordValidator = require("../utils/passwordValidator");

class User extends Model {}

User.init(
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    surname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    personalIdCode: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        isNumeric: {
          msg: "Personal ID code must be a number",
        },
        len: {
          args: [11, 11],
          msg: "Personal ID code must be 11 digits long",
        },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: "Please enter a valid email address",
        },
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        customValidator(value) {
          const validation = passwordValidator(value);
          if (!validation.isValid) {
            throw new Error(validation.errors.join(", "));
          }
        },
      },
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "User",
    timestamps: true,
    hooks: {
      beforeSave: async (user) => {
        if (user.changed("password")) {
          user.password = await bcrypt.hash(user.password, 8);
        }
      },
    },
  }
);

// Instance method to remove password when converting to JSON
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = User;
