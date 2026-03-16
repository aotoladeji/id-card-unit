/**
 * start-cloudflare.cjs
 * Starts a Cloudflare quick tunnel on port 3001 (frontend), then automatically
 * updates backend/.env FRONTEND_URL with the new public trycloudflare.com URL.
 *
 * No account or login required for quick tunnels.
 *
 * Usage: node start-cloudflare.cjs
 *    or: npm run cloudflare
 *
 * Prerequisites:
 *   Install cloudflared on Windows:
 *     winget install --id Cloudflare.cloudflared
 *   Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, 'backend', '.env');
const PORT = 3001;

function updateEnv(newUrl) {
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  if (content.includes('FRONTEND_URL=')) {
    content = content.replace(/FRONTEND_URL=.*/g, `FRONTEND_URL=${newUrl}`);
  } else {
    content += `\nFRONTEND_URL=${newUrl}`;
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
  console.log('  FRONTEND_URL in backend/.env updated.');
}

function extractTunnelUrl(text) {
  // cloudflared prints the URL in lines like:
  //   | https://something-something.trycloudflare.com |
  // or just:
  //   https://something-something.trycloudflare.com
  const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i);
  return match ? match[0] : null;
}

function main() {
  const cloudflaredBin = process.platform === 'win32'
    ? path.join(__dirname, 'cloudflared.exe')
    : 'cloudflared';

  console.log(`\nStarting Cloudflare Tunnel on port ${PORT}...`);
  console.log('(This may take a few seconds to connect)\n');

  const cf = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${PORT}`, '--protocol', 'http2'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let urlFound = false;

  function handleOutput(data) {
    const text = data.toString();

    // Print raw output for debugging (comment this out once working)
    process.stdout.write(text);

    if (!urlFound) {
      const url = extractTunnelUrl(text);
      if (url) {
        urlFound = true;

        updateEnv(url);

        console.log('\n==============================');
        console.log('  Cloudflare Tunnel active!');
        console.log('  Public URL:', url);
        console.log('==============================');
        console.log('\nNext steps:');
        console.log('  1. Restart the backend:  cd backend && node server.js');
        console.log('  2. Start the frontend:   npm run dev  (in root folder)');
        console.log('  3. Share the URL above — anyone can access your app.');
        console.log('\nNOTE: This URL changes every time you restart the tunnel.');
        console.log('      Re-run this script and restart the backend when that happens.\n');
      }
    }
  }

  cf.stdout.on('data', handleOutput);
  cf.stderr.on('data', handleOutput);

  cf.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('\nERROR: cloudflared is not installed or not found in PATH.');
      console.error('\nTo install on Windows, open a terminal and run:');
      console.error('  winget install --id Cloudflare.cloudflared');
      console.error('\nOr download the installer from:');
      console.error('  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
      console.error('\nAfter installing, close and reopen the terminal, then run this script again.\n');
    } else {
      console.error('\nERROR starting cloudflared:', err.message);
    }
    process.exit(1);
  });

  cf.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\ncloudflared exited with code ${code}`);
    }
  });

  // Keep the process alive (tunnel runs until Ctrl+C)
  process.on('SIGINT', () => {
    console.log('\nShutting down Cloudflare Tunnel...');
    cf.kill();
    process.exit(0);
  });
}

main();
