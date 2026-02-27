'use strict';

require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  serviceName: process.env.PDR_SERVICE_NAME || 'pdr-api',
  envName: process.env.PDR_ENV || 'api-dev',
  publicBaseUrl: (process.env.PDR_PUBLIC_BASEURL || '').trim(),
  apiVersion: process.env.PDR_API_VERSION || '0.1',
  buildSha: process.env.PDR_BUILD_SHA || '',
  runtime: process.env.PDR_RUNTIME || '',

  db: {
    host: required('DB_HOST'),
    user: required('DB_USER'),
    password: required('DB_PASS'),
    database: required('DB_NAME'),
    port: Number(process.env.DB_PORT || 3306)
  }
};

module.exports = { config };