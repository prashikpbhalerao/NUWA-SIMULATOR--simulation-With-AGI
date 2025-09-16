// File: server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const app = express(); // 'app' is now initialized

// Now you can use 'app' without an error
app.use(express.static(path.join(__dirname, "public")));

// root route par frontend bhejna
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
// static files serve karna (frontend ke liye)
app.use(express.static(path.join(__dirname, "public")));

// root route par frontend bhejna
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Environment variables (in production, use actual environment variables)
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nuwa_agi';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';
require('dotenv').config();

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

// Create models
const User = mongoose.model('User', UserSchema);
const Simulation = mongoose.model('Simulation', SimulationSchema);
const AISession = mongoose.model('AISession', AISessionSchema);
const Payment = mongoose.model('Payment', PaymentSchema);

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Authorization middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));

// Root route for serving frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, team } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      team: team || 'Team Alpha'
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        team: user.team,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        team: user.team,
        role: user.role,
        subscription: user.subscription
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simulation Routes
app.post('/api/simulations', authenticateToken, async (req, res) => {
  try {
    const { name, description, type, parameters } = req.body;

    const simulation = new Simulation({
      name,
      description,
      type,
      parameters,
      createdBy: req.user.userId,
      teamId: req.user.team || 'Team Alpha',
      collaborators: [{
        userId: req.user.userId,
        role: 'editor'
      }]
    });

    await simulation.save();

    // Populate user data
    await simulation.populate('createdBy', 'username email');

    // Notify all team members about new simulation
    io.to(req.user.team).emit('simulation-created', simulation);

    res.status(201).json(simulation);

  } catch (error) {
    console.error('Create simulation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/simulations', authenticateToken, async (req, res) => {
  try {
    const simulations = await Simulation.find({
      $or: [
        { createdBy: req.user.userId },
        { 'collaborators.userId': req.user.userId },
        { teamId: req.user.team }
      ]
    }).populate('createdBy', 'username email').populate('collaborators.userId', 'username email');

    res.json(simulations);

  } catch (error) {
    console.error('Get simulations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/simulations/:id', authenticateToken, async (req, res) => {
  try {
    const simulation = await Simulation.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('collaborators.userId', 'username email');

    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    // Check if user has access to this simulation
    const hasAccess = simulation.createdBy._id.equals(req.user.userId) ||
      simulation.collaborators.some(c => c.userId._id.equals(req.user.userId)) ||
      simulation.teamId === req.user.team;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(simulation);

  } catch (error) {
    console.error('Get simulation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/simulations/:id', authenticateToken, async (req, res) => {
  try {
    const simulation = await Simulation.findById(req.params.id);

    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    // Check if user has edit access
    const isEditor = simulation.createdBy.equals(req.user.userId) ||
      simulation.collaborators.some(c => c.userId.equals(req.user.userId) && c.role === 'editor');

    if (!isEditor) {
      return res.status(403).json({ error: 'Edit access denied' });
    }

    const updatedSimulation = await Simulation.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    ).populate('createdBy', 'username email').populate('collaborators.userId', 'username email');

    // Notify all collaborators about the update
    io.to(simulation.teamId).emit('simulation-updated', updatedSimulation);

    res.json(updatedSimulation);

  } catch (error) {
    console.error('Update simulation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AI Engine Integration
app.post('/api/ai/query', authenticateToken, async (req, res) => {
  try {
    const { simulationId, engine, prompt } = req.body;

    // Check if user has access to the simulation
    const simulation = await Simulation.findById(simulationId);
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    const hasAccess = simulation.createdBy.equals(req.user.userId) ||
      simulation.collaborators.some(c => c.userId.equals(req.user.userId)) ||
      simulation.teamId === req.user.team;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Call OpenAI API based on the engine type
    let systemPrompt = '';

    switch (engine) {
      case 'urban_planning':
        systemPrompt = 'You are an expert urban planning AI. Provide detailed, technical analysis and recommendations for city layout, infrastructure, and sustainability.';
        break;
      case 'climate':
        systemPrompt = 'You are an expert climate science AI. Provide detailed analysis of environmental factors, climate control systems, and sustainability.';
        break;
      case 'robotics':
        systemPrompt = 'You are an expert robotics AI. Provide detailed analysis of robotic systems, automation, and mechanical engineering solutions.';
        break;
      case 'space':
        systemPrompt = 'You are an expert space mission AI. Provide detailed analysis of space missions, orbital mechanics, and extraterrestrial colonization.';
        break;
      case 'finance':
        systemPrompt = 'You are an expert financial AI. Provide detailed economic models, resource allocation strategies, and financial planning.';
        break;
      default:
        systemPrompt = 'You are an expert AI assistant. Provide detailed, technical analysis and recommendations.';
    }

    // Call OpenAI API
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = openaiResponse.data.choices[0].message.content;
    const usage = openaiResponse.data.usage;

    // Save AI session to database
    const aiSession = new AISession({
      simulationId,
      engine,
      prompt,
      response: aiResponse,
      usage: {
        tokens: usage.total_tokens,
        cpu: Math.random() * 20 + 5, // Simulated CPU usage
        ram: Math.random() * 3 + 1   // Simulated RAM usage
      }
    });

    await aiSession.save();

    // Send real-time update to all collaborators
    io.to(simulation.teamId).emit('ai-response', {
      simulationId,
      engine,
      prompt,
      response: aiResponse,
      usage: aiSession.usage
    });

    res.json({ response: aiResponse, usage: aiSession.usage });

  } catch (error) {
    console.error('AI query error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to process AI query' });
  }
});

// Payment Routes
app.post('/api/payment/create', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;

    const planPrices = {
      basic: 141,
      pro: 547,
      team: 1254,
      enterprise: 2457,
      global: 3514,
      unlimited: 5124
    };

    const amount = planPrices[plan];
    if (!amount) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Create payment record
    const payment = new Payment({
      userId: req.user.userId,
      plan,
      amount,
      status: 'pending',
      paymentId: uuidv4()
    });

    await payment.save();

    // In a real implementation, you would integrate with NowPayments API
    // This is a simplified version
    const paymentData = {
      price_amount: amount,
      price_currency: 'usd',
      pay_currency: 'usd',
      ipn_callback_url: `${req.protocol}://${req.get('host')}/api/payment/callback`,
      order_id: payment.paymentId,
      order_description: `NUWA AGI Subscription: ${plan} plan`,
      success_url: `${req.protocol}://${req.get('host')}/payment/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/payment/cancel`,
    };

    // Simulate payment creation response
    const nowPaymentsResponse = {
      id: `np_${uuidv4()}`,
      payment_status: 'waiting',
      pay_address: 'simulated_payment_address',
      price_amount: amount,
      price_currency: 'usd',
      pay_amount: amount,
      pay_currency: 'usd',
      order_id: payment.paymentId,
      order_description: `NUWA AGI Subscription: ${plan} plan`,
      ipn_callback_url: paymentData.ipn_callback_url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      purchase_id: `purchase_${uuidv4()}`,
      amount_received: 0,
      payin_extra_id: null,
      smart_contract: '',
      network: '',
      network_precision: null,
      time_limit: null,
      expiration_estimate_date: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes from now
    };

    // Update payment with NowPayments ID
    payment.paymentId = nowPaymentsResponse.id;
    await payment.save();

    res.json({
      paymentId: payment.paymentId,
      paymentUrl: `https://nowpayments.io/payment/?id=${nowPaymentsResponse.id}`,
      details: nowPaymentsResponse
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Payment callback endpoint (for NowPayments IPN)
app.post('/api/payment/callback', async (req, res) => {
  try {
    const { payment_id, payment_status, order_id } = req.body;

    // Find payment record
    const payment = await Payment.findOne({ paymentId: payment_id });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    payment.status = payment_status === 'finished' ? 'completed' : payment_status === 'failed' ? 'failed' : 'pending';
    await payment.save();

    // If payment completed, update user subscription
    if (payment.status === 'completed') {
      const user = await User.findById(payment.userId);
      if (user) {
        user.subscription.plan = payment.plan;
        user.subscription.status = 'active';
        user.subscription.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
        await user.save();

        // Notify user about subscription update
        io.to(user._id.toString()).emit('subscription-updated', user.subscription);
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Failed to process payment callback' });
  }
});

// Simulation Engine (simplified version)
class SimulationEngine {
  constructor() {
    this.activeSimulations = new Map();
  }

  startSimulation(simulationId, parameters) {
    // In a real implementation, this would run complex simulations
    // This is a simplified version that just updates progress over time

    const simulation = {
      id: simulationId,
      parameters,
      progress: 0,
      status: 'running',
      metrics: {
        population: parameters.initialPopulation || 1000,
        energy: parameters.initialEnergy || 100,
        oxygen: parameters.initialOxygen || 100,
        food: parameters.initialFood || 100
      }
    };

    this.activeSimulations.set(simulationId, simulation);

    // Simulate progress updates
    const interval = setInterval(() => {
      const sim = this.activeSimulations.get(simulationId);
      if (!sim || sim.status !== 'running') {
        clearInterval(interval);
        return;
      }

      // Update progress and metrics
      sim.progress = Math.min(100, sim.progress + 0.1);

      // Simulate metrics changes based on parameters
      sim.metrics.population += Math.random() * 2;
      sim.metrics.energy -= Math.random() * 0.5;
      sim.metrics.oxygen -= Math.random() * 0.2;
      sim.metrics.food -= Math.random() * 0.3;

      // Ensure metrics don't go below 0
      sim.metrics.energy = Math.max(0, sim.metrics.energy);
      sim.metrics.oxygen = Math.max(0, sim.metrics.oxygen);
      sim.metrics.food = Math.max(0, sim.metrics.food);

      // Notify clients about simulation update
      io.to(simulationId).emit('simulation-progress', {
        simulationId,
        progress: sim.progress,
        metrics: sim.metrics
      });

      // If simulation completed, clear interval
      if (sim.progress >= 100) {
        sim.status = 'completed';
        clearInterval(interval);
        io.to(simulationId).emit('simulation-completed', {
          simulationId,
          results: sim.metrics
        });
      }
    }, 1000); // Update every second

    return simulation;
  }

  pauseSimulation(simulationId) {
    const simulation = this.activeSimulations.get(simulationId);
    if (simulation) {
      simulation.status = 'paused';
    }
  }

  resumeSimulation(simulationId) {
    const simulation = this.activeSimulations.get(simulationId);
    if (simulation) {
      simulation.status = 'running';
    }
  }

  stopSimulation(simulationId) {
    const simulation = this.activeSimulations.get(simulationId);
    if (simulation) {
      simulation.status = 'completed';
      this.activeSimulations.delete(simulationId);
    }
  }

  getSimulationStatus(simulationId) {
    return this.activeSimulations.get(simulationId);
  }
}

// Initialize simulation engine
const simulationEngine = new SimulationEngine();

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user to their team room
  socket.on('join-team', (teamId) => {
    socket.join(teamId);
    console.log(`User ${socket.id} joined team ${teamId}`);
  });

  // Join simulation room
  socket.on('join-simulation', (simulationId) => {
    socket.join(simulationId);
    console.log(`User ${socket.id} joined simulation ${simulationId}`);
  });

  // Start simulation
  socket.on('start-simulation', async (data) => {
    const { simulationId, parameters } = data;

    // Verify user has access to this simulation
    try {
      const simulation = await Simulation.findById(simulationId);
      if (!simulation) {
        socket.emit('error', { message: 'Simulation not found' });
        return;
      }

      // Check if user has edit access
      const isEditor = simulation.createdBy.equals(socket.userId) ||
        simulation.collaborators.some(c => c.userId.equals(socket.userId) && c.role === 'editor');

      if (!isEditor) {
        socket.emit('error', { message: 'Edit access denied' });
        return;
      }

      // Start the simulation
      const sim = simulationEngine.startSimulation(simulationId, parameters);

      // Update simulation status in database
      await Simulation.findByIdAndUpdate(simulationId, { status: 'running', progress: sim.progress });

      // Notify all team members
      io.to(simulation.teamId).emit('simulation-started', {
        simulationId,
        progress: sim.progress,
        metrics: sim.metrics
      });
    } catch (error) {
      console.error('Start simulation error:', error);
      socket.emit('error', { message: 'Failed to start simulation' });
    }

  });

  // Pause simulation
  socket.on('pause-simulation', async (simulationId) => {
    simulationEngine.pauseSimulation(simulationId);

    // Update simulation status in database
    await Simulation.findByIdAndUpdate(simulationId, { status: 'paused' });

    // Notify all users in the simulation room
    io.to(simulationId).emit('simulation-paused', { simulationId });

  });

  // Resume simulation
  socket.on('resume-simulation', async (simulationId) => {
    simulationEngine.resumeSimulation(simulationId);

    // Update simulation status in database
    await Simulation.findByIdAndUpdate(simulationId, { status: 'running' });

    // Notify all users in the simulation room
    io.to(simulationId).emit('simulation-resumed', { simulationId });

  });

  // Stop simulation
  socket.on('stop-simulation', async (simulationId) => {
    simulationEngine.stopSimulation(simulationId);

    // Update simulation status in database
    await Simulation.findByIdAndUpdate(simulationId, { status: 'completed', progress: 100 });

    // Notify all users in the simulation room
    io.to(simulationId).emit('simulation-stopped', { simulationId });

  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for testing

module.exports = { app, server, simulationEngine };
















