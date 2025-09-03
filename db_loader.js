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

// Create wrapped functions that will use the db after initialization
const createWrappedFunction = (methodName) => {
  return async (...args) => {
    await dbPromise;
    if (!db || !db[methodName]) {
      throw new Error(`Database method ${methodName} not available`);
    }
    const fn = db[methodName];
    const res = fn(...args);
    if (res && typeof res.then === 'function') return res;
    return Promise.resolve(res);
  };
};

module.exports = {
  createTracking: createWrappedFunction('createTracking'),
  getTracking: createWrappedFunction('getTracking'),
  updateEta: createWrappedFunction('updateEta'),
  updateDestination: createWrappedFunction('updateDestination'),
  updateStatus: createWrappedFunction('updateStatus'),
  addTrackRecord: createWrappedFunction('addTrackRecord'),
  getTrackRecords: createWrappedFunction('getTrackRecords'),
  removeDeliveryRecords: createWrappedFunction('removeDeliveryRecords'),
  getTrackingWithRecords: createWrappedFunction('getTrackingWithRecords'),
  verifyUpdateKey: createWrappedFunction('verifyUpdateKey'),
  getAllTrackings: createWrappedFunction('getAllTrackings'),
  getDatabaseInfo,
  // expose underlying pool when available
  get _raw() { return db; }
};
