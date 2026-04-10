const fs = require('fs');
const path = require('path');
const https = require('https');

const repo = 'w08119737-prog/d4ctrans2';
const branch = 'main';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers: { 'User-Agent': 'Node.js' }, ...options }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(request(res.headers.location, options));
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buffer);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    console.log('Fetching tree...');
    const treeData = await request(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`);
    const tree = JSON.parse(treeData.toString()).tree;
    
    console.log('Cleaning directory...');
    const files = fs.readdirSync('.');
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === '.env' || file === 'fetch_repo.js') continue;
      fs.rmSync(file, { recursive: true, force: true });
    }
    
    console.log('Downloading files...');
    for (const item of tree) {
      if (item.type === 'tree') {
        fs.mkdirSync(item.path, { recursive: true });
      } else if (item.type === 'blob') {
        const dir = path.dirname(item.path);
        if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
        const content = await request(`https://raw.githubusercontent.com/${repo}/${branch}/${item.path}`);
        fs.writeFileSync(item.path, content);
        console.log(`Wrote ${item.path}`);
      }
    }
    console.log('Done!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
