// POST /api/extract-notice  { file: dataURL (PDF or image of a Notice of Trustee's / Substitute Trustee's Sale) }
// Uses Claude (ANTHROPIC_API_KEY) or Gemini (GEMINI_API_KEY) to turn the notice into structured fields.
import { body, only, guard, readUpload, extractJSON } from './_lib/util.js'

const INSTRUCTIONS = `You read Texas "Notice of Trustee's Sale" / "Notice of Substitute Trustee's Sale" documents filed in El Paso County.
Extract: {
 "sale_date": "YYYY-MM-DD", "sale_time_window": string, "sale_location": string,
 "property_address": string, "city": string, "zip": string, "legal_description": string,
 "grantors": [string], "mortgagee": string, "mortgage_servicer": string, "beneficiary": string,
 "trustees": [string], "deed_of_trust_date": "YYYY-MM-DD", "deed_of_trust_instrument": string,
 "original_loan_amount": number, "filing_date": "YYYY-MM-DD", "attorney_or_firm": string, "contact_phone": string,
 "notes": string }`

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const up = readUpload(body(req))
  if (up.error) return res.status(400).json({ error: up.error })
  try {
    const data = await extractJSON({ ...up, instructions: INSTRUCTIONS })
    res.status(200).json({ data })
  } catch (e) {
    if (e.code === 501) return res.status(501).json({ error: 'not_configured', needs: ['ANTHROPIC_API_KEY or GEMINI_API_KEY'] })
    console.error(e)
    res.status(502).json({ error: 'extract_failed', detail: String(e.message || e).slice(0, 300) })
  }
}
