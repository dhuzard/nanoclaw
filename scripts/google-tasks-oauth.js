#!/usr/bin/env node
/**
 * Google Tasks OAuth Token Generator
 * Run this once to authenticate and save credentials to ~/.config/nanoclaw/tasks-credentials.json
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import { spawn } from 'child_process';

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.config', 'nanoclaw');
const OAUTH_FILE = path.join(CONFIG_DIR, 'tasks-oauth.json');
const CREDS_FILE = path.join(CONFIG_DIR, 'tasks-credentials.json');

// Read client ID and secret from the downloaded JSON
if (!fs.existsSync(OAUTH_FILE)) {
  console.error(
    `OAuth credentials file not found at ${OAUTH_FILE}.\n` +
    `Download from Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Desktop app`,
  );
  process.exit(1);
}

const oauthConfig = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf-8'));
const { client_id, client_secret, redirect_uris } = oauthConfig.installed || oauthConfig;

if (!client_id || !client_secret) {
  console.error('OAuth file missing client_id or client_secret');
  process.exit(1);
}

const redirectUri = redirect_uris?.[0] || 'http://localhost:3000/callback';
const port = parseInt(redirectUri.split(':').pop(), 10) || 3000;

const SCOPES = ['https://www.googleapis.com/auth/tasks'];
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', client_id);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline'); // Request refresh token

console.log(`\n📱 Opening browser for Google Tasks authorization...\n`);
console.log(`If the browser doesn't open, visit:\n  ${authUrl.toString()}\n`);

// Open the URL in the default browser
const openCommand = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
spawn(openCommand, [authUrl.toString()], { stdio: 'ignore' });

// Start a local server to receive the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://localhost:${port}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('No authorization code received');
    server.close();
    process.exit(1);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id,
        client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Save credentials
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(
      CREDS_FILE,
      JSON.stringify(
        {
          client_id,
          client_secret,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expiry_date: Date.now() + tokenData.expires_in * 1000,
        },
        null,
        2,
      ),
    );

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <h1>✅ Authorization successful!</h1>
          <p>Credentials saved to <code>${CREDS_FILE}</code></p>
          <p>You can close this window.</p>
          <script>window.close();</script>
        </body>
      </html>
    `);

    console.log(`\n✅ Credentials saved to ${CREDS_FILE}`);
    console.log('\nNext: Restart NanoClaw with `systemctl --user restart nanoclaw` or rebuild the container.\n');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Token exchange error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${err instanceof Error ? err.message : String(err)}`);
    server.close();
    process.exit(1);
  }
});

server.listen(port, () => {
  console.log(`🔗 Listening for callback on ${redirectUri}\n`);
});

server.on('error', (err) => {
  console.error(`Server error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
