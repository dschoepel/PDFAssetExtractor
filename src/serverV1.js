const path = require("path");
const http = require("http");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../", ".env") });
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();
const PORT = process.env.API_PORT || 5005;
global.__basedir = __dirname;

app.use(helmet());
app.use(bodyParser.json());

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const welcomeMsg = { title: "Welcome to the pdf table extractor application." };

app.use(morgan("combined"));

app.use("/pdfs", express.static(path.join(__dirname, "v1", "pdfs")));

const v1FileRouter = require(path.join(__dirname, "./v1/routes/file.routes"));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  req.setTimeout(4 * 60 * 1000 + 1);
  next();
});

// routes
app.use("/api/v1/file", v1FileRouter);

// default route
app.get("/", (req, res) => {
  // res.sendFile(path.join(__dirname + "/v1/public/index.html"));
  res.json({
    message: "Welcome to the PDFAssetExtractor API.",
  });
});

app.listen(PORT, () => {
  console.log("Dirname = ", __dirname);
  console.log(`Server is running on port ${PORT}.`);
  // V1SwaggerDocs(app, PORT);
});

module.exports = app;
