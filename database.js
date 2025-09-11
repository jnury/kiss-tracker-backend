const fs = require('fs');
const path = require('path');

// Database file paths
const DB_DIR = path.join(__dirname, 'data');
const TRACKING_FILE = path.join(DB_DIR, 'trackings.json');
const RECORDS_FILE = path.join(DB_DIR, 'track_records.json');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log('📁 Created data directory');
}

// Initialize database files
const initializeDatabase = () => {
  // Initialize trackings file
  if (!fs.existsSync(TRACKING_FILE)) {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify({}, null, 2));
    console.log('📄 Created trackings.json');
  }
  
  // Initialize track records file
  if (!fs.existsSync(RECORDS_FILE)) {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify({}, null, 2));
    console.log('📄 Created track_records.json');
  }
  
  console.log('✅ JSON database files initialized');
};

// Read JSON file safely
const readJSONFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return {};
  }
};

// Write JSON file safely
const writeJSONFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// Database operations
const database = {
  // Create tracking
  createTracking: (trackingNumber, kissProvider, destination, eta, updateKey, creatorTimezone = 'Europe/Zurich', creatorLocale = 'en-CH') => {
    try {
      const trackings = readJSONFile(TRACKING_FILE);
      
      const tracking = {
        id: Date.now(), // Simple ID generation
        tracking_number: trackingNumber,
        kiss_provider: kissProvider,
        destination,
        eta,
        status: 'Preparing',
        update_key: updateKey,
        creator_timezone: creatorTimezone,
        creator_locale: creatorLocale,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      trackings[trackingNumber] = tracking;
      writeJSONFile(TRACKING_FILE, trackings);
      
      return tracking.id;
    } catch (error) {
      console.error('Error creating tracking:', error);
      throw error;
    }
  },

  // Get tracking by tracking number
  getTracking: (trackingNumber) => {
    try {
      const trackings = readJSONFile(TRACKING_FILE);
      return trackings[trackingNumber] || null;
    } catch (error) {
      console.error('Error getting tracking:', error);
      throw error;
    }
  },

  // Update ETA
  updateEta: (trackingNumber, newEta) => {
    try {
      const trackings = readJSONFile(TRACKING_FILE);
      
      if (!trackings[trackingNumber]) {
        return false;
      }
      
      trackings[trackingNumber].eta = newEta;
      trackings[trackingNumber].updated_at = new Date().toISOString();
      
      return writeJSONFile(TRACKING_FILE, trackings);
    } catch (error) {
      console.error('Error updating ETA:', error);
      throw error;
    }
  },

  // Update status
  updateStatus: (trackingNumber, newStatus) => {
    try {
      const trackings = readJSONFile(TRACKING_FILE);
      
      if (!trackings[trackingNumber]) {
        return false;
      }
      
      trackings[trackingNumber].status = newStatus;
      trackings[trackingNumber].updated_at = new Date().toISOString();
      
      return writeJSONFile(TRACKING_FILE, trackings);
    } catch (error) {
      console.error('Error updating status:', error);
      throw error;
    }
  },

  // Add track record
  addTrackRecord: (trackingId, trackingNumber, location) => {
    try {
      const records = readJSONFile(RECORDS_FILE);
      
      if (!records[trackingNumber]) {
        records[trackingNumber] = [];
      }
      
      const record = {
        id: Date.now() + Math.random(), // Ensure uniqueness
        tracking_id: trackingId,
        location,
        timestamp: new Date().toISOString()
      };
      
      records[trackingNumber].push(record);
      writeJSONFile(RECORDS_FILE, records);
      
      return record.id;
    } catch (error) {
      console.error('Error adding track record:', error);
      throw error;
    }
  },

  // Update destination
  updateDestination: (trackingNumber, newDestination) => {
    try {
      const trackings = readJSONFile(TRACKING_FILE);
      
      if (!trackings[trackingNumber]) {
        return false;
      }
      
      trackings[trackingNumber].destination = newDestination;
      trackings[trackingNumber].updated_at = new Date().toISOString();
      
      return writeJSONFile(TRACKING_FILE, trackings);
    } catch (error) {
      console.error('Error updating destination:', error);
      throw error;
    }
  },

  // Get track records for a tracking
  getTrackRecords: (trackingNumber) => {
    try {
      const records = readJSONFile(RECORDS_FILE);
      return records[trackingNumber] || [];
    } catch (error) {
      console.error('Error getting track records:', error);
      throw error;
    }
  },

  // Remove delivery records
  removeDeliveryRecords: (trackingNumber) => {
    try {
      const records = readJSONFile(RECORDS_FILE);
      
      if (!records[trackingNumber]) {
        return false;
      }
      
      const originalLength = records[trackingNumber].length;
      records[trackingNumber] = records[trackingNumber].filter(record => record.location !== 'Delivered');
      const removed = originalLength !== records[trackingNumber].length;
      
      if (removed) {
        writeJSONFile(RECORDS_FILE, records);
      }
      
      return removed;
    } catch (error) {
      console.error('Error removing delivery records:', error);
      throw error;
    }
  },

  // Get tracking with records
  getTrackingWithRecords: (trackingNumber) => {
    try {
      const tracking = database.getTracking(trackingNumber);
      if (!tracking) return null;
      
      const records = database.getTrackRecords(trackingNumber);
      
      return {
        ...tracking,
        records: records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      };
    } catch (error) {
      console.error('Error getting tracking with records:', error);
      throw error;
    }
  },

  // Verify update key
  verifyUpdateKey: (trackingNumber, providedKey) => {
    try {
      const tracking = database.getTracking(trackingNumber);
      if (!tracking) return false;
      return tracking.update_key === providedKey;
    } catch (error) {
      console.error('Error verifying update key:', error);
      throw error;
    }
  },

  // Get all trackings (for debugging)
  getAllTrackings: () => {
    try {
      return readJSONFile(TRACKING_FILE);
    } catch (error) {
      console.error('Error getting all trackings:', error);
      throw error;
    }
  }
};

// Initialize database on require
initializeDatabase();

// Export database operations
module.exports = {
  createTracking: database.createTracking,
  getTracking: database.getTracking,
  updateEta: database.updateEta,
  updateDestination: database.updateDestination,
  updateStatus: database.updateStatus,
  addTrackRecord: database.addTrackRecord,
  getTrackRecords: database.getTrackRecords,
  removeDeliveryRecords: database.removeDeliveryRecords,
  getTrackingWithRecords: database.getTrackingWithRecords,
  verifyUpdateKey: database.verifyUpdateKey,
  getAllTrackings: database.getAllTrackings
};