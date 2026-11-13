// Finds translation keys used in the source and reports any that are missing from the English
// dictionary. Also used by the automated tests. Usage: tsx scripts/i18n-scan.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/i18n/messages/en';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !path.includes('/i18n/messages/') ? [path] : [];
  });
}
function has(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as object)) node = (node as Record<string, unknown>)[part]; else return false;
  }
  return node !== undefined;
}

export function scan(root = 'src') {
  const staticKeys = new Set<string>();
  const prefixes = new Set<string>();
  const errorCodes = new Set<string>();
  const notifications = new Set<string>();
  for (const file of files(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) staticKeys.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) prefixes.add(m[1]);
    for (const m of src.matchAll(/message:\s*(?:[a-z.]+\s*\?\s*)?'((?:m|common|auth|enquiry)\.[a-zA-Z0-9_.]+)'/g)) staticKeys.add(m[1]);
    for (const m of src.matchAll(/AppError\(\s*'([A-Z_]+)'/g)) errorCodes.add(m[1]);
    for (const m of src.matchAll(/(?:fail|throw new AppError)\(\s*(?:GATE_ERRORS\[[^\]]+\] \?\? )?'([A-Z_]+)'/g)) errorCodes.add(m[1]);
    for (const m of src.matchAll(/: '([A-Z_]{4,})'(?=[,}\n ])/g)) if (/fieldErrors|missing|GATE_ERRORS|= \{/.test(src)) void m;
    for (const m of src.matchAll(/notify(?:Users|Permission|Company|Customer)\(\s*tx,\s*[^,]+,\s*(?:[^,']*\?\s*)?'([A-Z_]+)'(?:\s*:\s*'([A-Z_]+)')?/g)) {
      notifications.add(m[1]);
      if (m[2]) notifications.add(m[2]);
    }
  }
  const missing = [
    ...[...staticKeys].filter((k) => !has(k)),
    ...[...errorCodes].filter((c) => !has(`err.${c}`)).map((c) => `err.${c}`),
    ...[...notifications].filter((n) => !has(`n.${n}`)).map((n) => `n.${n}`),
    ...[...prefixes].filter((p) => !has(p)).map((p) => `${p}.* (dynamic group)`),
  ].sort();
  return { missing, staticKeys, prefixes, errorCodes, notifications };
}

if (process.argv[1]?.endsWith('i18n-scan.ts')) {
  const { missing, staticKeys, prefixes } = scan();
  console.log(`${staticKeys.size} static keys, ${prefixes.size} dynamic groups, ${missing.length} missing`);
  console.log(missing.join('\n'));
  process.exit(missing.length ? 1 : 0);
}
