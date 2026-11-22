const EmailStatus = require('../models/EmailStatus');
const delay = require('../utils/delay');

class EmailService {
  constructor(primaryProvider, secondaryProvider) {
    this.primaryProvider = primaryProvider;
    this.secondaryProvider = secondaryProvider;

    // --- State for In-Memory Queue and Rate Limiting ---
    this.emailQueue = [];

    // --- Rate Limiting Configuration ---
    this.rateLimit = 5; // 5 requests
    this.rateLimitPeriod = 10000; // per 10 seconds
    this.requestTimestamps = [];

    // --- Re-populate the queue on startup for resilience ---
    this._rehydrateQueue();

    // Start the queue processor automatically.
    this.processQueue();
  }

  /**
   * Public method to add an email to the processing queue.
   * This method is designed to return immediately, acknowledging the request.
   * The actual sending happens in the background.
   */
  async queueEmail(email, idempotencyKey) {
    // 1. IDEMPOTENCY CHECK: See if this email has already been processed or is in progress.
    const existingStatus = await EmailStatus.findOne({ idempotencyKey });

    if (existingStatus) {
      console.log(`[EmailService] Idempotency key '${idempotencyKey}' already exists with status: ${existingStatus.status}`);
      return {
        message: 'Request already processed.',
        status: existingStatus.status,
        id: existingStatus._id,
      };
    }

    // 2. QUEUEING: If it's a new request, create a record in the DB and add to the in-memory queue.
    try {
      const newStatus = await EmailStatus.create({
        idempotencyKey,
        status: 'QUEUED',
        to: email.to,
        from: email.from,
        subject: email.subject,
        body: email.body,
      });

      // Pass the full email details along with the status record
      this.emailQueue.push({ email, statusRecord: newStatus });
      console.log(`[EmailService] Email with key '${idempotencyKey}' has been queued.`);

      return {
        message: 'Email has been accepted for processing.',
        status: 'QUEUED',
        id: newStatus._id,
      };
    } catch (err) {
      // Handle potential race condition if two identical keys arrived concurrently
      if (err.code === 11000) {
        console.log(`[EmailService] Concurrent race caught for idempotency key '${idempotencyKey}'.`);
        const existing = await EmailStatus.findOne({ idempotencyKey });
        return {
          message: 'Request already processed.',
          status: existing ? existing.status : 'QUEUED',
          id: existing ? existing._id : null,
        };
      }
      throw err;
    }
  }

  /**
   * Retrieves the status of an email by its idempotency key.
   */
  async getStatus(idempotencyKey) {
    return EmailStatus.findOne({ idempotencyKey });
  }

  /**
   * The internal queue processor. It runs in a loop, processing emails one by one.
   */
  async processQueue() {
    // This loop runs "forever" checking for new items in the queue.
    while (true) {
      if (this.emailQueue.length === 0) {
        // If the queue is empty, wait a moment before checking again.
        await delay(1000);
        continue;
      }

      // 3. RATE LIMITING CHECK
      const now = Date.now();
      // Remove timestamps that are older than our rate limit period.
      this.requestTimestamps = this.requestTimestamps.filter(
        (ts) => now - ts < this.rateLimitPeriod
      );

      if (this.requestTimestamps.length >= this.rateLimit) {
        console.log('[EmailService] Rate limit reached. Pausing processing...');
        await delay(1000); // Wait and retry the loop
        continue;
      }
      
      // We are within the rate limit, so let's process the next item.
      this.requestTimestamps.push(Date.now());
      
      const { email, statusRecord } = this.emailQueue.shift(); // Get the next email from the queue
      await this._sendWithRetriesAndFallback(email, statusRecord);
    }
  }

