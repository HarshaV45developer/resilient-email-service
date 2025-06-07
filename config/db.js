const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Mongoose will create the 'email-service' database if it doesn't exist.
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connection Successful...');
  } catch (err) {
    console.error('MongoDB Connection Failed:', err.message);
    // Exit process with failure code
    process.exit(1);
  }
};

module.exports = connectDB;