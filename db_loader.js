// db_loader.js
// Tries Postgres first if DATABASE_URL is set, falls back to JSON storage if connection fails
require('dotenv').config();
let db = null;
let dbType = null;

const initializeDatabase = async () => {
  if (process.env.DATABASE_URL) {
    console.log('🔍 DATABASE_URL detected, attempting PostgreSQL connection...');
    try {
      const pgDb = require('./database_pg');
      // Test connection by attempting to initialize
      await pgDb.init();
      // Simple connection test
      await pgDb.getAllTrackings();
      db = pgDb;
      dbType = 'postgresql';
      console.log('✅ 🐘 PostgreSQL connected successfully');
      return;
    } catch (err) {
      console.warn('⚠️  PostgreSQL connection failed, falling back to JSON storage:', err.message);
    }
  } else {
    console.log('🔍 No DATABASE_URL found, using local JSON storage');
  }
  
  // Fallback to JSON database
  db = require('./database');
  dbType = 'json';
  console.log('📁 Using JSON file storage');
};

// Initialize immediately and export a promise
const dbPromise = initializeDatabase();

// Normalize API: if chosen db returns sync functions, wrap them into promises to keep server logic consistent
const wrapIfSync = (fn) => {
  if (!fn) return undefined;
  return async (...args) => {
    // Ensure database is initialized before any operation
    await dbPromise;
    try {
      const res = fn(...args);
      if (res && typeof res.then === 'function') return res; // already promise
      return Promise.resolve(res);
    } catch (err) {
      return Promise.reject(err);
    }
  };
};

// Export database status helper
const getDatabaseInfo = async () => {
  await dbPromise;
  return {
    type: dbType,
    connected: db !== null
  };
};

module.exports = {
  createTracking: wrapIfSync(db?.createTracking),
  getTracking: wrapIfSync(db?.getTracking),
  updateEta: wrapIfSync(db?.updateEta),
  addTrackRecord: wrapIfSync(db?.addTrackRecord),
  getTrackRecords: wrapIfSync(db?.getTrackRecords),
  getTrackingWithRecords: wrapIfSync(db?.getTrackingWithRecords),
  verifyUpdateKey: wrapIfSync(db?.verifyUpdateKey),
  getAllTrackings: wrapIfSync(db?.getAllTrackings),
  getDatabaseInfo,
  // expose underlying pool when available
  _raw: db
};
