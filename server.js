const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db_loader');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://kiss-tracker-frontend.onrender.com',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Body:', req.body);
  }
  next();
});

// Helper function to generate tracking number
function generateTrackingNumber() {
  return uuidv4().substring(0, 8).toUpperCase();
}

// Helper function to generate secret update key
function generateUpdateKey() {
  return uuidv4().substring(0, 16).toLowerCase();
}

// Helper function to generate share link
function generateShareLink(req, trackingNumber) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/track/${trackingNumber}`;
}

// Helper function to generate update link
function generateUpdateLink(req, trackingNumber, updateKey) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/update/${trackingNumber}?key=${updateKey}`;
}

// Middleware to verify update key
async function verifyUpdateKey(req, res, next) {
  try {
    const { trackingNumber } = req.params;
    const updateKey = req.query.key || req.body.updateKey;

    console.log('Verifying update key for:', trackingNumber);
    console.log('Provided key:', updateKey);

    if (!updateKey) {
      console.log('❌ No update key provided');
      return res.status(401).json({ error: 'Update key required for this operation' });
    }

    const isValid = await db.verifyUpdateKey(trackingNumber, updateKey);
    if (!isValid) {
      console.log('❌ Invalid update key');
      return res.status(403).json({ error: 'Invalid update key' });
    }

    console.log('✅ Update key verified');
    next();
  } catch (err) {
    console.error('Error in verifyUpdateKey middleware:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: '😘 Kiss Tracker API is running' });
});

// Create new tracking
app.post('/api/tracking', async (req, res) => {
  try {
    console.log('=== CREATE TRACKING REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { kissProvider, destination, eta } = req.body;
    
    console.log('Extracted values:');
    console.log('- kissProvider:', kissProvider);
    console.log('- destination:', destination);
    console.log('- eta:', eta);
    
    if (!kissProvider || !destination || !eta) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields: kissProvider, destination, eta' 
      });
    }

    const trackingNumber = generateTrackingNumber();
    const updateKey = generateUpdateKey();
    const shareLink = generateShareLink(req, trackingNumber);
    const updateLink = generateUpdateLink(req, trackingNumber, updateKey);
    
    // Parse ETA
    console.log('Parsing ETA:', eta);
    const etaDate = new Date(eta);
    console.log('Parsed ETA date:', etaDate);
    console.log('Is valid date:', !isNaN(etaDate.getTime()));
    
    if (isNaN(etaDate.getTime())) {
      console.log('❌ Invalid ETA format');
      return res.status(400).json({ error: 'Invalid ETA format' });
    }

    // Save to database
  const trackingId = await db.createTracking(trackingNumber, kissProvider, destination, etaDate.toISOString(), updateKey);
  console.log('Created tracking with ID:', trackingId);

    const response = {
      trackingNumber: trackingNumber,
      kissProvider: kissProvider,
      destination,
      eta: etaDate.toISOString(),
      shareLink: shareLink,
      updateLink: updateLink,
      trackRecords: []
    };

    console.log('✅ Successfully created tracking');
    console.log('Response:', JSON.stringify(response, null, 2));
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating tracking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tracking info for update page (requires authentication)
app.get('/api/tracking/:trackingNumber/update', verifyUpdateKey, async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    console.log('Getting tracking for update page:', trackingNumber);
    
  const trackingWithRecords = await db.getTrackingWithRecords(trackingNumber);

    if (!trackingWithRecords) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    const updateKey = req.query.key;
    const shareLink = generateShareLink(req, trackingNumber);
    const updateLink = generateUpdateLink(req, trackingNumber, updateKey);

    const response = {
      trackingNumber: trackingWithRecords.tracking_number,
      kissProvider: trackingWithRecords.kiss_provider,
      destination: trackingWithRecords.destination,
      eta: trackingWithRecords.eta,
      shareLink: shareLink,
      updateLink: updateLink,
      trackRecords: trackingWithRecords.records.map(record => ({
        id: record.id,
        location: record.location,
        timestamp: record.timestamp
      }))
    };

    console.log('✅ Found tracking for update with', trackingWithRecords.records.length, 'records');
    res.json(response);
  } catch (error) {
    console.error('Error getting tracking for update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tracking info (public - no authentication required)
app.get('/api/tracking/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    console.log('Getting tracking for:', trackingNumber);
    
  const trackingWithRecords = await db.getTrackingWithRecords(trackingNumber);

    if (!trackingWithRecords) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    const shareLink = generateShareLink(req, trackingNumber);

    const response = {
      trackingNumber: trackingWithRecords.tracking_number,
      kissProvider: trackingWithRecords.kiss_provider,
      destination: trackingWithRecords.destination,
      eta: trackingWithRecords.eta,
      shareLink: shareLink,
      trackRecords: trackingWithRecords.records.map(record => ({
        id: record.id,
        location: record.location,
        timestamp: record.timestamp
      }))
    };

    console.log('✅ Found tracking with', trackingWithRecords.records.length, 'records');
    res.json(response);
  } catch (error) {
    console.error('Error getting tracking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add location update (requires authentication)
app.post('/api/tracking/:trackingNumber/location', verifyUpdateKey, async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { location } = req.body;

    console.log('Adding location update:', { trackingNumber, location });

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

  const tracking = await db.getTracking(trackingNumber);
    if (!tracking) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

  const recordId = await db.addTrackRecord(tracking.id, trackingNumber, location);
  console.log('✅ Added track record with ID:', recordId);

    res.json({
      message: 'Location updated successfully',
      record_id: recordId
    });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ETA (requires authentication)
app.put('/api/tracking/:trackingNumber/eta', verifyUpdateKey, async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { eta } = req.body;

    console.log('Updating ETA:', { trackingNumber, eta });

    if (!eta) {
      return res.status(400).json({ error: 'ETA is required' });
    }

    const etaDate = new Date(eta);
    if (isNaN(etaDate.getTime())) {
      return res.status(400).json({ error: 'Invalid ETA format' });
    }

    const success = await db.updateEta(trackingNumber, etaDate.toISOString());
    if (!success) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    console.log('✅ Updated ETA successfully');
    res.json({ message: 'ETA updated successfully' });
  } catch (error) {
    console.error('Error updating ETA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, async () => {
  console.log(`😘 Kiss Tracker API running on port ${PORT}`);
  
  // Show database status
  try {
    const dbInfo = await db.getDatabaseInfo();
    const dbIcon = dbInfo.type === 'postgresql' ? '🐘' : '📁';
    const dbName = dbInfo.type === 'postgresql' ? 'PostgreSQL' : 'JSON files (./data/)';
    console.log(`${dbIcon} Database: ${dbName}`);
  } catch (err) {
    console.warn('⚠️  Could not determine database status:', err.message);
  }
  
  console.log(`API docs available at http://localhost:${PORT}`);
});