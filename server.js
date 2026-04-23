const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

// Use Railway port OR localhost
const PORT = process.env.PORT || 3000;

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// API route
app.get("/api/message", (req, res) => {
  res.json({
    message: "🔥 Your backend is working!",
    env: process.env.NODE_ENV || "development"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});