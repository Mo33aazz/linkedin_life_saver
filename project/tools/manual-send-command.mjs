#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'logs', 'manual-last.json');
const indexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const commandsFile = indexJson.commandsFile;
if (!commandsFile) {
  console.error('commandsFile not found in logs/manual-last.json');
  process.exit(1);
}

const [, , cmdName, ...rest] = process.argv;
if (!cmdName) {
  console.error(
    'Usage: node tools/manual-send-command.mjs <cmd> [jsonPayload]'
  );
  process.exit(1);
}
let payload = {};
if (rest[0]) {
  try {
    payload = JSON.parse(rest[0]);
  } catch {
    console.error('Invalid JSON payload');
    process.exit(1);
  }
}
const line = JSON.stringify({ cmd: cmdName, ...payload });
fs.appendFileSync(commandsFile, line + '\n');
console.log('Sent:', line);
