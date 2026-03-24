#!/usr/bin/env node
/**
 * Setup database schema for Reality Monitor.
 *
 * Usage:
 *   node scripts/setup-db.mjs <database-password>
 *
 * The database password is found in:
 *   Supabase Dashboard → Settings → Database → Connection string → Password
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/setup-db.mjs <database-password>');
  console.error('');
  console.error('Find the password at: Supabase Dashboard → Settings → Database');
  process.exit(1);
}

const REF = 'fwwkxhuefeachqauwvjp';

async function main() {
  const client = new pg.Client({
    host: `db.${REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log('Connecting to Supabase database...');
    await client.connect();
    console.log('Connected!');

    const schema = readFileSync(schemaPath, 'utf-8');
    console.log('Executing schema.sql...');
    await client.query(schema);
    console.log('Schema applied successfully!');

    // Verify
    const result = await client.query("SELECT count(*) as cnt FROM properties");
    console.log(`Properties in database: ${result.rows[0].cnt}`);

    const alertsResult = await client.query("SELECT count(*) as cnt FROM alerts");
    console.log(`Alerts in database: ${alertsResult.rows[0].cnt}`);

    console.log('\nDone! Your Reality Monitor database is ready.');
  } catch (err) {
    console.error('Error:', err.message);

    // Try pooler connection as fallback
    if (err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      console.log('\nDirect connection failed. Trying pooler...');
      const poolerClient = new pg.Client({
        host: `aws-0-eu-central-1.pooler.supabase.com`,
        port: 5432,
        database: 'postgres',
        user: `postgres.${REF}`,
        password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      });
      try {
        await poolerClient.connect();
        const schema = readFileSync(schemaPath, 'utf-8');
        await poolerClient.query(schema);
        console.log('Schema applied via pooler!');
        await poolerClient.end();
      } catch (poolerErr) {
        console.error('Pooler also failed:', poolerErr.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main();
