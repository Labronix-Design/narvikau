/**
 * Cleanup test/director orders and customers.
 * Keeps ALL leads.
 *
 * Run: netlify dev:exec node netlify/assets/cleanup-test-data.mjs
 */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

async function cleanup() {
  console.log('Starting test data cleanup...\n');

  // Find matching customers (table uses first_name + last_name + email)
  const customers = await sql`
    SELECT id, first_name, last_name, email FROM customers
    WHERE first_name ILIKE '%hanno%'
       OR last_name  ILIKE '%labuschagne%'
       OR email      ILIKE '%labronix%'
  `;

  if (customers.length === 0) {
    console.log('No test customers found — nothing to delete.');
    return;
  }

  console.log(`Found ${customers.length} test customer(s):`);
  customers.forEach(c => console.log(`  [${c.id}] ${c.first_name} ${c.last_name} <${c.email}>`));

  const customerIds = customers.map(c => c.id);

  // Get orders for those customers
  const orders = await sql`
    SELECT id FROM orders WHERE customer_id = ANY(${customerIds})
  `;
  const orderIds = orders.map(o => o.id);
  console.log(`\nFound ${orderIds.length} test order(s)${orderIds.length ? ': ' + orderIds.join(', ') : ''}`);

  if (orderIds.length > 0) {
    // Delete audit logs first (foreign key constraint)
    const auditResult = await sql`
      DELETE FROM order_audit_log
      WHERE order_id = ANY(${orderIds})
      RETURNING id
    `;
    console.log(`  Deleted ${auditResult.length} audit log entries`);

    // Delete orders
    const ordersResult = await sql`
      DELETE FROM orders
      WHERE id = ANY(${orderIds})
      RETURNING id
    `;
    console.log(`  Deleted ${ordersResult.length} orders`);
  }

  // Delete customers
  const custResult = await sql`
    DELETE FROM customers
    WHERE first_name ILIKE '%hanno%'
       OR last_name  ILIKE '%labuschagne%'
       OR email      ILIKE '%labronix%'
    RETURNING id, first_name, last_name, email
  `;
  console.log(`\nDeleted ${custResult.length} customer(s):`);
  custResult.forEach(c => console.log(`  [${c.id}] ${c.first_name} ${c.last_name} <${c.email}>`));

  console.log('\nLeads table was NOT touched.');
  console.log('Cleanup complete.');
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
