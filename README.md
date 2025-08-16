# 😘 Kiss Tracker Backend

Node.js + Express backend for romantic package tracking.

## Features

- 🚀 **Express API**: Fast and simple REST API
- 📍 **Location Tracking**: Real-time location updates
- 🔗 **Share Links**: Automatic shareable tracking links
- ⏰ **ETA Management**: Update delivery estimates
- 💾 **In-Memory Storage**: Simple development database

## API Endpoints

- `POST /api/tracking` - Create new tracking
- `GET /api/tracking/:trackingNumber` - Get tracking info
- `POST /api/tracking/:trackingNumber/location` - Add location update
- `PUT /api/tracking/:trackingNumber/eta` - Update ETA

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm install
npm start
```

## Environment Variables

- `PORT` - Server port (default: 8000)
- `FRONTEND_URL` - Frontend URL for CORS and share links

## Deployment

Configured for Render.com Node.js deployment with automatic builds.