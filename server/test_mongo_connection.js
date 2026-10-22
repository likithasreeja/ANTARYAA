/**
 * Tests MongoDB Atlas / local URI without printing credentials.
 * Usage: node test_mongo_connection.js
 */
require('dotenv').config({
  path: require('path').join(__dirname, '.env'),
  override: false,
  quiet: true
});

const { connectDB, disconnectDB, getMongoUri, getDbStatus, safeMongoError } = require('./db');

async function main() {
  const hasUri = Boolean(getMongoUri());
  if (!hasUri) {
    console.log('RESULT: SKIPPED');
    console.log('MONGODB_URI / MONGO_URI is not set in server/.env');
    process.exit(2);
  }

  try {
    await connectDB();
    const status = getDbStatus();
    if (!status.connected) {
      console.log('RESULT: FAILED');
      console.log('Mongoose did not report a connected state.');
      process.exit(1);
    }
    console.log('RESULT: CONNECTED');
    console.log(`host: ${status.host}`);
    console.log(`database: ${status.name}`);
    console.log(`state: ${status.state}`);
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.log('RESULT: FAILED');
    console.log(safeMongoError(err));
    try {
      await disconnectDB();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main();
