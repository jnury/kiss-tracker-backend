# 😘 Kiss Tracker Backend

Node.js + Express backend for romantic package tracking with dual database support, real-time updates, and secure authentication.

## Features

- 🚀 **Express API**: Fast and simple REST API with CORS support
- 🔐 **Secret Update Keys**: Secure authentication without user accounts
- 📍 **Location Tracking**: Real-time location updates with authentication
- 🔗 **Dual Link System**: Public tracking + private update links
- ⏰ **ETA Management**: Update delivery estimates with timezone handling
- ⚡ **Real-time Updates**: Server-Sent Events (SSE) for live notifications
- 💾 **Dual Database**: JSON files (development) + PostgreSQL (production)
- 🌐 **CORS Enabled**: Multi-domain frontend integration
- 🔄 **Status Management**: Complete delivery lifecycle tracking

## Architecture

### Database Abstraction Layer
- **Auto-detection**: `DATABASE_URL` environment variable determines database type
- **Development**: JSON file storage in `./data/` directory
- **Production**: PostgreSQL with connection pooling
- **Consistent API**: Both backends expose identical async interfaces

### Authentication Model
- **No user accounts**: Keyless public access + secret-key authenticated updates
- **16-character update keys**: UUID-based secure keys per tracking
- **Dual link system**: Public sharing + private update access
- **Middleware validation**: `verifyUpdateKey()` protects all update operations

## API Endpoints

### Public Endpoints
```http
GET /                                        # API health check
POST /api/tracking                           # Create new tracking
GET /api/tracking/:trackingNumber            # Public tracking info (read-only)
GET /api/tracking/:trackingNumber/events     # SSE real-time updates
```

### Authenticated Endpoints
All require `?key=SECRET` parameter:
```http
GET /api/tracking/:trackingNumber/update?key=SECRET      # Get tracking for updates
POST /api/tracking/:trackingNumber/location?key=SECRET   # Add location update
PUT /api/tracking/:trackingNumber/eta?key=SECRET         # Update ETA
PUT /api/tracking/:trackingNumber/status?key=SECRET      # Update delivery status
PUT /api/tracking/:trackingNumber/destination?key=SECRET # Update destination
```

## Real-time Features

### Server-Sent Events (SSE)
**Endpoint**: `GET /api/tracking/:trackingNumber/events`

**Event Types**:
- `connected` - Client connected to SSE stream
- `location-update` - New location added to timeline
- `status-change` - Delivery status updated
- `eta-change` - ETA modified
- `destination-change` - Destination updated  
- `delivery-removed` - Delivery records cleaned up

**Features**:
- **Connection tracking**: Active client management
- **Broadcast updates**: All connected clients receive events
- **Error resilience**: Graceful handling of client disconnections
- **Automatic cleanup**: Removes disconnected clients

### Event Broadcasting
```javascript
// Example: Broadcasting status change
clients[trackingNumber]?.forEach(client => {
  client.write(`event: status-change\n`);
  client.write(`data: ${JSON.stringify({status: 'In Transit'})}\n\n`);
});
```

## Security Model

### Update Key System
```javascript
// Generated per tracking (16 characters from UUID)
const updateKey = uuidv4().substring(0, 16);
```

### Authentication Flow
1. **Create tracking** → Returns `{shareLink, updateLink}`
2. **Share public link** → Recipient views progress (no auth needed)
3. **Use update link** → Provider updates via private key
4. **Invalid key** → 401/403 with descriptive error messages

### CORS Configuration
Supports multiple domains:
- `http://localhost:3000` - Development frontend
- `http://127.0.0.1:3000` - Alternative local access
- `https://kiss-tracker.com` - Production domain
- `https://www.kiss-tracker.com` - WWW subdomain

## Database Systems

### JSON Files (Development)
**Location**: `./data/` directory  
**Files**:
- `trackings.json` - Main tracking records with update keys
- `track_records.json` - Location updates organized by tracking number

**Features**:
- **Auto-initialization**: Creates files and structure on first run
- **Atomic operations**: Safe concurrent read/write operations
- **Persistent**: Data survives server restarts
- **Git-ignored**: Excluded from version control

### PostgreSQL (Production)
**Activation**: Set `DATABASE_URL` environment variable

