# 😘 Kiss Tracker Backend

Node.js + Express backend for romantic package tracking with secure authentication.

## Features

- 🚀 **Express API**: Fast and simple REST API
- 🔐 **Secret Update Keys**: Secure authentication without user accounts
- 📍 **Location Tracking**: Real-time location updates (authenticated)
- 🔗 **Dual Link System**: Public tracking + private update links
- ⏰ **ETA Management**: Update delivery estimates (authenticated)
- 💾 **JSON Database**: File-based persistence for development
- 🌐 **CORS Enabled**: Ready for frontend integration

## API Endpoints

### Public Endpoints
- `GET /` - API health check
- `POST /api/tracking` - Create new tracking (returns both public and private links)
- `GET /api/tracking/:trackingNumber` - Get public tracking info (read-only)

### Authenticated Endpoints (require `?key=` parameter)
- `GET /api/tracking/:trackingNumber/update?key=SECRET` - Get tracking info for updates
- `POST /api/tracking/:trackingNumber/location?key=SECRET` - Add location update
- `PUT /api/tracking/:trackingNumber/eta?key=SECRET` - Update ETA

## Security Model

### Secret Update Keys
- 16-character unique keys generated per tracking
- Required for all update operations
- No user accounts needed
- Share public link with recipient, keep update link private

### Authentication Flow
1. **Create tracking** → Get public + private links
2. **Share public link** → Recipient can view progress
3. **Use private link** → Provider can add updates
4. **Invalid key** → 401/403 error with clear message

## Development

```bash
yarn install
yarn dev
```

## Production

```bash
yarn install
yarn start
```

## Database

### Development
- **JSON files** in `./data/` directory
- `trackings.json` - All tracking data with update keys
- `track_records.json` - Location updates by tracking number
- **Persistent** across server restarts

### Production Ready
- Easy migration to PostgreSQL
- Database-agnostic design
- Environment variable configuration

## Environment Variables

- `PORT` - Server port (default: 8000)
- `FRONTEND_URL` - Frontend URL for CORS and generating share links
- `NODE_ENV` - Environment mode (development/production)

## Deployment

- **Platform**: Render.com with Node.js environment
- **Build**: `yarn install` for fast, reliable dependency management
- **Start**: `npm start` using package.json scripts
- **Auto-deploy** on git push