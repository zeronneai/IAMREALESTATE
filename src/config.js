// ============================================================
// SITE CONFIG · EDIT WITH IAM'S REAL NUMBERS BEFORE LAUNCH
// ============================================================

// Google Apps Script web app URL (Deploy > New deployment > Web app).
// Leave empty to run in demo mode (leads stay in the browser console).
export const LEAD_ENDPOINT = ''

// Assistant: set to true once /api/chat has ANTHROPIC_API_KEY or GEMINI_API_KEY in Vercel.
// When false, or when the API fails, the assistant uses the scripted bilingual flow.
export const CHAT_USE_LLM = true

export const PHONES = {
  main: { label: '855 305 2048', tel: '+18553052048' },
  buy: { label: '915 268 0716', tel: '+19152680716' },
  sell: { label: '915 348 3560', tel: '+19153483560' },
  manage: { label: '915 465 3384', tel: '+19154653384' },
  invest: { label: '855 305 2048', tel: '+18553052048' },
}

// Cash offer vs listing assumptions (EDIT WITH IAM'S REAL NUMBERS).
// All values are placeholders based on general El Paso market ranges.
export const OFFER = {
  arvPerSqft: 172,          // typical updated El Paso resale $/sq ft (ARV)
  minSqftPrice: 95,         // floor so tiny inputs do not produce silly numbers
  conditions: {
    //        listFactor: market price vs ARV as-is   repairPerSqft: rehab investor budgets   sellerPrep: prep a seller spends to list
    ready: { listFactor: 1.00, repairPerSqft: 4,  sellerPrep: 1500 },
    light: { listFactor: 0.95, repairPerSqft: 14, sellerPrep: 6000 },
    needs: { listFactor: 0.86, repairPerSqft: 32, sellerPrep: 14000 },
    major: { listFactor: 0.74, repairPerSqft: 58, sellerPrep: 26000 },
  },
  investorPctOfArv: 0.75,   // cash offer formula: ARV x pct minus repairs
  rangeSpread: 0.04,        // +/- spread shown on estimates
  commissionPct: 0.06,      // total agent commission on listing route
  sellerClosingPct: 0.02,   // title, escrow, fees on listing route
  monthlyHoldingPct: 0.0075,// taxes, insurance, utilities per month while listed
  listDays: [60, 95],       // typical days to close listing route
  cashDays: [7, 21],        // typical days to close cash route
}
