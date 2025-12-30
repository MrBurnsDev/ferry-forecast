# Ferry Forecast - Deployment Guide

## Overview

Ferry Forecast is a Next.js 14 application that predicts ferry disruption risk for Cape Cod & Islands routes using real-time weather data from NOAA, NWS, and NOAA CO-OPS.

## Prerequisites

- Node.js 20+ (recommended)
- Supabase account (for database)
- Vercel account (recommended for hosting)

## Environment Variables

Create a `.env.local` file with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

If Supabase is not configured, the app falls back to static route configuration.

## Database Setup

1. Create a new Supabase project
2. Run the schema migration:
   ```bash
   psql -h your-supabase-host -U postgres -d postgres < supabase/migrations/001_initial_schema.sql
   ```
3. Run the seed data:
   ```bash
   psql -h your-supabase-host -U postgres -d postgres < supabase/seed.sql
   ```

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment to Vercel

1. Push code to GitHub repository
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Vercel Configuration

The app is optimized for Vercel's Edge Runtime. Key settings:

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

## External API Dependencies

### NOAA Weather API (api.weather.gov)
- **Used for**: Marine weather forecasts
- **Rate limits**: Reasonable use, include User-Agent header
- **No API key required**

### NWS Alerts API (api.weather.gov/alerts)
- **Used for**: Marine weather advisories
- **Rate limits**: Same as above
- **No API key required**

### NOAA CO-OPS (tidesandcurrents.noaa.gov)
- **Used for**: Tide data
- **Rate limits**: Reasonable use
- **No API key required**

## Caching Strategy

| Data Type | Cache TTL | Reason |
|-----------|-----------|--------|
| Weather | 10 min | Weather updates hourly from NOAA |
| Alerts | 5 min | Advisories can change quickly |
| Tides | 30 min | Tide predictions are stable |
| Operator Status | 2 min | Changes frequently during disruptions |
| Forecast API | 5 min | Balance freshness vs load |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/forecast/route/[routeId]` | GET | Forecast for a specific route |
| `/api/routes` | GET | List of available routes |
| `/api/model` | GET | Scoring model configuration |

## Monitoring

### Key Metrics to Watch
- API response times (target: <500ms)
- External API failure rates
- Cache hit ratios
- Error rates by endpoint

### Health Checks
The `/api/routes` endpoint can serve as a basic health check.

## Graceful Degradation

The app is designed to fail gracefully:

1. **Supabase unavailable**: Falls back to static route config
2. **Weather API fails**: Returns 503 with retry header
3. **Alert API fails**: Continues without advisory data
4. **Tide API fails**: Continues without tide data
5. **Operator status fails**: Shows "unknown" status

## Security Considerations

- No API keys stored client-side
- All external API calls happen server-side
- No user authentication in MVP
- No personal data stored

## Scaling

For higher traffic:
1. Enable Vercel Edge caching
2. Consider Redis for distributed caching
3. Monitor NOAA API rate limits
4. Add CDN for static assets

## Troubleshooting

### "Weather data unavailable" error
- Check NOAA API status
- Verify port coordinates are valid
- Check server logs for specific error codes

### Stale forecast data
- Clear cache: Call `/api/routes` to verify connectivity
- Check `cache_expires_at` in response metadata

### Operator status showing "unknown"
- This is expected when operator websites are unavailable
- Operator scraping is best-effort, not guaranteed
