const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db_loader');
require('dotenv').config();

// SSE client management
const sseClients = new Map(); // trackingNumber -> Set of response objects

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

// SSE broadcast function
function broadcastToTracking(trackingNumber, eventType, data) {
  const clients = sseClients.get(trackingNumber);
  if (clients) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    
    // Remove closed connections while broadcasting
    const activeClients = new Set();
    clients.forEach(res => {
      if (!res.headersSent || res.writable) {
        try {
          res.write(message);
          activeClients.add(res);
        } catch (err) {
          console.log('SSE client disconnected');
        }
      }
    });
    
    // Update active clients list
    if (activeClients.size > 0) {
      sseClients.set(trackingNumber, activeClients);
    } else {
      sseClients.delete(trackingNumber);
    }
    
    console.log(`📡 Broadcasted ${eventType} to ${activeClients.size} clients for ${trackingNumber}`);
  }
}


// Routes
app.get('/', (req, res) => {
  res.json({ message: '😘 Kiss Tracker API is running' });
});


// SSE endpoint for real-time tracking updates
app.get('/api/tracking/:trackingNumber/events', async (req, res) => {
  const { trackingNumber } = req.params;
  
  console.log(`📡 SSE client connecting for tracking: ${trackingNumber}`);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Add client to tracking group
  if (!sseClients.has(trackingNumber)) {
    sseClients.set(trackingNumber, new Set());
  }
  sseClients.get(trackingNumber).add(res);
  
  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ trackingNumber })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`📡 SSE client disconnected from tracking: ${trackingNumber}`);
    const clients = sseClients.get(trackingNumber);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(trackingNumber);
      }
    }
  });
  
  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    if (res.writable) {
      res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
    } else {
      clearInterval(heartbeat);
    }
  }, 30000); // 30 seconds
  
  req.on('close', () => clearInterval(heartbeat));
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
    
    // Validate ETA is a valid ISO string
    console.log('Validating ETA:', eta);
    const etaDate = new Date(eta);
    console.log('Parsed ETA date:', etaDate);
    console.log('Is valid date:', !isNaN(etaDate.getTime()));
    
    if (isNaN(etaDate.getTime())) {
      console.log('❌ Invalid ETA format');
      return res.status(400).json({ error: 'Invalid ETA format' });
    }

    // Save to database (eta is already UTC ISO string)
    const trackingId = await db.createTracking(trackingNumber, kissProvider, destination, eta, updateKey);
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
      status: trackingWithRecords.status,
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
      status: trackingWithRecords.status,
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

    // Broadcast location update to SSE clients
    broadcastToTracking(trackingNumber, 'location-update', {
      location,
      timestamp: new Date().toISOString(),
      recordId
    });

    res.json({
      message: 'Location updated successfully',
      record_id: recordId
    });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update destination (requires authentication)
app.put('/api/tracking/:trackingNumber/destination', verifyUpdateKey, async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { destination } = req.body;

    console.log('Updating destination:', { trackingNumber, destination });

    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    const success = await db.updateDestination(trackingNumber, destination);
    if (!success) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    // Broadcast destination update to SSE clients
    broadcastToTracking(trackingNumber, 'destination-change', {
      destination
    });

    console.log('✅ Updated destination successfully');
    res.json({ message: 'Destination updated successfully' });
  } catch (error) {
    console.error('Error updating destination:', error);
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

    const success = await db.updateEta(trackingNumber, eta);
    if (!success) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    // Broadcast ETA update to SSE clients
    broadcastToTracking(trackingNumber, 'eta-change', {
      eta: eta
    });

    console.log('✅ Updated ETA successfully');
    res.json({ message: 'ETA updated successfully' });
  } catch (error) {
    console.error('Error updating ETA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update status (requires authentication)
app.put('/api/tracking/:trackingNumber/status', verifyUpdateKey, async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { status } = req.body;

    console.log('Updating status:', { trackingNumber, status });

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['Preparing', 'In Transit', 'Out for Delivery', 'Delivered', 'Delayed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const success = await db.updateStatus(trackingNumber, status);
    if (!success) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    // If status is 'Delivered', automatically create a delivery record
    if (status === 'Delivered') {
      const tracking = await db.getTracking(trackingNumber);
      if (tracking) {
        const recordId = await db.addTrackRecord(tracking.id, trackingNumber, 'Delivered');
        console.log('✅ Auto-created delivery record with ID:', recordId);
        
        // Broadcast location update for the delivery record
        broadcastToTracking(trackingNumber, 'location-update', {
          location: 'Delivered',
          timestamp: new Date().toISOString(),
          recordId
        });
      }
    } else {
      // If status is changed from Delivered to something else, remove delivery records
      const success = await db.removeDeliveryRecords(trackingNumber);
      if (success) {
        console.log('✅ Removed delivery records for status change');
        
        // Broadcast removal to SSE clients
        broadcastToTracking(trackingNumber, 'delivery-removed', {
          trackingNumber
        });
      }
    }

    // Broadcast status update to SSE clients
    broadcastToTracking(trackingNumber, 'status-change', {
      status
    });

    console.log('✅ Updated status successfully');
    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
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