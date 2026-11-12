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
      skiptrace: !!process.env.SKIPTRACE_PROVIDER && (has('BATCHDATA_API_KEY') || has('REISKIP_API_KEY')),
      batchdata: has('BATCHDATA_API_KEY'),
      reiskip: has('REISKIP_API_KEY'),
      ghl_webhook: has('GHL_WEBHOOK_URL'),
      epcounty_source: has('EPCOUNTY_SOURCE_URL'),
      epcad: has('EPCAD_LOOKUP_URL'),
      epcad_export: has('EPCAD_EXPORT_URL'),
      llm: has('ANTHROPIC_API_KEY') || has('GEMINI_API_KEY'),
      keyless: ['pdf_reader', 'ocr', 'notice_parser', 'statement_parser', 'tax_list', 'epcad_index', 'mail', 'research', 'route', 'dnc'],
      taxes: has('TAX_LOOKUP_URL'),
      cron_secret: has('CRON_SECRET'),
    },
    time: new Date().toISOString(),
  })
}
