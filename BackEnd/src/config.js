'use strict';
const path = require('path');

// The .env file sits one level above BackEnd (local) and backend (server).
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4200,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
};

module.exports = config;
