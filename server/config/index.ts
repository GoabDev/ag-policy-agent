import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // A&G Platform
  ag: {
    url: process.env.AG_URL || 'https://your-ag-platform.com',
    username: process.env.AG_USERNAME || '',
    password: process.env.AG_PASSWORD || '',
    sessionPath: path.resolve(__dirname, '../../storage/ag-session.json'),
  },

  // NIID
  niid: {
    url: process.env.NIID_URL || 'https://niid.naicom.gov.ng',
    username: process.env.NIID_USERNAME || '',
    password: process.env.NIID_PASSWORD || '',
    sessionPath: path.resolve(__dirname, '../../storage/niid-session.json'),
  },

  // Server
  port: parseInt(process.env.PORT || '3001', 10),

  // Keep-alive interval in milliseconds
  keepAliveInterval: (parseInt(process.env.KEEPALIVE_INTERVAL || '5', 10)) * 60 * 1000,

  // Browser
  headless: process.env.HEADLESS === 'true',

  // Paths
  storagePath: path.resolve(__dirname, '../../storage'),
  logsPath: path.resolve(__dirname, '../../storage/logs'),
  dashboardPath: path.resolve(__dirname, '../../dashboard'),
};