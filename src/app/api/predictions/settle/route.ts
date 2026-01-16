/**
 * Prediction Settlement Endpoint (Canonical Path)
 *
 * POST /api/predictions/settle
 *
 * This is the canonical endpoint for prediction settlement.
 * It re-exports the handlers from the legacy /api/betting/settle endpoint.
 *
 * The legacy endpoint is retained for backward compatibility.
 * Once cron configuration is updated to use this path, the legacy
 * endpoint can be deprecated.
 */

// Re-export all handlers from the legacy endpoint
export { POST, GET } from '@/app/api/betting/settle/route';

// Re-export dynamic config
export { dynamic } from '@/app/api/betting/settle/route';
