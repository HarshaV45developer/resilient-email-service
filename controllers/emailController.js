const { v4: uuidv4 } = require('uuid');

// We will pass the instantiated emailService into this controller.
// This is a form of dependency injection.
const createEmailController = (emailService) => {
  const sendEmail = async (req, res) => {
    try {
      const { to, from, subject, body } = req.body;
      if (!to || !from || !subject || !body) {
        return res.status(400).json({ error: 'Missing required fields: to, from, subject, body' });
      }

      // The idempotency key is crucial. The client should send this to safely retry requests.
      // If they don't provide one, we generate one for them.
      const idempotencyKey = req.headers['x-idempotency-key'] || uuidv4();

      const result = await emailService.queueEmail({ to, from, subject, body }, idempotencyKey);

      // Respond immediately with an "Accepted" status.
      // This tells the client we've received the request, and it's being processed.
      return res.status(202).json({ ...result, idempotencyKey });
    } catch (error) {
      console.error('Error in sendEmail controller:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  const getEmailStatus = async (req, res) => {
    try {
      const { key } = req.params;
      if (!key) {
        return res.status(400).json({ error: 'Idempotency key is required in the URL path.' });
      }

      const status = await emailService.getStatus(key);

      if (!status) {
        return res.status(404).json({ error: 'No email found with that idempotency key.' });
      }

      return res.status(200).json(status);
    } catch (error) {
      console.error('Error in getEmailStatus controller:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  return {
    sendEmail,
    getEmailStatus,
  };
};

module.exports = createEmailController;