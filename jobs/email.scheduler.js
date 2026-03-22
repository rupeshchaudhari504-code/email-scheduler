'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const Email = require('../models/email.model');
const { sendEmail } = require('../services/email.service');

require('dotenv').config();

// Maximum number of send attempts before marking an email as permanently failed
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);

// Cron schedule expression — default: every minute
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '* * * * *';

/**
 * Process a single pending email.
 *
 * Attempts to send the email via SendGrid.
 * On success  → status = 'sent',   error_message = null
 * On failure:
 *   retry_count < MAX_RETRY_ATTEMPTS → keep status = 'pending', increment retry_count, store error
 *   retry_count >= MAX_RETRY_ATTEMPTS → status = 'failed', store error_message
 *
 * @param {Email} email - Sequelize Email instance
 */
const processEmail = async (email) => {
  try {
    await sendEmail({
      to: email.to_email,
      subject: email.subject,
      body: email.body,
    });

    // ── Success ──────────────────────────────────────────────────────────────
    await email.update({
      status: 'sent',
      error_message: null,
    });

    console.log(`✅ [Scheduler] Email id=${email.id} → sent to ${email.to_email}`);
  } catch (error) {
    const newRetryCount = email.retry_count + 1;
    const errorMsg = error.message || 'Unknown error';

    if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
      // ── Permanently failed ────────────────────────────────────────────────
      await email.update({
        status: 'failed',
        retry_count: newRetryCount,
        error_message: `[Attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS}] ${errorMsg}`,
      });

      console.error(
        `❌ [Scheduler] Email id=${email.id} permanently FAILED after ${newRetryCount} attempts. Error: ${errorMsg}`
      );
    } else {
      // ── Will retry next tick ──────────────────────────────────────────────
      await email.update({
        retry_count: newRetryCount,
        error_message: `[Attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS}] ${errorMsg}`,
      });

      console.warn(
        `⚠️  [Scheduler] Email id=${email.id} failed (attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS}). Will retry. Error: ${errorMsg}`
      );
    }
  }
};

/**
 * Main scheduler job.
 *
 * Runs on the configured cron schedule (default: every minute).
 * Fetches all pending emails whose scheduled_time has arrived and
 * processes them concurrently (Promise.allSettled so one failure
 * doesn't abort the others).
 */
const startScheduler = () => {
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`❌ Invalid CRON_SCHEDULE "${CRON_SCHEDULE}". Scheduler not started.`);
    return;
  }

  console.log(`🕐 Email scheduler started. Running on schedule: "${CRON_SCHEDULE}"`);

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`\n⏰ [Scheduler] Tick at ${new Date().toISOString()} — checking for due emails...`);

    try {
      // Fetch pending emails that are due and haven't exceeded max retries
      const dueEmails = await Email.findAll({
        where: {
          status: 'pending',
          scheduled_time: { [Op.lte]: new Date() },
          retry_count: { [Op.lt]: MAX_RETRY_ATTEMPTS },
        },
        order: [['scheduled_time', 'ASC']],
      });

      if (dueEmails.length === 0) {
        console.log('   No emails due. Sleeping until next tick.');
        return;
      }

      console.log(`   Found ${dueEmails.length} email(s) to process.`);

      // Process all due emails concurrently; don't let one failure block others
      const results = await Promise.allSettled(
        dueEmails.map((email) => processEmail(email))
      );

      // Log any unexpected promise rejections (shouldn't happen — processEmail catches all)
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(
            `   Unexpected rejection for email id=${dueEmails[idx].id}:`,
            result.reason
          );
        }
      });
    } catch (error) {
      console.error('❌ [Scheduler] Critical error during tick:', error.message);
    }
  });
};

module.exports = { startScheduler, processEmail };
