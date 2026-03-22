'use strict';

/**
 * Unit tests for the Email Scheduler API.
 *
 * These tests mock Sequelize and SendGrid so no real DB or network
 * calls are made during CI.
 */

// ─── Mock Sequelize model BEFORE requiring the controller ────────────────────
jest.mock('../models/email.model');

const Email = require('../models/email.model');
const { sendEmail } = require('../services/email.service');
const { processEmail } = require('../jobs/email.scheduler');

// ─── Mock SendGrid service ───────────────────────────────────────────────────
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a mock Email instance with an `update` spy. */
const makeMockEmail = (overrides = {}) => ({
  id: 1,
  to_email: 'test@example.com',
  subject: 'Hello',
  body: 'World',
  status: 'pending',
  retry_count: 0,
  error_message: null,
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Controller tests (via supertest)
// ─────────────────────────────────────────────────────────────────────────────

const request = require('supertest');
const app = require('../app');

describe('POST /emails', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 422 if required fields are missing', async () => {
    const res = await request(app).post('/emails').send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 if to_email is invalid', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app).post('/emails').send({
      to_email: 'not-an-email',
      subject: 'Test',
      body: 'Hello',
      scheduled_time: futureDate,
    });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'to_email' }),
      ])
    );
  });

  it('returns 422 if scheduled_time is in the past', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app).post('/emails').send({
      to_email: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      scheduled_time: pastDate,
    });
    expect(res.status).toBe(422);
  });

  it('creates an email and returns 201', async () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const mockRecord = makeMockEmail({ scheduled_time: futureDate });
    Email.create.mockResolvedValue(mockRecord);

    const res = await request(app).post('/emails').send({
      to_email: 'user@example.com',
      subject: 'Hello',
      body: 'World',
      scheduled_time: futureDate,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Email.create).toHaveBeenCalledTimes(1);
  });
});

describe('GET /emails', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns a paginated list of emails', async () => {
    Email.findAndCountAll.mockResolvedValue({ count: 1, rows: [makeMockEmail()] });
    const res = await request(app).get('/emails');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });
});

describe('GET /emails/failed', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns failed and stuck-pending emails', async () => {
    Email.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [makeMockEmail({ status: 'failed', error_message: 'timeout' })],
    });

    const res = await request(app).get('/emails/failed');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /emails/:id', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 404 if email not found', async () => {
    Email.findByPk.mockResolvedValue(null);
    const res = await request(app).get('/emails/999');
    expect(res.status).toBe(404);
  });

  it('returns the email if found', async () => {
    Email.findByPk.mockResolvedValue(makeMockEmail());
    const res = await request(app).get('/emails/1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });
});

describe('PUT /emails/:id', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 404 if email not found', async () => {
    Email.findByPk.mockResolvedValue(null);
    const res = await request(app).put('/emails/999').send({ subject: 'New' });
    expect(res.status).toBe(404);
  });

  it('returns 409 if email is already sent', async () => {
    Email.findByPk.mockResolvedValue(makeMockEmail({ status: 'sent' }));
    const res = await request(app).put('/emails/1').send({ subject: 'New' });
    expect(res.status).toBe(409);
  });

  it('updates a pending email', async () => {
    const mock = makeMockEmail();
    Email.findByPk.mockResolvedValue(mock);
    const res = await request(app)
      .put('/emails/1')
      .send({ subject: 'Updated Subject' });
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Updated Subject' })
    );
  });
});

describe('DELETE /emails/:id', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 404 if email not found', async () => {
    Email.findByPk.mockResolvedValue(null);
    const res = await request(app).delete('/emails/999');
    expect(res.status).toBe(404);
  });

  it('deletes the email and returns 200', async () => {
    const mock = { ...makeMockEmail(), destroy: jest.fn().mockResolvedValue(true) };
    Email.findByPk.mockResolvedValue(mock);
    const res = await request(app).delete('/emails/1');
    expect(res.status).toBe(200);
    expect(mock.destroy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('processEmail (scheduler)', () => {
  afterEach(() => jest.clearAllMocks());

  it('marks email as sent on success', async () => {
    sendEmail.mockResolvedValueOnce();
    const email = makeMockEmail();

    await processEmail(email);

    expect(sendEmail).toHaveBeenCalledWith({
      to: email.to_email,
      subject: email.subject,
      body: email.body,
    });
    expect(email.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', error_message: null })
    );
  });

  it('increments retry_count on failure (under max retries)', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP timeout'));
    const email = makeMockEmail({ retry_count: 0 });

    await processEmail(email);

    const updateArg = email.update.mock.calls[0][0];
    expect(updateArg.retry_count).toBe(1);
    // Status must NOT be set to 'failed' — email should stay pending for retry
    expect(updateArg.status).not.toBe('failed');
    expect(updateArg.status).not.toBe('sent');
  });

  it('marks email as failed after max retries', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SendGrid error'));
    // retry_count is already at MAX-1 (2), so next attempt = 3 = MAX
    const email = makeMockEmail({ retry_count: 2 });

    await processEmail(email);

    expect(email.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });
});
