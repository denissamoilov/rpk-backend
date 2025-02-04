const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Company = require("../models/Company")
const RefreshToken = require("../models/RefreshToken");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");
const bcrypt = require("bcryptjs");

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to generate tokens
const generateTokens = async (user) => {
  // Generate access token (15 minutes)
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  // Generate refresh token (7 days)
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );

  // Calculate expiration date for refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Save refresh token in database
  await RefreshToken.create({
    token: refreshToken,
    userId: user.id,
    expiresAt,
  });

  return { accessToken, refreshToken };
};

/**
 * @swagger
 * /signup:
 *   post:
 *     summary: Request email verification
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - surname
 *               - personalIdCode
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               surname:
 *                 type: string
 *               personalIdCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification email sent successfully
 *       400:
 *         description: Invalid input or user already verified
 *       500:
 *         description: Server error
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, surname, personalIdCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified",
        });
      }

      // Create new verification token
      const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      // Update existing user with new verification token
      await existingUser.update({ verificationToken });

      // Generate verification URL
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

      // Send verification email using Resend
      const emailResponse = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: "Verify your email",
        html: `
          <h1>Email Verification</h1>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}">Verify Email</a>
          <p>This link will expire in 1 hour.</p>
        `,
      });

      console.log("Resend API Response:", emailResponse);

      return res.status(200).json({
        success: true,
        message: "Verification email sent successfully",
        emailId: emailResponse.id,
        user: {
          email: existingUser.email,
          name: existingUser.name,
          surname: existingUser.surname,
          personalIdCode: existingUser.personalIdCode,
          isVerified: existingUser.isVerified,
        },
      });
    }

    // Generate verification token for new user
    const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Create new user with all fields
    const user = await User.create({
      email,
      password,
      name,
      surname,
      personalIdCode,
      verificationToken,
    });

    // Generate verification URL
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // Send verification email using Resend
    const emailResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Verify your email",
      html: `
        <h1>Email Verification</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">Verify Email</a>
        <p>This link will expire in 1 hour.</p>
      `,
    });

    console.log("Resend API Response:", emailResponse);

    res.status(200).json({
      success: true,
      message: "User registered and verification email sent successfully",
      emailId: emailResponse.id,
      user: {
        email: user.email,
        name: user.name,
        surname: user.surname,
        personalIdCode: user.personalIdCode,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Error:", error);

    // Handle Sequelize validation errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((err) => ({
          field: err.path,
          message: err.message,
        })),
      });
    }

    // Handle unique constraint errors
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((err) => ({
          field: err.path,
          message: err.message,
        })),
      });
    }

    res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /verify-email:
 *   post:
 *     summary: Verify email with token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: The verification token received via email
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find and update user
    const user = await User.findOne({ where: { email: decoded.email } });

    if (!user) {
      return res.status(400).json({ message: "Invalid verification token" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    if (user.verificationToken !== token) {
      return res.status(400).json({ message: "Invalid verification token" });
    }

    // Update user verification status
    await user.update({
      isVerified: true,
      verificationToken: null,
    });

    // Send JSON response with proper headers
    res
      .status(200)
      .header("Content-Type", "application/json")
      .json({
        success: true,
        message: "Email verified successfully",
        user: {
          email: user.email,
          isVerified: true,
        },
      });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).header("Content-Type", "application/json").json({
        success: false,
        message: "Verification link has expired",
      });
    }
    console.error("Verification error:", error);
    res.status(500).header("Content-Type", "application/json").json({
      success: false,
      message: "Error verifying email",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     isVerified:
 *                       type: boolean
 *       400:
 *         description: Invalid credentials or email not verified
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });

    // Check if user exists
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email before logging in",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user);

    res.cookie(
      "refreshToken", refreshToken,
      {
        httpOnly: true,
        secure: true,
        path: "/",
        sameSite: "Strict",
      }
    );

    // Send response
    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: {
        name: user.name,
        surname: user.surname,
        personalIdCode: user.personalIdCode,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /forgot-password:
 *   post:
 *     summary: Request password reset link
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Email not found
 *       500:
 *         description: Server error
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "If an account exists with this email, you will receive a password reset link",
      });
    }

    // Generate reset token (1 hour expiration)
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Update user with reset token
    await user.update({ verificationToken: resetToken });

    // Generate reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send reset email
    const emailResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Reset Your Password",
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    console.log("Reset email sent:", emailResponse);

    // Send success response (same message whether user exists or not for security)
    res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, you will receive a password reset link",
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing password reset request",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 description: |
 *                   New password must meet the following requirements:
 *                   - At least 8 characters long
 *                   - At least one uppercase letter
 *                   - At least one lowercase letter
 *                   - At least one number
 *                   - At least one special character
 *     responses:
 *       200:
 *         description: Password successfully reset
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findOne({
      where: {
        email: decoded.email,
        verificationToken: token,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired password reset link",
      });
    }

    // Update password and clear reset token
    await user.update({
      password: password, // bcrypt hash is handled by User model hooks
      verificationToken: null,
    });

    // Send reset email
    const emailResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: decoded.email,
      subject: "Password Reset Success",
      html: `
        <h1>Password Reset Success</h1>
        <p>Your password has been reset successfully. If you did not request this, please contact support.</p>
      `,
    });

    console.log("Reset email sent:", emailResponse);

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({
        success: false,
        message: "Password reset link has expired",
      });
    }

    console.error("Password reset error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /refresh-token:
 *   post:
 *     summary: Get new access token using refresh token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 *       400:
 *         description: Invalid or expired refresh token
 *       500:
 *         description: Server error
 */
router.post("/refresh-token", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Find refresh token in database
    const savedToken = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        isRevoked: false,
      },
    });

    if (!savedToken) {
      return res.status(400).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Check if token is expired
    if (new Date() > savedToken.expiresAt) {
      await savedToken.update({ isRevoked: true });
      return res.status(400).json({
        success: false,
        message: "Refresh token has expired",
      });
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Find user
    const user = await User.findOne({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate new tokens
    const tokens = await generateTokens(user);

    // Revoke old refresh token
    await savedToken.update({ isRevoked: true });

    // Set the new refresh token in cookie
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      path: "/",
      sameSite: "Strict",
    });

    // Only send access token in response body
    res.status(200).json({
      success: true,
      message: "New tokens generated successfully",
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({
        success: false,
        message: "Refresh token has expired",
      });
    }

    console.error("Token refresh error:", error);
    res.status(500).json({
      success: false,
      message: "Error refreshing token",
      error: error.message,
    });
  }
});

module.exports = router;
