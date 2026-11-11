#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const configPath = 'wrangler.jsonc';
const databaseName = 'toolsmith-console';
const placeholder = '00000000000000000000000000000000';
function run(args) {
  const result = spawnSync('wrangler', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('wrangler ' + args.join(' ') + ' failed with exit code ' + result.status);
  return result.stdout.trim();
}
function parseList(output) {
  const parsed = JSON.parse(output);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.result)) return parsed.result;
  if (Array.isArray(parsed.databases)) return parsed.databases;
  throw new Error('Unexpected output from wrangler d1 list --json.');
}
const config = await readFile(configPath, 'utf8');
const nameMatch = config.match(/"database_name"\s*:\s*"([^"]+)"/);
const idMatch = config.match(/"database_id"\s*:\s*"([^"]+)"/);
if (!nameMatch || !idMatch) throw new Error('Could not find database_name/database_id in wrangler.jsonc.');
const configuredName = nameMatch[1];
const configuredId = idMatch[1];
if (configuredName !== databaseName) throw new Error('Expected D1 database_name "' + databaseName + '", found "' + configuredName + '".');
let databases = parseList(run(['d1', 'list', '--json']));
let existing = databases.find((db) => db.name === databaseName);
if (!existing && configuredId !== placeholder) {
  throw new Error('D1 "' + databaseName + '" was not found in the authenticated Cloudflare account, although wrangler.jsonc has a real database_id. Check the Wrangler account/profile; refusing to create a replacement database.');
}
if (!existing) {
  console.log('D1 "' + databaseName + '" not found; creating it...');
  run(['d1', 'create', databaseName, '--binding', 'DB', '--use-remote']);
  databases = parseList(run(['d1', 'list', '--json']));
  existing = databases.find((db) => db.name === databaseName);
  if (!existing) throw new Error('Created D1 "' + databaseName + '" but could not find it in the subsequent list.');
}
const remoteId = existing.uuid ?? existing.database_id ?? existing.databaseId ?? existing.id;
if (typeof remoteId !== 'string' || !remoteId) throw new Error('Could not determine the ID for D1 "' + databaseName + '" from Wrangler output.');
if (configuredId !== placeholder && configuredId !== remoteId) {
  throw new Error('Configured database_id (' + configuredId + ') does not match D1 "' + databaseName + '" in the authenticated account (' + remoteId + '). Refusing to overwrite the configured ID.');
}
if (configuredId === placeholder) {
  const updated = config.replace(/("database_id"\s*:\s*")[^"]+(")/, '$1' + remoteId + '$2');
  if (updated === config) throw new Error('Could not update database_id in wrangler.jsonc.');
  await writeFile(configPath, updated);
  console.log('Updated wrangler.jsonc with D1 ID ' + remoteId + '.');
} else {
  console.log('Using existing D1 "' + databaseName + '" (' + remoteId + ').');
}
