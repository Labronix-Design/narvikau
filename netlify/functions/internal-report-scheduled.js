import { neon } from '@neondatabase/serverless';
import { persistScheduledReport } from './internal-report.js';

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'internal-report-scheduled', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'internal-report-scheduled', msg, ...d, ts: new Date().toISOString() })),
};

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

export function createHandler({ getSql = () => neon(databaseUrl()), env = process.env, now = () => new Date() } = {}) {
  return async () => {
    try {
      const result = await persistScheduledReport(getSql(), now(), env.REPORTING_TIME_ZONE || 'UTC');
      if (result.status === 'persisted') log.info('internal report snapshot persisted');
      return { statusCode: 202, body: JSON.stringify({ status: result.status, ...(result.explanation ? { explanation: result.explanation } : {}) }) };
    } catch (error) {
      log.error('internal report failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 500, body: JSON.stringify({ error: 'Unable to process internal report' }) };
    }
  };
}

export const handler = createHandler();
