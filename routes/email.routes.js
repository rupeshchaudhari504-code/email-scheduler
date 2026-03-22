'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const {
  createEmail,
  getAllEmails,
  getFailedEmails,
  getEmailById,
  updateEmail,
  deleteEmail,
} = require('../controllers/email.controller');

const router = Router();

// ─── Validation Rule Sets ────────────────────────────────────────────────────

/** Rules used when creating a new scheduled email (all fields required). */
const createRules = [
  body('to_email')
    .trim()
    .notEmpty().withMessage('to_email is required.')
    .isEmail().withMessage('to_email must be a valid email address.')
    .normalizeEmail(),

  body('subject')
    .trim()
    .notEmpty().withMessage('subject is required.')
    .isLength({ max: 500 }).withMessage('subject must not exceed 500 characters.'),

  body('body')
    .trim()
    .notEmpty().withMessage('body is required.'),

  body('scheduled_time')
    .notEmpty().withMessage('scheduled_time is required.')
    .isISO8601().withMessage('scheduled_time must be a valid ISO 8601 datetime.')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('scheduled_time must be a future date/time.');
      }
      return true;
    }),
];

/** Rules for updating an email — all fields optional but validated if present. */
const updateRules = [
  body('to_email')
    .optional()
    .trim()
    .isEmail().withMessage('to_email must be a valid email address.')
    .normalizeEmail(),

  body('subject')
    .optional()
    .trim()
    .notEmpty().withMessage('subject cannot be blank.')
    .isLength({ max: 500 }).withMessage('subject must not exceed 500 characters.'),

  body('body')
    .optional()
    .trim()
    .notEmpty().withMessage('body cannot be blank.'),

  body('scheduled_time')
    .optional()
    .isISO8601().withMessage('scheduled_time must be a valid ISO 8601 datetime.')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('scheduled_time must be a future date/time.');
      }
      return true;
    }),
];

/** Validate that :id is a positive integer. */
const idRule = [
  param('id')
    .isInt({ min: 1 }).withMessage('id must be a positive integer.')
    .toInt(),
];

// ─── Routes ──────────────────────────────────────────────────────────────────
//
// ⚠️  /emails/failed MUST be declared before /emails/:id
//     so Express doesn't interpret "failed" as an id parameter.

/**
 * GET /emails/failed
 * Returns failed and stuck-pending emails.
 */
router.get('/failed', getFailedEmails);

/**
 * POST /emails
 * Create a new scheduled email.
 */
router.post('/', createRules, createEmail);

/**
 * GET /emails
 * List all emails (supports ?page, ?limit, ?status filters).
 */
router.get('/', getAllEmails);

/**
 * GET /emails/:id
 * Fetch a single email by ID.
 */
router.get('/:id', idRule, getEmailById);

/**
 * PUT /emails/:id
 * Update / reschedule a pending email.
 */
router.put('/:id', idRule, updateRules, updateEmail);

/**
 * DELETE /emails/:id
 * Permanently remove an email record.
 */
router.delete('/:id', idRule, deleteEmail);

module.exports = router;
