import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import tar from 'tar';

const node13TarUrl = 'https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.0.3.tgz';
const electron11BinaryUrl = 'https://github.com/WiseLibs/better-sqlite3/releases/download/v11.8.1/better-sqlite3-v11.8.1-electron-v132-win32-x64.tar.gz';

function download(fileUrl, dest, cb) {
  https.get(fileUrl, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      download(res.headers.location, dest, cb);
      return;
    }
    const fileStream = fs.createWriteStream(dest);
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close(cb);
    });
  }).on('error', err => {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    console.error('Download error:', err);
  });
}

console.log('1. Downloading better-sqlite3@13.0.3 JS package...');
const destSrc = path.resolve('better-sqlite3-src-13.tgz');
const targetDir = path.resolve('node_modules/better-sqlite3');
const prebuildsDir = path.join(targetDir, 'prebuilds');
const releaseDir = path.join(targetDir, 'build/Release');

download(node13TarUrl, destSrc, () => {
  console.log('Extracting better-sqlite3@13.0.3 JS into node_modules/better-sqlite3...');
  const tempExtract = path.resolve('node_modules/better-sqlite3-temp');
  fs.mkdirSync(tempExtract, { recursive: true });
  tar.extract({
    file: destSrc,
    cwd: tempExtract,
    sync: true,
  });

  const pkgDir = path.join(tempExtract, 'package');
  fs.cpSync(pkgDir, targetDir, { recursive: true, force: true });
  fs.rmSync(tempExtract, { recursive: true, force: true });
  if (fs.existsSync(destSrc)) fs.unlinkSync(destSrc);

  // Save Node prebuild
  fs.mkdirSync(prebuildsDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.copyFileSync(
    path.join(prebuildsDir, 'win32-x64.node'),
    path.join(prebuildsDir, 'win32-x64-node.node'),
  );
  fs.copyFileSync(
    path.join(prebuildsDir, 'win32-x64.node'),
    path.join(releaseDir, 'better_sqlite3.node'),
  );

  console.log('2. Downloading Electron 34 binary (better-sqlite3 v11.8.1)...');
  const destElectron11 = path.resolve('electron-11.tar.gz');
  download(electron11BinaryUrl, destElectron11, () => {
    const tempElectron = path.resolve('temp-electron');
    fs.mkdirSync(tempElectron, { recursive: true });
    tar.extract({
      file: destElectron11,
      cwd: tempElectron,
      sync: true,
    });

    const electronBinary = path.join(tempElectron, 'build/Release/better_sqlite3.node');
    fs.copyFileSync(electronBinary, path.join(prebuildsDir, 'win32-x64-electron.node'));
    fs.rmSync(tempElectron, { recursive: true, force: true });
    if (fs.existsSync(destElectron11)) fs.unlinkSync(destElectron11);

    // Create universal bindings resolver
    const bindingsDir = path.resolve('node_modules/bindings');
    fs.mkdirSync(bindingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(bindingsDir, 'package.json'),
      JSON.stringify({ name: 'bindings', version: '1.5.0', main: 'index.js' }),
    );

    const bindingsCode = `
const path = require('node:path');
const fs = require('node:fs');

module.exports = function(opts) {
  const isElectron = Boolean(process.versions && process.versions.electron);
  const candidates = isElectron
    ? [
        path.resolve(__dirname, '../better-sqlite3/prebuilds/win32-x64-electron.node'),
        path.resolve(__dirname, '../better-sqlite3/build/Release/better_sqlite3.node'),
      ]
    : [
        path.resolve(__dirname, '../better-sqlite3/prebuilds/win32-x64-node.node'),
        path.resolve(__dirname, '../better-sqlite3/build/Release/better_sqlite3.node'),
      ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return require(c);
      } catch (err) {
        // try next candidate
      }
    }
  }
  return require(candidates[0]);
};
`;
    fs.writeFileSync(path.join(bindingsDir, 'index.js'), bindingsCode, 'utf8');

    // Patch database.js in 13.0.3 for dual v11/v13 compatibility
    const dbJsPath = path.join(targetDir, 'lib/database.js');
    let dbJs = fs.readFileSync(dbJsPath, 'utf8');
    dbJs = dbJs.replace(
      /addon\.initialize\(.*?\);/,
      'if (typeof addon.initialize === "function") { addon.initialize(SqliteError, arrayFactory, arrayAppender, rowFactory, recordFactory); }',
    );
    dbJs = dbJs.replace(
      /\[util\.cppdb\]:\s*\{\s*value:\s*new addon\.Database\(/,
      '[util.cppdb]: { value: new (addon.Database || addon)(',
    );
    fs.writeFileSync(dbJsPath, dbJs, 'utf8');

    // Patch pragma.js for dual v11/v13 signatures
    const pragmaJsPath = path.join(targetDir, 'lib/methods/pragma.js');
    let pragmaJs = fs.readFileSync(pragmaJsPath, 'utf8');
    pragmaJs = pragmaJs.replace(
      /return this\[util\.cppdb\]\.pragma\(source, simple, false, false\);/,
      `try {
		return this[util.cppdb].pragma(source, simple, false, false);
	} catch {
		return this[util.cppdb].pragma(source, simple);
	}`,
    );
    fs.writeFileSync(pragmaJsPath, pragmaJs, 'utf8');

    console.log('Dual Node 24 and Electron 34 SQLite integration complete!');
  });
});