  /**
   * The core private method that handles the complex sending logic.
   * @private
   */
  async _sendWithRetriesAndFallback(email, statusRecord) {
    // This function can be called with a statusRecord that might not be fully hydrated
    // if it's coming from _rehydrateQueue. We ensure we have the latest from the DB.
    const currentStatusRecord = await EmailStatus.findById(statusRecord._id);
    if (!currentStatusRecord || ['SENT', 'FAILED'].includes(currentStatusRecord.status)) {
        console.log(`[EmailService] Skipping job with key '${statusRecord.idempotencyKey}' as it's already completed or gone.`);
        return;
    }

    let primaryError; // To store the error from the primary provider

    try {
      // Mark the job as PENDING in the database.
      currentStatusRecord.status = 'PENDING';
      await currentStatusRecord.save();
      console.log(`[EmailService] Processing key '${currentStatusRecord.idempotencyKey}'. Status set to PENDING.`);

      // 4. RETRY LOGIC with Primary Provider
      const retries = 2; // 1 initial attempt + 2 retries
      const baseDelay = 500; // 0.5 seconds

      for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
          await this.primaryProvider.send(email);
          // If successful, update the status and we're done with this job.
          currentStatusRecord.status = 'SENT';
          currentStatusRecord.provider = this.primaryProvider.getName();
          await currentStatusRecord.save();
          console.log(`[EmailService] SUCCESS: Email sent via ${this.primaryProvider.getName()} on attempt ${attempt}.`);
          return; // Exit the function successfully
        } catch (error) {
          console.error(`[EmailService] Attempt ${attempt} with ${this.primaryProvider.getName()} failed.`, error.message);
          if (attempt > retries) {
            // If all retries are exhausted, throw an error to trigger the fallback.
            primaryError = error; // Store the last error from primary
            throw new Error(`Primary provider failed after ${retries + 1} attempts.`);
          }
          // 5. EXPONENTIAL BACKOFF WITH JITTER: Wait before the next retry.
          // Jitter (random variation) prevents retry storms / thundering herd problem.
          const backoff = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 200); // 0-200ms random jitter
          const waitTime = backoff + jitter;
          console.log(`[EmailService] Backoff wait: ${waitTime}ms (backoff: ${backoff}ms, jitter: ${jitter}ms) before retry attempt ${attempt + 1}...`);
          await delay(waitTime);
        }
      }
    } catch (err) {
      // 6. FALLBACK MECHANISM: The primary provider has failed completely.
      console.log(`[EmailService] Primary provider failed. Falling back to ${this.secondaryProvider.getName()}.`);
      try {
        await this.secondaryProvider.send(email);
        // If the fallback is successful, update the status.
        currentStatusRecord.status = 'SENT';
        currentStatusRecord.provider = this.secondaryProvider.getName();
        await currentStatusRecord.save();
        console.log(`[EmailService] SUCCESS: Email sent via fallback provider ${this.secondaryProvider.getName()}.`);
      } catch (secondaryError) {
        // If the fallback also fails, mark the job as FAILED.
        console.error('[EmailService] FATAL: Fallback provider also failed.', secondaryError.message);
        currentStatusRecord.status = 'FAILED';
        currentStatusRecord.errorMessage = `Primary Error: ${primaryError.message || 'N/A'}. Fallback Error: ${secondaryError.message}`;
        currentStatusRecord.provider = this.secondaryProvider.getName();
        await currentStatusRecord.save();
      }
    }
  }

  /**
   * Finds unfinished jobs in the DB on startup and adds them to the queue.
   * This makes the service resilient to restarts without losing real payload.
   * @private
   */
  async _rehydrateQueue() {
    try {
      console.log('[EmailService] Rehydrating queue from database...');
      const unfinishedJobs = await EmailStatus.find({
        status: { $in: ['QUEUED', 'PENDING'] },
      });

      if (unfinishedJobs.length > 0) {
        for (const job of unfinishedJobs) {
            const email = {
              to: job.to,
              from: job.from || 'rehydrated@system.com',
              subject: job.subject || 'Re-queued Email',
              body: job.body || 'This email was re-queued after a service restart.',
            };
            
            this.emailQueue.push({ email, statusRecord: job });
        }
        console.log(`[EmailService] Re-queued ${unfinishedJobs.length} unfinished jobs.`);
      } else {
        console.log('[EmailService] No unfinished jobs to rehydrate.');
      }
    } catch (error) {
      console.error('[EmailService] CRITICAL: Failed to rehydrate queue from database.', error);
    }
  }
}

module.exports = EmailService;
