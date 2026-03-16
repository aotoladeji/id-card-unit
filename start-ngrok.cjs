/**
 * start-ngrok.js
 * Starts an ngrok tunnel on port 3001, then automatically updates
 * backend/.env FRONTEND_URL with the new public URL.
 *
 * Usage: node start-ngrok.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ENV_FILE = path.join(__dirname, 'backend', '.env');
const NGROK_API = 'http://localhost:4040/api/tunnels';
const PORT = 3001;

function fetchNgrokUrl() {
  return new Promise((resolve, reject) => {
    http.get(NGROK_API, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnel = json.tunnels.find(t => t.proto === 'https');
          if (tunnel) resolve(tunnel.public_url);
          else reject(new Error('No HTTPS tunnel found'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function updateEnv(newUrl) {
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  if (content.includes('FRONTEND_URL=')) {
    content = content.replace(/FRONTEND_URL=.*/g, `FRONTEND_URL=${newUrl}`);
  } else {
    content += `\nFRONTEND_URL=${newUrl}`;
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

async function waitForNgrok(retries = 20, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const url = await fetchNgrokUrl();
      return url;
    } catch {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('ngrok did not start in time');
}

async function main() {
  console.log('Starting ngrok tunnel on port', PORT, '...');

  const ngrokBin = process.platform === 'win32'
    ? 'C:\\Users\\TbagTayo\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\\ngrok.exe'
    : 'ngrok';

  const ngrok = spawn(ngrokBin, ['http', String(PORT)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  ngrok.unref();

  try {
    const publicUrl = await waitForNgrok();
    updateEnv(publicUrl);

    console.log('\n==============================');
    console.log('  ngrok tunnel active!');
    console.log('  Public URL:', publicUrl);
    console.log('  FRONTEND_URL in .env updated.');
    console.log('==============================');
    console.log('\nNext steps:');
    console.log('  1. Restart the backend:  cd backend && node server.js');
    console.log('  2. Start the frontend:   npm run dev  (in root folder)');
    console.log('  3. Send emails — links will now be accessible from anywhere.');
    console.log('\nNOTE: This URL changes every time you restart ngrok.');
    console.log('      Re-run this script and resend emails when that happens.\n');
  } catch (err) {
    console.error('\nERROR:', err.message);
    console.error('Make sure you have authenticated ngrok:');
    console.error('  ngrok config add-authtoken <YOUR_TOKEN>');
    console.error('Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken\n');
    process.exit(1);
  }
}

main();
