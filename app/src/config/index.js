/*
Copyright 2026 Robert Scott Voigt

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
'use strict';;

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
