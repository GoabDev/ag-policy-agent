import dotenv from 'dotenv';
import path from 'path';
import { Config } from '../types';

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return value;
}

export const config: Config = {
  // A&G Platform
  ag: {
    url: getEnv('AG_URL'),
    username: getEnv('AG_USERNAME'),
    password: getEnv('AG_PASSWORD'),
    sessionPath: path.resolve(__dirname, '../../storage/ag-session.json'),
  },

  // NIID
  niid: {
    url: getEnv('NIID_URL'),
    policyCorrectionUrl: getEnv('NIID_POLICY_CORRECTION_URL'),
    username: getEnv('NIID_USERNAME'),
    password: getEnv('NIID_PASSWORD'),
    sessionPath: path.resolve(__dirname, '../../storage/niid-session.json'),
  },

  // Server
  port: parseInt(getEnv('PORT', '3001'), 10),

  // Keep-alive interval in milliseconds
  keepAliveInterval: (parseInt(getEnv('KEEPALIVE_INTERVAL', '5'), 10)) * 60 * 1000,

  // Browser
  headless: getEnv('HEADLESS', 'true') === 'true',

  // Paths
  storagePath: path.resolve(__dirname, '../../storage'),
  logsPath: path.resolve(__dirname, '../../storage/logs'),
  dashboardPath: path.resolve(__dirname, '../../dashboard'),
};