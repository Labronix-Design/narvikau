import { neon } from '@neondatabase/serverless';
import { deliverMonthlyReport, monthlyPeriodFor } from './monthly-business-report.js';

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'monthly-business-report-scheduled', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'monthly-business-report-scheduled', msg, ...d, ts: new Date().toISOString() })),
};

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

export function isMonthlyReportScheduleTime(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal');
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.day === '1' && values.hour === '06' && values.minute === '00';
}

export function createHandler({ getSql = () => neon(databaseUrl()), env = process.env, now = () => new Date(), deliverMonthlyReport: deliver = deliverMonthlyReport } = {}) {
  return async () => {
    try {
      if (!isMonthlyReportScheduleTime(now())) return { statusCode: 202, body: JSON.stringify({ status: 'ignored' }) };
      const scheduledFor = now();
      const result = await deliver({ sql: getSql(), period: monthlyPeriodFor(scheduledFor, 'previous'), env });
      if (result.status === 'setup_required') return { statusCode: 503, body: JSON.stringify({ error: 'Monthly internal report delivery is not configured' }) };
      log.info('monthly internal report delivery completed', { status: result.status, periodStart: result.period.startDate, periodEnd: result.period.endDate });
      return { statusCode: 202, body: JSON.stringify({ status: result.status }) };
    } catch (error) {
      log.error('scheduled monthly report failed', { error: error instanceof Error ? error.message : 'unknown' });
      return { statusCode: 502, body: JSON.stringify({ error: 'Unable to send monthly internal report' }) };
    }
  };
}

export const handler = createHandler();
