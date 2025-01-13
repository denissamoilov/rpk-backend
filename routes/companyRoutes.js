const express = require("express");
const router = express.Router();
const Company = require("../models/Company");
const User = require("../models/User");

/**
 * @swagger
 * /company/create:
 *   post:
 *     summary: Create a new company
 *     tags: [Company]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - registrationNumber
 *               - email
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               address:
 *                 type: string
 */

router.post("/company/create", async (req, res) => {
  try {
    const { name, address, registrationNumber, email } = req.body;

    const userId = req.user.id;

    const existingCompany = await Company.findOne({
      where: { registrationNumber, userId: userId },
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: "Company with this registration number already exists",
      });
    }

    const company = await Company.create({
      name,
      registrationNumber,
      email,
      address,
      managerId,
    });

    res.status(201).json({
      success: true,
      message: "Company created successfully",
      company,
    });
  } catch (error) {
    console.error("Company creation error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating company",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /user/company-list:
 *   get:
 *     summary: Get all companies managed by the authenticated user
 *     tags: [Company]
 */
router.get("/user/company-list", async (req, res) => {
  try {
    const userId = req.user.id; // Will be set by auth middleware

    const companies = await Company.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      companies,
    });
  } catch (error) {
    console.error("Error fetching user companies:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching companies",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /company/{id}:
 *   get:
 *     summary: Get company details
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.get("/company/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Will be set by auth middleware

    const company = await Company.findOne({
      where: {
        id,
        userId, // Ensure user can only access their own companies
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    res.status(200).json({
      success: true,
      company,
    });
  } catch (error) {
    console.error("Error fetching company:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching company details",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /company/{id}:
 *   put:
 *     summary: Update company details
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               address:
 *                 type: string
 */
router.put("/company/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Will be set by auth middleware
    const { name, email, address } = req.body;

    const company = await Company.findOne({
      where: {
        id,
        userId, // Ensure user can only update their own companies
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Update company details
    await company.update({
      name,
      email,
      address,
    });

    res.status(200).json({
      success: true,
      message: "Company updated successfully",
      company,
    });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({
      success: false,
      message: "Error updating company",
      error: error.message,
    });
  }
});

module.exports = router;
