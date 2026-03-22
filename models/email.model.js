'use strict';

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Email model — represents a scheduled email record.
 *
 * Statuses:
 *   pending → waiting to be sent (scheduled_time in the future or now)
 *   sent    → successfully delivered via SendGrid
 *   failed  → all send attempts exhausted; error_message contains the reason
 */
class Email extends Model {}

Email.init(
  {
    // ─── Primary Key ────────────────────────────────────────────────────────
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    // ─── Recipient ──────────────────────────────────────────────────────────
    to_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: { msg: 'to_email must be a valid email address.' },
        notEmpty: { msg: 'to_email cannot be empty.' },
      },
    },

    // ─── Content ────────────────────────────────────────────────────────────
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'subject cannot be empty.' },
        len: { args: [1, 500], msg: 'subject must be between 1 and 500 characters.' },
      },
    },

    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'body cannot be empty.' },
      },
    },

    // ─── Scheduling ─────────────────────────────────────────────────────────
    scheduled_time: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: { msg: 'scheduled_time must be a valid datetime.' },
      },
    },

    // ─── Status ─────────────────────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },

    // ─── Error Tracking ─────────────────────────────────────────────────────
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    // ─── Retry Tracking ─────────────────────────────────────────────────────
    retry_count: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of send attempts made so far.',
    },
  },
  {
    sequelize,
    modelName: 'Email',
    tableName: 'emails',
    timestamps: true,          // Adds created_at and updated_at automatically
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // Speed up the scheduler query: WHERE status='pending' AND scheduled_time <= NOW()
      {
        name: 'idx_status_scheduled_time',
        fields: ['status', 'scheduled_time'],
      },
    ],
  }
);

module.exports = Email;
