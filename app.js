'use strict';

const express = require('express');
require('dotenv').config();

const emailRoutes = require('./routes/email.routes');

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────────────

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// Basic request logger in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.url}`);
    next();
  });
}

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'email-scheduler-api',
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

app.use('/emails', emailRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

// ─── Centralised Error Handler ───────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;

  // Log server errors
  if (status >= 500) {
    console.error('🔥 Server Error:', err);
  }

  // Sequelize validation error (e.g. model-level validate hooks)
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return res.status(422).json({
      success: false,
      error: 'Database validation error.',
      details: err.errors?.map((e) => ({ field: e.path, message: e.message })),
    });
  }

  return res.status(status).json({
    success: false,
    error: err.message || 'An unexpected error occurred.',
    // Include validation details if present (from express-validator)
    ...(err.details && { details: err.details }),
    // Only expose stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
