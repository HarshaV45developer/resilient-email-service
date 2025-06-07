// This is our primary provider. We'll make it fail sometimes to test our resilience.
class MockProviderA {
  getName() {
    return 'ProviderA';
  }

  async send(email) {
    console.log(`[${this.getName()}] Attempting to send email to ${email.to}...`);

    // --- MODIFIED: Corrected comment to reflect the code's behavior. ---
    // Simulate a 60% success rate to force retries and fallbacks.
    if (Math.random() > 0.4) {
      console.log(`[${this.getName()}] Email sent successfully!`);
      return { success: true };
    } else {
      console.error(`[${this.getName()}] FAILED to send email.`);
      throw new Error('ProviderA network error');
    }
  }
}

module.exports = MockProviderA;