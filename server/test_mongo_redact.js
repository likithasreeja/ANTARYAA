const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeMongoError } = require('./db');

test('redacts credentials from Mongo connection errors', () => {
  const raw = 'querySrv ENOTFOUND cluster0.abc.mongodb.net mongodb+srv://shop:supersecret@cluster0.abc.mongodb.net/antarya';
  const cleaned = safeMongoError(new Error(raw));
  assert.equal(cleaned.includes('supersecret'), false);
  assert.equal(cleaned.includes('mongodb://***') || cleaned.includes('mongodb+srv://***') || cleaned.includes(':***@'), true);
});
