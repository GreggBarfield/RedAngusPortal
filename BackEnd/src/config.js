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
  // Photos go in BTN's S3 bucket, under listings/raa/ only. Attachments are
  // saved in a folder on the BTN server.
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  s3Bucket: process.env.S3_BUCKET_NAME || '',
  s3BaseUrl: (process.env.S3_BASE_URL || '').replace(/\/+$/, ''),
  attachDir: process.env.ATTACH_DIR || '',
};

module.exports = config;
