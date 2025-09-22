// File: server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
// --- CORS कॉन्फ़िगरेशन को यहाँ अपडेट किया गया है ---
const corsOptions = {
    origin: 'https://frolicking-queijadas-aa917d.netlify.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// ---------------------------------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, 'build')));

// Root route for frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Environment variables
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nuwa_agi';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas & Models
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  team: { type: String, default: 'Team Alpha' },
  role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'viewer' },
  subscription: {
    plan: { type: String, enum: ['basic', 'pro', 'team', 'enterprise', 'global', 'unlimited'], default: 'basic' },
    status: { type: String, enum: ['active', 'inactive', 'canceled'], default: 'inactive' },
    validUntil: Date
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// --------------------
// ADD SIGNUP ROUTE
// --------------------
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    res.json({ message: "Signup successful!" });
  } catch (err) {
    res.status(500).json({ error: "Signup failed", details: err });
  }
});

// --------------------
// ADD LOGIN ROUTE
// --------------------
app.post("/api/login", async (req, res) => {
    
  try {// New AI Chat Route
app.post("/api/ai-chat", authenticateToken, async (req, res) => {
    const SimulationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  data: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Simulation = mongoose.model('Simulation', SimulationSchema);

// Route to save a simulation
app.post("/api/simulations/save", authenticateToken, async (req, res) => {
  try {
    const { name, data } = req.body;
    const userId = req.user.id; // User ID from the token

    if (!name || !data) {
      return res.status(400).json({ error: "Name and data are required." });
    }

    const simulation = new Simulation({ userId, name, data });
    await simulation.save();

    res.status(201).json({ message: "Simulation saved successfully!", simulationId: simulation._id });
  } catch (err) {
    res.status(500).json({ error: "Failed to save simulation.", details: err.message });
  }
});

// Route to get all saved simulations for a user
app.get("/api/simulations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const simulations = await Simulation.find({ userId }).select('-data').sort({ createdAt: -1 });

    res.json(simulations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch simulations.", details: err.message });
  }
});
  try {
    const { prompt } = req.body;

    // Check if API key is available
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key is not configured on the server." });
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer ${OPENAI_API_KEY}
      }
    });

    res.json({ reply: response.data.choices[0].message.content });
  } catch (error) {
    console.error('AI Chat Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Failed to get response from AI.", details: error.message });
  }
});
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err });
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// --------------------
// EXAMPLE API ROUTE (for frontend to test connection)
// --------------------
app.get("/api/me", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// HTTP server & Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for testing
module.exports = { app, server };


