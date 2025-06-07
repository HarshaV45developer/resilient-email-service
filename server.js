// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const connectDB = require('./config/db');
const EmailService = require('./services/EmailService');
const MockProviderA = require('./providers/MockProviderA');
const MockProviderB = require('./providers/MockProviderB');
const createEmailRouter = require('./routes/emailRoutes');

// --- Initialization ---

// 1. Connect to MongoDB
connectDB();

// 2. Initialize the Express app
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// 3. Initialize Providers and the core EmailService
// This creates a single instance of our service that will be used throughout the app's lifecycle.
const primaryProvider = new MockProviderA();
const secondaryProvider = new MockProviderB();
const emailService = new EmailService(primaryProvider, secondaryProvider);

// --- Routes ---
// We inject our emailService instance into our routing setup.
app.use('/api/emails', createEmailRouter(emailService));

// --- Basic Welcome Route ---
app.get('/', (req, res) => {
  res.send('Resilient Email Service is running...');
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});