'use strict';

const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const Email = require('../models/email.model');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract express-validator errors and throw a formatted 422 error.
 * Returns null if no errors.
 */
const checkValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed.');
    err.status = 422;
    err.details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return err;
  }
  return null;
};

/**
 * Default page size for paginated listings.
 */
const DEFAULT_PAGE_SIZE = 20;

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /emails
 * Create a new scheduled email.
 */
const createEmail = async (req, res, next) => {
  try {
    const validationError = checkValidation(req);
    if (validationError) { return next(validationError); }

    const { to_email, subject, body, scheduled_time } = req.body;

    const email = await Email.create({
      to_email,
      subject,
      body,
      scheduled_time,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Email scheduled successfully.',
      data: email,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /emails
 * List all emails with optional filters and pagination.
 *
 * Query params:
 *   page    (number, default 1)
 *   limit   (number, default 20, max 100)
 *   status  (pending | sent | failed)
 */
const getAllEmails = async (req, res, next) => {
  try {
    // ── Pagination ──────────────────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || String(DEFAULT_PAGE_SIZE), 10)));
    const offset = (page - 1) * limit;

    // ── Filtering ───────────────────────────────────────────────────────────
    const where = {};
    const allowedStatuses = ['pending', 'sent', 'failed'];
    if (req.query.status && allowedStatuses.includes(req.query.status)) {
      where.status = req.query.status;
    }

    const { count, rows } = await Email.findAndCountAll({
      where,
      order: [['scheduled_time', 'ASC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /emails/failed
 * Shortcut — returns all emails with status 'failed' or still 'pending'
 * past their scheduled_time (stuck/unsent).
 *
 * ⚠️  This route MUST be registered BEFORE /emails/:id so Express doesn't
 *     try to treat "failed" as an id parameter.
 */
const getFailedEmails = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || String(DEFAULT_PAGE_SIZE), 10)));
    const offset = (page - 1) * limit;

    const { count, rows } = await Email.findAndCountAll({
      where: {
        [Op.or]: [
          { status: 'failed' },
          // Stuck pending emails — scheduled_time is in the past but still pending
          {
            status: 'pending',
            scheduled_time: { [Op.lt]: new Date() },
          },
        ],
      },
      order: [['scheduled_time', 'DESC']],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /emails/:id
 * Fetch a single email by primary key.
 */
const getEmailById = async (req, res, next) => {
  try {
    const email = await Email.findByPk(req.params.id);

    if (!email) {
      const err = new Error(`Email with id ${req.params.id} not found.`);
      err.status = 404;
      return next(err);
    }

    return res.status(200).json({ success: true, data: email });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /emails/:id
 * Update / reschedule an email.
 * Only 'pending' emails can be edited.
 */
const updateEmail = async (req, res, next) => {
  try {
    const validationError = checkValidation(req);
    if (validationError) { return next(validationError); }

    const email = await Email.findByPk(req.params.id);

    if (!email) {
      const err = new Error(`Email with id ${req.params.id} not found.`);
      err.status = 404;
      return next(err);
    }

    if (email.status !== 'pending') {
      const err = new Error(
        `Cannot update an email with status '${email.status}'. Only pending emails can be modified.`
      );
      err.status = 409;
      return next(err);
    }

    const { to_email, subject, body, scheduled_time } = req.body;

    await email.update({
      to_email:       to_email       ?? email.to_email,
      subject:        subject        ?? email.subject,
      body:           body           ?? email.body,
      scheduled_time: scheduled_time ?? email.scheduled_time,
      // Reset error state when rescheduling
      error_message:  null,
      retry_count:    0,
    });

    return res.status(200).json({
      success: true,
      message: 'Email updated successfully.',
      data: email,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /emails/:id
 * Permanently delete an email record.
 */
const deleteEmail = async (req, res, next) => {
  try {
    const email = await Email.findByPk(req.params.id);

    if (!email) {
      const err = new Error(`Email with id ${req.params.id} not found.`);
      err.status = 404;
      return next(err);
    }

    await email.destroy();

    return res.status(200).json({
      success: true,
      message: `Email ${req.params.id} deleted successfully.`,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createEmail,
  getAllEmails,
  getFailedEmails,
  getEmailById,
  updateEmail,
  deleteEmail,
};
