# 📧 Email Scheduling API

A production-ready REST API for scheduling and delivering emails, built with **Node.js + Express**, **MySQL (Sequelize ORM)**, **SendGrid**, and **node-cron**.

---

## 📁 Project Structure

```
email-scheduler/
├── config/
│   └── db.js                  # Sequelize connection + connectDB()
├── controllers/
│   └── email.controller.js    # Route handlers (CRUD + failed list)
├── jobs/
│   └── email.scheduler.js     # node-cron scheduler + retry logic
├── models/
│   └── email.model.js         # Sequelize Email model + schema
├── routes/
│   └── email.routes.js        # Express router + validation rules
├── services/
│   └── email.service.js       # SendGrid wrapper (sendEmail)
├── tests/
│   └── email.test.js          # Jest unit + integration tests
├── app.js                     # Express app setup + error handling
├── server.js                  # Entry point: DB sync + scheduler + HTTP
├── .env.example               # Environment variable template
├── .eslintrc.json             # ESLint config
└── package.json
```

---

## ⚙️ Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.x |
| MySQL | ≥ 8.0 |
| SendGrid account | Free tier works |

---

## 🚀 Setup & Running

### 1. Clone / extract and install dependencies

```bash
cd email-scheduler
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=email_scheduler

SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=no-reply@yourdomain.com

CRON_SCHEDULE=* * * * *
MAX_RETRY_ATTEMPTS=3
```

### 3. Create the MySQL database

```sql
CREATE DATABASE IF NOT EXISTS email_scheduler
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

> The `emails` table is **auto-created** by Sequelize on first startup via `sequelize.sync({ alter: true })`. You do not need to run any SQL migration manually.

### 4. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Expected output:
```
✅ MySQL connected successfully via Sequelize.
✅ Database schema synchronised.
🕐 Email scheduler started. Running on schedule: "* * * * *"

🚀 Email Scheduler API running on http://localhost:3000
   Health check: http://localhost:3000
   Environment: development
```

---

## 📋 API Reference

### Base URL
```
http://localhost:3000
```

---

### `POST /emails` — Schedule a new email

**Request body:**
```json
{
  "to_email": "rupesh@mailinator.com",
  "subject": "Welcome!",
  "body": "Hi there, welcome to platform. Your mail scheduled.",
  "scheduled_time": "2026-03-22 11:34:00"
}``

**201 Created:**
```json
{
    "success": true,
    "message": "Email scheduled successfully.",
    "data": {
        "error_message": null,
        "retry_count": 0,
        "id": 1,
        "to_email": "rupesh@mailinator.com",
        "subject": "Welcome!",
        "body": "Hi there, welcome to platform. Your mail scheduled.",
        "scheduled_time": "2026-03-22T06:04:00.000Z",
        "status": "pending",
        "updated_at": "2026-03-22T06:03:40.580Z",
        "created_at": "2026-03-22T06:03:40.580Z"
    }
}
---

### `GET /emails` — List all emails

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Results per page (max 100) |
| status | string | — | Filter: `pending`, `sent`, `failed` |

**Example:**
```
GET /emails?status=pending&page=1&limit=10
```

**200 OK:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### `GET /emails/failed` — List failed / unsent emails

Returns emails with `status = 'failed'` **or** `status = 'pending'` where `scheduled_time` is in the past (stuck emails).

```
GET /emails/failed
```

---

### `GET /emails/:id` — Get email by ID

```
GET /emails/1
```

**404** if not found.

---

### `PUT /emails/:id` — Update / reschedule an email

Only `pending` emails can be updated. Returns **409** if the email is already `sent` or `failed`.

**Request body (all fields optional):**
```json
{
  "subject": "Updated subject",
  "scheduled_time": "2025-12-31T14:00:00.000Z"
}
```

---

### `DELETE /emails/:id` — Delete an email

```
DELETE /emails/1
```

**200 OK:**
```json
{
  "success": true,
  "message": "Email 1 deleted successfully."
}
```

---

### `GET /health` — Health check

```json
{
  "status": "ok",
  "timestamp": "2025-06-01T12:00:00.000Z",
  "service": "email-scheduler-api"
}
```

---

## 🌀 Scheduler Behaviour

The cron job runs every minute (configurable via `CRON_SCHEDULE`).

**On each tick:**
1. Queries: `WHERE status = 'pending' AND scheduled_time <= NOW() AND retry_count < MAX_RETRY_ATTEMPTS`
2. Sends each due email via SendGrid concurrently (`Promise.allSettled`)
3. **Success** → `status = 'sent'`, `error_message = null`
4. **Failure (retryable)** → `retry_count++`, stores error message, stays `pending`
5. **Failure (max retries reached)** → `status = 'failed'`, stores final error message

Default `MAX_RETRY_ATTEMPTS = 3`. Override via `.env`.

---

## 🧪 Running Tests

```bash
npm test

# With coverage report
npm run test:coverage
```

Tests use **Jest + supertest** and fully mock Sequelize and SendGrid — no real DB or network calls needed.

---

## 🔍 Linting

```bash
npm run lint
npm run lint:fix
```

---

## 📮 curl Examples

```bash
# Create a scheduled email (1 hour from now)
curl -X POST http://localhost:3000/emails \
  -H "Content-Type: application/json" \
  -d '{
    "to_email": "user@example.com",
    "subject": "Your order is confirmed",
    "body": "Thanks for your purchase!",
    "scheduled_time": "2025-12-31T10:00:00.000Z"
  }'

# List all pending emails
curl "http://localhost:3000/emails?status=pending"

# Get all failed/unsent emails
curl http://localhost:3000/emails/failed

# Get a specific email
curl http://localhost:3000/emails/1

# Reschedule an email
curl -X PUT http://localhost:3000/emails/1 \
  -H "Content-Type: application/json" \
  -d '{"scheduled_time": "2025-12-31T18:00:00.000Z"}'

# Delete an email
curl -X DELETE http://localhost:3000/emails/1
```

---

## 🗄️ Database Schema

The `emails` table is created automatically by Sequelize:

| Column | Type | Notes |
|--------|------|-------|
| id | INT UNSIGNED | PK, auto-increment |
| to_email | VARCHAR(255) | Recipient address |
| subject | VARCHAR(500) | |
| body | TEXT | |
| scheduled_time | DATETIME | When to send |
| status | ENUM | `pending` / `sent` / `failed` |
| error_message | TEXT | NULL on success |
| retry_count | TINYINT UNSIGNED | Max 3 by default |
| created_at | DATETIME | Auto-managed |
| updated_at | DATETIME | Auto-managed |

**Index:** `(status, scheduled_time)` — speeds up the scheduler query.

---

## 📌 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | HTTP port (default 3000) |
| DB_HOST | Yes | MySQL host |
| DB_PORT | No | MySQL port (default 3306) |
| DB_USER | Yes | MySQL user |
| DB_PASSWORD | Yes | MySQL password |
| DB_NAME | Yes | MySQL database name |
| SENDGRID_API_KEY | Yes | SendGrid API key |
| EMAIL_FROM | Yes | Sender address (verified in SendGrid) |
| CRON_SCHEDULE | No | Cron expression (default `* * * * *`) |
| MAX_RETRY_ATTEMPTS | No | Max send attempts before failing (default 3) |
