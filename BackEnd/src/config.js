'use strict';
const path = require('path');

// The .env file sits one level above BackEnd (local) and backend (server).
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4200,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  // BTN's catalog database: a read-only login, and a login that can change
  // only the four barn contact columns.
  barnsDatabaseUrl: process.env.BARNS_DATABASE_URL || '',
  barnsWriteDatabaseUrl: process.env.BARNS_WRITE_DATABASE_URL || '',
  // BTN's pick lists and zip codes (breeds, programs, vaccine products, auction
  // markets, EPD traits): read, plus adding new vaccine products and auctions.
  refDatabaseUrl: process.env.REF_DATABASE_URL || '',
};

module.exports = config;
