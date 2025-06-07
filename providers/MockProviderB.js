// This is our fallback provider. We'll make it much more reliable.
class MockProviderB {
  getName() {
    return 'ProviderB';
  }

  async send(email) {
    console.log(`[${this.getName()}] Attempting to send email to ${email.to}...`);

    // Simulate a reliable provider with a 95% success rate.
    if (Math.random() > 0.05) {
      console.log(`[${this.getName()}] Email sent successfully!`);
      return { success: true };
    } else {
      console.error(`[${this.getName()}] FAILED to send email.`);
      throw new Error('ProviderB internal server error');
    }
  }
}

module.exports = MockProviderB;