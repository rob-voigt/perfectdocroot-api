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

  // Optional now; useful for absolute links later (artifacts, docs, etc.)
  publicBaseUrl: process.env.PDR_PUBLIC_BASEURL || ''
};

// If you want to force base URL later, swap to:
// config.publicBaseUrl = required('PDR_PUBLIC_BASEURL');

module.exports = { config };
