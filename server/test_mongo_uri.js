const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getMongoUri,
  isUsableMongoUri,
  getMongoDbName,
  getMongoConnectOptions,
  connectDB
} = require('./db');

test('getMongoUri prefers MONGODB_URI over MONGO_URI', () => {
  const prevUri = process.env.MONGODB_URI;
  const prevLegacy = process.env.MONGO_URI;
  process.env.MONGODB_URI = 'mongodb://primary-host/antarya';
  process.env.MONGO_URI = 'mongodb://legacy-host/antarya';
  try {
    assert.equal(getMongoUri(), 'mongodb://primary-host/antarya');
  } finally {
    restoreEnv('MONGODB_URI', prevUri);
    restoreEnv('MONGO_URI', prevLegacy);
  }
});

test('rejects Atlas placeholder URIs without printing them', () => {
  assert.equal(isUsableMongoUri(''), false);
  assert.equal(isUsableMongoUri('not-a-uri'), false);
  assert.equal(
    isUsableMongoUri('mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/'),
    false
  );
  assert.equal(
    isUsableMongoUri('mongodb+srv://shop:secret@cluster0.example.mongodb.net/antarya'),
    true
  );
});

test('defaults Atlas connections to the antarya database when the URI has no path', () => {
  assert.equal(
    getMongoDbName('mongodb+srv://shop:secret@cluster0.example.mongodb.net/?retryWrites=true'),
    'antarya'
  );
  assert.equal(
    getMongoDbName('mongodb+srv://shop:secret@cluster0.example.mongodb.net/shopdb'),
    'shopdb'
  );
  const options = getMongoConnectOptions('mongodb+srv://shop:secret@cluster0.example.mongodb.net/');
  assert.equal(options.family, 4);
  assert.equal(options.dbName, 'antarya');
  assert.equal(options.serverSelectionTimeoutMS, 20000);
});

test('connectDB throws in production when MONGODB_URI is missing', async () => {
  const prev = snapshotEnv();
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'unit-test-secret';
  delete process.env.MONGODB_URI;
  delete process.env.MONGO_URI;
  try {
    await assert.rejects(() => connectDB(), /MONGODB_URI is required in production/);
  } finally {
    restoreSnapshot(prev);
  }
});

test('connectDB throws in production for Atlas placeholder URIs', async () => {
  const prev = snapshotEnv();
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'unit-test-secret';
  process.env.MONGODB_URI = 'mongodb+srv://<db_username>:<password>@cluster0.example.mongodb.net/';
  delete process.env.MONGO_URI;
  try {
    await assert.rejects(() => connectDB(), /placeholder|invalid/i);
  } finally {
    restoreSnapshot(prev);
  }
});

function snapshotEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGO_URI: process.env.MONGO_URI
  };
}

function restoreSnapshot(prev) {
  restoreEnv('NODE_ENV', prev.NODE_ENV);
  restoreEnv('JWT_SECRET', prev.JWT_SECRET);
  restoreEnv('MONGODB_URI', prev.MONGODB_URI);
  restoreEnv('MONGO_URI', prev.MONGO_URI);
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
