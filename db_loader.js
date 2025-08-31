// db_loader.js
// Chooses Postgres backend when DATABASE_URL is set, otherwise fall back to file-based database.js
require('dotenv').config();
let db = null;

if (process.env.DATABASE_URL) {
  try {
    db = require('./database_pg');
    console.log('Using Postgres backend (database_pg)');
  } catch (err) {
    console.error('Failed to load Postgres backend, falling back to file DB:', err);
    db = require('./database');
  }
} else {
  db = require('./database');
  console.log('Using file-based DB (database.js)');
}

// Normalize API: if chosen db returns sync functions, wrap them into promises to keep server logic consistent
const wrapIfSync = (fn) => {
  if (!fn) return undefined;
  return (...args) => {
    try {
      const res = fn(...args);
      if (res && typeof res.then === 'function') return res; // already promise
      return Promise.resolve(res);
    } catch (err) {
      return Promise.reject(err);
    }
  };
};

module.exports = {
  createTracking: wrapIfSync(db.createTracking),
  getTracking: wrapIfSync(db.getTracking),
  updateEta: wrapIfSync(db.updateEta),
  addTrackRecord: wrapIfSync(db.addTrackRecord),
  getTrackRecords: wrapIfSync(db.getTrackRecords),
  getTrackingWithRecords: wrapIfSync(db.getTrackingWithRecords),
  verifyUpdateKey: wrapIfSync(db.verifyUpdateKey),
  getAllTrackings: wrapIfSync(db.getAllTrackings),
  // expose underlying pool when available
  _raw: db
};
