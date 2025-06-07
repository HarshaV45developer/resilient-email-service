const express = require('express');
const createEmailController = require('../controllers/emailController');

// This function allows us to pass our initialized service to the routes.
const createEmailRouter = (emailService) => {
  const router = express.Router();
  const emailController = createEmailController(emailService);

  // POST /api/emails/send
  // The main endpoint to request an email to be sent.
  router.post('/send', emailController.sendEmail);

  // GET /api/emails/status/:key
  // The endpoint to check the status of a previously sent request.
  router.get('/status/:key', emailController.getEmailStatus);

  return router;
};

module.exports = createEmailRouter;