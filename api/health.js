// GET /api/health: tells the portal which integrations are configured (never returns the keys).
export default function handler(req, res) {
  const has = k => !!process.env[k]
  res.status(200).json({
    ok: true,
    integrations: {
      supabase: has('SUPABASE_URL') || has('VITE_SUPABASE_URL'),
      supabase_service: has('SUPABASE_SERVICE_ROLE_KEY'),
      anthropic: has('ANTHROPIC_API_KEY'),
      gemini: has('GEMINI_API_KEY'),
      skiptrace: process.env.SKIPTRACE_PROVIDER || null,
      batchdata: has('BATCHDATA_API_KEY'),
      reiskip: has('REISKIP_API_KEY'),
      ghl_webhook: has('GHL_WEBHOOK_URL'),
      epcounty_source: has('EPCOUNTY_SOURCE_URL') || has('FORECLOSURE_FEED_PROVIDER'),
      epcad: has('EPCAD_LOOKUP_URL'),
      taxes: has('TAX_LOOKUP_URL'),
      cron_secret: has('CRON_SECRET'),
    },
    time: new Date().toISOString(),
  })
}
