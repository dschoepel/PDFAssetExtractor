const util = require("util");
const path = require("path");
const multer = require("multer");
const maxSize = 10 * 1024 * 1024;

// let storage = multer.memoryStorage();

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../", "/pdfs"));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.includes("pdf")) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

let uploadFile = multer({
  storage: storage,
  fileFilter: fileFilter,
}).single("file");

// let uploadFile = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: { fileSize: maxSize },
// }).single("file");

let uploadFileMiddleware = util.promisify(uploadFile);

module.exports = uploadFileMiddleware;
