'use strict';

const { Sequelize } = require('sequelize');
require('dotenv').config();

/**
 * Sequelize instance connected to MySQL.
 * Connection details are read from environment variables.
 */
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    dialect: 'mysql',
    timezone: '+05:30',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,       // Maximum number of connections
      min: 0,        // Minimum number of connections
      acquire: 30000, // Max ms to wait for connection before throwing error
      idle: 10000,   // Max ms a connection can be idle before being released
    },
    define: {
      // Use snake_case column names by default
      underscored: false,
      // Don't pluralize table names
      freezeTableName: true,
    },
  }
);

/**
 * Test the database connection.
 * Call this during application startup.
 */
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connected successfully via Sequelize.');
  } catch (error) {
    console.error('❌ Unable to connect to MySQL:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
