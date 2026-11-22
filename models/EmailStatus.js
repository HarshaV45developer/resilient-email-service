const mongoose = require('mongoose');

const EmailStatusSchema = new mongoose.Schema(
  {
    // The unique key provided by the client to prevent duplicate processing.
    idempotencyKey: {
      type: String,
      required: true,
      unique: true, // Ensures no two documents have the same key.
      index: true, // Improves query performance for this field.
    },
    // The current state of the email sending process.
    status: {
      type: String,
      enum: ['QUEUED', 'PENDING', 'SENT', 'FAILED'], // Only these values are allowed.
      required: true,
    },
    // The final provider that handled the request.
    provider: {
      type: String,
    },
    // The recipient of the email.
    to: {
      type: String,
      required: true,
    },
    // Full email payload persistence for reliable restarts
    from: {
      type: String,
    },
    subject: {
      type: String,
    },
    body: {
      type: String,
    },
    // A record of the last error message if the status is FAILED.
    errorMessage: {
      type: String,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` fields.
    timestamps: true,
  }
);

// The first argument is the singular name of the collection your model is for.
// Mongoose automatically looks for the plural, lowercased version of your model name.
// Thus, for the model 'EmailStatus', Mongoose will create/use the 'emailstatuses' collection.
module.exports = mongoose.model('EmailStatus', EmailStatusSchema);
