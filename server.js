'use strict';

require('dotenv').config();

const app = require('./app');
const { connectDB, sequelize } = require('./config/db');
const { startScheduler } = require('./jobs/email.scheduler');

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Bootstrap the application:
 * 1. Connect to MySQL
 * 2. Sync Sequelize models (creates tables if they don't exist)
 * 3. Start the cron scheduler
 * 4. Start the HTTP server
 */
const bootstrap = async () => {
  try {
    // 1. Test DB connection
    await connectDB();

    // 2. Sync all models to the database.
    //    { alter: true } updates existing columns without dropping data.
    //    Use { force: true } only during initial dev to drop & recreate tables.
    await sequelize.sync({ alter: true });
    console.log('✅ Database schema synchronised.');

    // 3. Start background email scheduler
    startScheduler();

    // 4. Start HTTP server
    app.listen(PORT, () => {
      console.log(`\n🚀 Email Scheduler API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start application:', error.message);
    process.exit(1);
  }
};

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await sequelize.close();
    console.log('✅ MySQL connection closed.');
  } catch (err) {
    console.error('Error closing DB:', err.message);
  }
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

bootstrap();
