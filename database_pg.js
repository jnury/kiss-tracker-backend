const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Cannot use Postgres backend.');
}

const pool = new Pool({ connectionString, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

// Initialize schema: trackings and track_records
let initialized = false;
const init = async () => {
  if (initialized) return; // Prevent double initialization
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create schema (optional) and tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS trackings (
        id UUID PRIMARY KEY,
        tracking_number TEXT UNIQUE NOT NULL,
        kiss_provider TEXT NOT NULL,
        destination TEXT NOT NULL,
        eta TIMESTAMP WITH TIME ZONE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Preparing',
        update_key TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);

    // Add status column to existing trackings if it doesn't exist
    await client.query(`
      ALTER TABLE trackings 
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Preparing';
    `);

    // Add timezone and locale columns for creator preferences
    await client.query(`
      ALTER TABLE trackings 
      ADD COLUMN IF NOT EXISTS creator_timezone TEXT DEFAULT 'Europe/Zurich';
    `);

    await client.query(`
      ALTER TABLE trackings 
      ADD COLUMN IF NOT EXISTS creator_locale TEXT DEFAULT 'en-CH';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS track_records (
        id UUID PRIMARY KEY,
        tracking_id UUID REFERENCES trackings(id) ON DELETE CASCADE,
        tracking_number TEXT NOT NULL,
        location TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);

    await client.query('COMMIT');
    initialized = true;
    console.log('✅ PostgreSQL schema initialized');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing PostgreSQL schema:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Helper to generate UUIDs using Postgres gen_random_uuid() if available, otherwise fallback
const generateUUID = () => {
  // let Postgres generate uuid on insert via gen_random_uuid() if extension available.
  // For simplicity, generate here using random bytes
  const { randomUUID } = require('crypto');
  return randomUUID();
};

// Exposed API (async)
const database = {
  createTracking: async (trackingNumber, kissProvider, destination, eta, updateKey) => {
    const id = generateUUID();
    const client = await pool.connect();
    try {
      const res = await client.query(
        `INSERT INTO trackings (id, tracking_number, kiss_provider, destination, eta, status, update_key, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now()) RETURNING id`,
        [id, trackingNumber, kissProvider, destination, eta, 'Preparing', updateKey]
      );
      return res.rows[0].id;
    } finally {
      client.release();
    }
  },

  getTracking: async (trackingNumber) => {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM trackings WHERE tracking_number = $1', [trackingNumber]);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  },

  updateEta: async (trackingNumber, newEta) => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        'UPDATE trackings SET eta = $1, updated_at = now() WHERE tracking_number = $2 RETURNING id',
        [newEta, trackingNumber]
      );
      return res.rowCount > 0;
    } finally {
      client.release();
    }
  },

  updateDestination: async (trackingNumber, newDestination) => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        'UPDATE trackings SET destination = $1, updated_at = now() WHERE tracking_number = $2 RETURNING id',
        [newDestination, trackingNumber]
      );
      return res.rowCount > 0;
    } finally {
      client.release();
    }
  },

  updateStatus: async (trackingNumber, newStatus) => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        'UPDATE trackings SET status = $1, updated_at = now() WHERE tracking_number = $2 RETURNING id',
        [newStatus, trackingNumber]
      );
      return res.rowCount > 0;
    } finally {
      client.release();
    }
  },

  addTrackRecord: async (trackingId, trackingNumber, location) => {
    const id = generateUUID();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO track_records (id, tracking_id, tracking_number, location, timestamp)
         VALUES ($1,$2,$3,$4, now())`,
        [id, trackingId, trackingNumber, location]
      );
      return id;
    } finally {
      client.release();
    }
  },

  getTrackRecords: async (trackingNumber) => {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM track_records WHERE tracking_number = $1 ORDER BY timestamp ASC', [trackingNumber]);
      return res.rows || [];
    } finally {
      client.release();
    }
  },

  removeDeliveryRecords: async (trackingNumber) => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        'DELETE FROM track_records WHERE tracking_number = $1 AND location = $2',
        [trackingNumber, 'Delivered']
      );
      return res.rowCount > 0;
    } finally {
      client.release();
    }
  },

  getTrackingWithRecords: async (trackingNumber) => {
    const tracking = await database.getTracking(trackingNumber);
    if (!tracking) return null;
    const records = await database.getTrackRecords(trackingNumber);
    return { ...tracking, records };
  },

  verifyUpdateKey: async (trackingNumber, providedKey) => {
    const tracking = await database.getTracking(trackingNumber);
    if (!tracking) return false;
    return tracking.update_key === providedKey;
  },

  getAllTrackings: async () => {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT * FROM trackings');
      return res.rows;
    } finally {
      client.release();
    }
  },

  // Expose pool for migrations or admin tasks
  _pool: pool,
  init
};

module.exports = database;

// Note: Initialization will be handled by db_loader.js to prevent duplicate calls

module.exports = database;