**Tables**:
```sql
trackings (
  id UUID PRIMARY KEY,
  tracking_number VARCHAR UNIQUE,
  kiss_provider VARCHAR,
  destination VARCHAR,
  eta TIMESTAMP WITH TIME ZONE,
  status VARCHAR,
  update_key VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

track_records (
  id UUID PRIMARY KEY,
  tracking_id UUID REFERENCES trackings(id) ON DELETE CASCADE,
  tracking_number VARCHAR,
  location VARCHAR,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Features**:
- **Auto-migration**: Creates schema on first connection
- **Connection pooling**: Efficient database connections
- **UUID primary keys**: Proper relational design
- **Timezone support**: Proper ETA handling across zones
- **CASCADE deletes**: Referential integrity

## Data Models

### Tracking Record
```typescript
interface Tracking {
  id: string;
  trackingNumber: string;
  kissProvider: string;
  destination: string;
  eta: string;           // ISO 8601 timestamp
  status: string;        // Preparing | In Transit | Out for Delivery | Delivered | Delayed
  updateKey: string;     // 16-character secret key
  createdAt: string;
  updatedAt: string;
}
```

### Location Record
```typescript
interface TrackRecord {
  id: string;
  trackingId: string;    // Foreign key to tracking
  trackingNumber: string; // Denormalized for query efficiency
  location: string;
  timestamp: string;     // ISO 8601 timestamp
}
```

## Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

## Environment Variables

### Required
- `PORT` - Server port (default: 8000)
- `FRONTEND_URL` - Frontend URL for CORS and share link generation

### Optional
- `DATABASE_URL` - PostgreSQL connection string (enables production database)
- `NODE_ENV` - Environment mode (development/production)

### Example Configuration
```bash
# Development
PORT=8000
FRONTEND_URL=http://localhost:3000

# Production
PORT=8000
FRONTEND_URL=https://kiss-tracker.com
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=production
```

## Deployment

### Render.com Node.js Service
**Configuration**:
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment**: Node.js 18+
- **Database**: PostgreSQL add-on (automatic `DATABASE_URL`)

**Features**:
- **Auto-deploy**: Git push triggers deployment
- **Environment sync**: Variables from Render dashboard
- **Health checks**: Built-in `/` endpoint monitoring
- **Zero-downtime**: Rolling deployments

### Production Checklist
- [ ] `DATABASE_URL` configured (PostgreSQL)
- [ ] `FRONTEND_URL` set to production domain
- [ ] CORS origins include production frontend
- [ ] Environment variables secured
- [ ] Database schema auto-created on first connection

## API Usage Examples

### Create New Tracking
```bash
curl -X POST http://localhost:8000/api/tracking \
  -H "Content-Type: application/json" \
  -d '{
    "kissProvider": "Love Express",
    "destination": "Her Heart",
    "eta": "2024-02-14T18:00:00.000Z"
  }'
```

**Response**:
```json
{
  "trackingNumber": "KISS123456",
  "shareLink": "https://kiss-tracker.com/track/KISS123456",
  "updateLink": "https://kiss-tracker.com/update/KISS123456?key=abc123def456"
}
```

### Add Location Update
```bash
curl -X POST "http://localhost:8000/api/tracking/KISS123456/location?key=abc123def456" \
  -H "Content-Type: application/json" \
  -d '{"location": "Left the flower shop"}'
```

### Get Public Tracking Info
```bash
curl http://localhost:8000/api/tracking/KISS123456
```

## Error Handling

### Authentication Errors
- **401 Unauthorized**: Missing update key
- **403 Forbidden**: Invalid update key
- **404 Not Found**: Tracking number doesn't exist

### Validation Errors
- **400 Bad Request**: Missing required fields
- **422 Unprocessable Entity**: Invalid data format

### Server Errors
- **500 Internal Server Error**: Database or system errors
- **503 Service Unavailable**: Database connection issues

## Performance Features

- **Connection pooling**: Efficient database connections
- **Event broadcasting**: Minimal overhead SSE implementation
- **Atomic operations**: Safe concurrent database access
- **Memory management**: Automatic SSE client cleanup
- **Query optimization**: Indexed database lookups

## Monitoring & Logs

### Health Check
```bash
curl http://localhost:8000/
# Returns: {"status": "Kiss Tracker API is running", "timestamp": "..."}
```

### Development Logging
- Database operations
- SSE connection events  
- Authentication attempts
- Error details with stack traces

### Production Logging
- Request/response cycles
- Database performance metrics
- SSE client connection counts
- Error summaries without sensitive data