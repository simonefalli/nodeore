const express = require('express');
const router = express.Router();

router.get("/", (req, res) => {
    res.json({
      message: "Ehi, ciao!",
    });
  });

module.exports = router;


