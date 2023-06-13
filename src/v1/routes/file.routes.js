const fileController = require("../controllers/file.controller");
const express = require("express");

const router = express.Router();

// router.post("/pdf/:filename", fileController.extractPdfDetails);
router.post("/pdf", fileController.extractPdfDetails);

module.exports = router;
