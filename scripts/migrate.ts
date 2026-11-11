// Applies SQL migrations in order and syncs reference data (roles, permissions, zones, defaults).
// Usage: tsx scripts/migrate.ts [--reset]      (DATABASE_URL from the environment or .env.local)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { ROLES, ZONES } from '../src/lib/enums';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_SCOPE } from '../src/lib/permissions';

export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
}

const REGULATORY_SOURCES: Array<[string, string, string, string]> = [
  ['Maharashtra Lifts, Escalators and Moving Walks Act, 2017 and amendments', 'Government of Maharashtra', 'Maharashtra', 'Lift contractor licensing, erection permission, inspection, working licence'],
  ['Maharashtra Lifts, Escalators and Moving Walks Rules, 2026 (original Gazette notification)', 'Government of Maharashtra', 'Maharashtra', 'Procedural rules, forms, maintenance, insurance, incident reporting'],
  ['Maharashtra lift department circulars, forms and licensing requirements', 'Chief Electrical Inspector / lift department, Maharashtra', 'Maharashtra', 'Operational forms and circulars'],
  ['RBI Digital Lending Directions, 2025 and subsequent updates', 'Reserve Bank of India', 'India', 'Finance referral / lending service provider classification'],
  ['RBI requirements for regulated entities and their lending service providers', 'Reserve Bank of India', 'India', 'Outsourcing and LSP obligations'],
  ['Digital Personal Data Protection Act, 2023 and applicable rules', 'Government of India (MeitY)', 'India', 'Consent, notice, retention, data principal rights'],
  ['Consumer Protection Act, 2019 and E-Commerce Rules', 'Government of India', 'India', 'Marketplace disclosures and grievance handling'],
  ['GST, TDS and invoicing requirements (as advised by AIEC CA)', 'CBIC / Income Tax Department', 'India', 'Commission invoicing and tax treatment'],
  ['Applicable BIS and technical standards for the specific lift type', 'Bureau of Indian Standards', 'India', 'Technical design and safety standards'],
  ['State-specific lift laws before expansion beyond Maharashtra', 'Respective State Governments', 'Other states', 'Expansion gating'],
];

export async function migrate(connectionString: string, opts: { reset?: boolean; quiet?: boolean } = {}): Promise<void> {
  const log = (msg: string) => { if (!opts.quiet) console.log(msg); };
  const client = new Client({ connectionString, ssl: /sslmode=require|supabase\.(co|com)/.test(connectionString) ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    if (opts.reset) {
      await client.query('drop schema if exists app cascade; drop schema public cascade; create schema public;');
      log('schema reset');
    }
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const dir = join(process.cwd(), 'db', 'migrations');
    const applied = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (applied.has(file)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        log(`applied ${file}`);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${(error as Error).message}`);
      }
    }

    // ── reference data (idempotent) ──
    await client.query('begin');
    for (const role of ROLES) {
      await client.query('insert into roles (code, scope) values ($1, $2) on conflict (code) do nothing', [role, ROLE_SCOPE[role]]);
    }
    const existing = new Set((await client.query('select code from permissions')).rows.map((r) => r.code));
    for (const permission of PERMISSIONS) {
      if (existing.has(permission)) continue; // keep later revocations made by the Super Admin
      await client.query('insert into permissions (code) values ($1)', [permission]);
      for (const role of ROLES) {
        if (DEFAULT_ROLE_PERMISSIONS[role].includes(permission)) {
          await client.query('insert into role_permissions (role_code, permission_code) values ($1, $2) on conflict do nothing', [role, permission]);
        }
      }
    }
    for (const zone of ZONES) {
      await client.query('insert into zones (code, city) values ($1, $2) on conflict (code) do nothing', [zone, zone === 'PUNE' ? 'Pune' : 'Pune / PCMC']);
    }
    await client.query(
      `insert into matching_rule_versions (version, w_compliance, w_capability, w_capacity, w_performance, w_price, w_response, is_active)
       select 1, 25, 20, 20, 15, 10, 10, true where not exists (select 1 from matching_rule_versions)`,
    );
    await client.query(
      `insert into commission_policies (version, rate_percent, description, effective_from, is_active)
       select 1, 2.0, 'Pilot rate: 2% of net eligible order value on verified partner collections. Subject to the signed Partner Agreement.', current_date, true
        where not exists (select 1 from commission_policies)`,
    );
    if ((await client.query('select 1 from regulatory_sources limit 1')).rowCount === 0) {
      for (const [title, authority, geography, applicability] of REGULATORY_SOURCES) {
        await client.query('insert into regulatory_sources (title, authority, geography, applicability) values ($1, $2, $3, $4)', [title, authority, geography, applicability]);
      }
      // Default document gates are configuration, flagged for legal verification - not hard-coded law.
      await client.query(
        `insert into compliance_requirements (gate, doc_type, note, source_id)
         select g.gate, g.doc_type, 'Default pilot configuration. Verify against the official Gazette before go-live.',
                (select id from regulatory_sources order by created_at, title limit 1)
           from (values ('PROJECT_START','ERECTION_PERMISSION'), ('PROJECT_START','APPROVED_DRAWINGS'),
                        ('HANDOVER','INSPECTION_REPORT'), ('HANDOVER','WORKING_LICENCE')) as g(gate, doc_type)
         on conflict do nothing`,
      );
    }
    await client.query('commit');
    log('reference data synced');
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
  migrate(url, { reset: process.argv.includes('--reset') }).catch((error) => { console.error(error.message); process.exit(1); });
}
