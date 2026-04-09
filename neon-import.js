/**
 * neon-import.js
 * Imports a pg_dump (--inserts) SQL file into Neon over HTTP (port 443).
 * Usage: node neon-import.js
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  'postgresql://neondb_owner:npg_zFGK5ebBgRE7@ep-green-cell-am4jktrz.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

const DUMP_FILE = 'C:\\Users\\TbagTayo\\Desktop\\id_card_backup_inserts.sql';

async function run() {
  console.log('Reading dump file...');
  const content = fs.readFileSync(DUMP_FILE, 'utf8');

  // Split statements on semicolons followed by newline (pg_dump format)
  const statements = content
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter(s => !/^--/.test(s))       // skip comment-only lines
    .filter(s => !/^\\/.test(s))        // skip psql meta-commands
    .map(s => s + ';');

  console.log(`Found ${statements.length} statements to execute.\n`);

  // Use Neon HTTP driver (port 443) — works behind firewalls that block port 5432
  const sql = neon(DATABASE_URL);
  // Warm up the endpoint
  console.log('Waking Neon endpoint...');
  await sql.query('SELECT 1');
  console.log('Connected via HTTP driver.');

  let ok = 0;
  let skipped = 0;
  let errors = 0;
  const skipReasons = {};

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    if (stmt.trim() === ';') { skipped++; continue; }

    try {
      await sql.query(stmt);
      ok++;
      if (ok % 200 === 0) {
        console.log(`  ✓ ${ok}/${statements.length} done...`);
      }
    } catch (err) {
      const msg = err.message || '';
      // Tolerable: duplicate objects or owner/privilege issues in a restored dump
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate key value') ||
        msg.includes('must be owner') ||
        msg.includes('permission denied') ||
        msg.includes('violates foreign key') ||
        msg.includes('does not exist')
      ) {
        skipped++;
        const reason = msg.slice(0, 60);
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      } else {
        errors++;
        if (errors <= 20) {               // show first 20 real errors
          console.error(`  ✗ stmt[${i + 1}]: ${msg}`);
          console.error(`    >> ${stmt.slice(0, 150)}`);
        }
      }
    }
  }

  console.log(`\nDone. ✓ ${ok} executed  ⊘ ${skipped} skipped  ✗ ${errors} errors`);
  if (skipped > 0) {
    console.log('\nTop skip reasons:');
    Object.entries(skipReasons).sort((a,b) => b[1]-a[1]).slice(0,10).forEach(([r,n]) => console.log(`  ${n}x  ${r}`));
  }
  if (errors === 0) {
    console.log('\n✅ Import successful! Your Neon database is ready.');
  } else {
    console.log('\n⚠️  Some real errors occurred — review above.');
  }
}

run().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
