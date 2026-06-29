const express = require("express");
const multer = require("multer");
const path = require("path");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'upload'); // Cartella dove verranno salvati i file
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

router.post("/", upload.single("photo"), (req, res, next) => {
 
  const file = req.file;
  if (!file) {
    const error = new Error("Please upload a file");
    error.httStatusCode = 400;
    return next(error);
  }

  res.send(file);
});

module.exports = router;
