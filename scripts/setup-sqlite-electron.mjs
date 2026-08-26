import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import tar from 'tar';

const binaryUrl = 'https://github.com/WiseLibs/better-sqlite3/releases/download/v11.8.1/better-sqlite3-v11.8.1-electron-v132-win32-x64.tar.gz';
const destBinaryTar = path.resolve('better-sqlite3-electron.tar.gz');

const sourceUrl = 'https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-11.8.1.tgz';
const destSourceTar = path.resolve('better-sqlite3-src.tgz');

function download(fileUrl, dest) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve());
      });
    }).on('error', err => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log('1. Downloading better-sqlite3@11.8.1 JS package...');
  await download(sourceUrl, destSourceTar);

  console.log('Extracting better-sqlite3@11.8.1 into node_modules...');
  const extractDir = path.resolve('node_modules/better-sqlite3-temp');
  fs.mkdirSync(extractDir, { recursive: true });
  tar.extract({
    file: destSourceTar,
    cwd: extractDir,
    sync: true,
  });

  // Copy extracted package files into node_modules/better-sqlite3
  const pkgDir = path.join(extractDir, 'package');
  const targetDir = path.resolve('node_modules/better-sqlite3');
  fs.cpSync(pkgDir, targetDir, { recursive: true, force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
  if (fs.existsSync(destSourceTar)) fs.unlinkSync(destSourceTar);

  console.log('2. Downloading prebuilt Electron 34 native binary...');
  await download(binaryUrl, destBinaryTar);

  console.log('Extracting native binary...');
  tar.extract({
    file: destBinaryTar,
    cwd: targetDir,
    sync: true,
  });
  if (fs.existsSync(destBinaryTar)) fs.unlinkSync(destBinaryTar);

  console.log('Electron SQLite setup complete!');
}

main().catch(err => {
  console.error('Electron SQLite setup failed:', err);
  process.exit(1);
});
