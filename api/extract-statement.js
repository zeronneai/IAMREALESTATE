// POST /api/extract-statement  { file: dataURL (mortgage statement PDF or photo) }
import { body, only, guard, readUpload, extractJSON } from './_lib/util.js'

const INSTRUCTIONS = `You read US residential mortgage statements. Extract: {
 "lender": string, "servicer": string, "loan_number_last4": string, "property_address": string,
 "statement_date": "YYYY-MM-DD", "payment_due_date": "YYYY-MM-DD", "amount_due": number,
 "principal_and_interest": number, "escrow": number, "principal_balance": number, "interest_rate": number,
 "late_fee": number, "late_after_date": "YYYY-MM-DD", "escrow_balance": number, "past_due_amount": number }
Only keep the LAST 4 digits of any loan or account number.`

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const up = readUpload(body(req))
  if (up.error) return res.status(400).json({ error: up.error })
  try {
    const data = await extractJSON({ ...up, instructions: INSTRUCTIONS })
    if (data && data.loan_number_last4) data.loan_number_last4 = String(data.loan_number_last4).replace(/\D/g, '').slice(-4)
    res.status(200).json({ data })
  } catch (e) {
    if (e.code === 501) return res.status(501).json({ error: 'not_configured', needs: ['ANTHROPIC_API_KEY or GEMINI_API_KEY'] })
    console.error(e)
    res.status(502).json({ error: 'extract_failed', detail: String(e.message || e).slice(0, 300) })
  }
}
