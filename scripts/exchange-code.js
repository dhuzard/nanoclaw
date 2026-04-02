#!/usr/bin/env node
/**
 * Exchange OAuth code for refresh token
 * Usage: node exchange-code.js <authorization_code>
 *
 * Reads client_id and client_secret from ~/.config/nanoclaw/tasks-oauth.json
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const code = process.argv[2];
if (!code) {
  console.error('Usage: node exchange-code.js <authorization_code>');
  process.exit(1);
}

const oauthFile = path.join(os.homedir(), '.config', 'nanoclaw', 'tasks-oauth.json');
if (!fs.existsSync(oauthFile)) {
  console.error(`OAuth config not found at ${oauthFile}`);
  process.exit(1);
}

const { installed } = JSON.parse(fs.readFileSync(oauthFile, 'utf-8'));
const { client_id, client_secret } = installed;

if (!client_id || !client_secret) {
  console.error('Missing client_id or client_secret in tasks-oauth.json');
  process.exit(1);
}

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri: 'http://localhost:8080/callback',
    grant_type: 'authorization_code',
  }).toString(),
});

const data = await res.json();

if (!res.ok) {
  console.error('❌ Token exchange failed:', data);
  process.exit(1);
}

const creds = {
  client_id,
  client_secret,
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expiry_date: Date.now() + data.expires_in * 1000,
};

console.log('\nSave this to ~/.config/nanoclaw/tasks-credentials.json:\n');
console.log(JSON.stringify(creds, null, 2));

