'use strict';

const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Initialise SendGrid with the API key once at module load
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM;

/**
 * Send a single email via SendGrid.
 *
 * @param {object} params
 * @param {string} params.to       - Recipient email address
 * @param {string} params.subject  - Email subject line
 * @param {string} params.body     - Plain-text body (also used as HTML fallback)
 * @returns {Promise<void>}        - Resolves on success, rejects with Error on failure
 */
const sendEmail = async ({ to, subject, body }) => {
  if (!FROM_EMAIL) {
    throw new Error('EMAIL_FROM environment variable is not set.');
  }

  const message = {
    to,
    from: FROM_EMAIL,
    subject,
    text: body,
    // Wrap plain text in minimal HTML so email clients render it nicely
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;">${body.replace(/\n/g, '<br/>')}</div>`,
  };

  try {
    await sgMail.send(message);
    console.log(`📧 Email sent successfully to ${to} | Subject: "${subject}"`);
  } catch (error) {
    // Extract the most useful message from SendGrid's error structure
    const detail =
      error?.response?.body?.errors?.[0]?.message ||
      error.message ||
      'Unknown SendGrid error';
    throw new Error(`SendGrid delivery failed: ${detail}`);
  }
};

module.exports = { sendEmail };
