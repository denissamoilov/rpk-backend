const express = require("express");
const router = express.Router();
const Company = require("../models/Company");
const User = require("../models/User");
const { authenticateToken } = require('../middleware/auth');

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

router.post("/create", async (req, res) => {
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
 * /company/list:
 *   get:
 *     summary: Get all companies managed by the authenticated user
 *     description: |
 *       Retrieves all companies associated with the authenticated user.
 *       Requires a valid JWT access token in the Authorization header.
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of companies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 companies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Company Name"
 *                       email:
 *                         type: string
 *                         example: "company@example.com"
 *                       address:
 *                         type: string
 *                         example: "123 Business St"
 *                       userId:
 *                         type: integer
 *                         example: 1
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not authenticated"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error retrieving companies"
 */
router.get("/list", authenticateToken, async (req, res) => {
  try {
    console.log("Headers:", req.headers);
    console.log("Auth header:", req.headers.authorization);
    console.log("User:", req.user);
    
    const userId = req.user?.id; // Make it optional to see if it's undefined
    if (!userId) {
      console.log("No user ID found in request");
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    console.log("User ID:", userId);

    const companies = await Company.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    console.log("Companies found:", companies.length);

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
router.get("/:id", async (req, res) => {
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
router.put("/:id", async (req, res) => {
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
