    // File: server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path'); // <-- इसे जोड़ा गया
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
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

// MongoDB Schemas and Models
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

const SimulationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['city', 'climate', 'robotics', 'space', 'finance'], required: true },
  parameters: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['running', 'paused', 'completed', 'failed'], default: 'running' },
  progress: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teamId: { type: String, required: true },
  collaborators: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'] }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AISessionSchema = new mongoose.Schema({
  simulationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Simulation', required: true },
  engine: { type: String, required: true },
  prompt: String,
  response: mongoose.Schema.Types.Mixed,
  usage: { cpu: Number, ram: Number, tokens: Number },
  createdAt: { type: Date, default: Date.now }
});

const PaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  paymentId: String,
  createdAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const Simulation = mongoose.model('Simulation', SimulationSchema);
const AISession = mongoose.model('AISession', AISessionSchema);
const Payment = mongoose.model('Payment', PaymentSchema);

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

// Authorization middleware
const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

// HTTP server & Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Simulation engine & socket events
// ... (बाकी का simulation engine और socket.io code वैसे ही रहेगा)

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for testing
module.exports = { app, server };
