const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootPkg = require('../package.json');
const serverPkg = require('./package.json');
const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');

test('repo root start script launches the Express server', () => {
  assert.equal(rootPkg.scripts.start, 'npm --prefix server start');
  assert.equal(rootPkg.scripts.build, 'npm --prefix server install');
  assert.equal(rootPkg.scripts.postinstall, 'npm --prefix server install');
});

test('server package.json has Render start and build scripts', () => {
  assert.equal(serverPkg.main, 'index.js');
  assert.equal(serverPkg.scripts.start, 'node index.js');
  assert.equal(serverPkg.scripts.build, 'node --check index.js');
});

test('server binds process.env.PORT on 0.0.0.0', () => {
  assert.match(indexSrc, /process\.env\.PORT/);
  assert.match(indexSrc, /0\.0\.0\.0/);
});

test('server connects to MongoDB before listening', () => {
  assert.match(indexSrc, /connectDB\(\)\.then/);
  assert.match(indexSrc, /if \(!isDbConnected\(\)\)/);
  assert.match(indexSrc, /app\.listen\(PORT,\s*'0\.0\.0\.0'/);
});

test('dotenv does not override platform environment variables', () => {
  assert.match(indexSrc, /override:\s*false/);
});

test('production MongoDB uses MONGODB_URI without logging the value', () => {
  assert.match(dbSrc, /process\.env\.MONGODB_URI/);
  assert.match(dbSrc, /Boolean\(process\.env\.MONGODB_URI\)/);
  assert.doesNotMatch(dbSrc, /console\.log\(\s*process\.env\.MONGODB_URI/);
});
