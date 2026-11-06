/**
 * I AM Real Estate · lead receiver (Google Apps Script web app)
 * 1. Create a Google Sheet, Extensions > Apps Script, paste this file.
 * 2. Edit DEPARTMENTS emails.
 * 3. Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 * 4. Copy the /exec URL into src/config.js LEAD_ENDPOINT.
 */
const DEPARTMENTS = {
  cash_offer: 'info@iamrealestate.co', // Selling
  buyer: 'info@iamrealestate.co',      // Buying
  investor: 'info@iamrealestate.co',   // Investor Relations
  management: 'info@iamrealestate.co', // Property Management
  rental: 'info@iamrealestate.co',     // Leasing
  contact: 'info@iamrealestate.co',
  chat: 'info@iamrealestate.co',
};
const TAB_NAMES = {
  cash_offer: 'Cash offers', buyer: 'Buyers', investor: 'Investors', management: 'Management',
  rental: 'Rentals', contact: 'Contact', chat: 'Assistant',
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const type = data.type in TAB_NAMES ? data.type : 'contact';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TAB_NAMES[type]) || ss.insertSheet(TAB_NAMES[type]);

    // Header row grows automatically with any new field
    let headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    if (!headers.length) headers = ['receivedAt'];
    Object.keys(data).forEach(k => { if (headers.indexOf(k) === -1) headers.push(k); });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    const row = headers.map(h => h === 'receivedAt' ? new Date() : (data[h] !== undefined ? data[h] : ''));
    sheet.appendRow(row);

    const to = DEPARTMENTS[type];
    if (to) {
      const lines = Object.keys(data).map(k => k + ': ' + data[k]).join('\n');
      MailApp.sendEmail({
        to: to,
        subject: 'New ' + TAB_NAMES[type] + ' lead · ' + (data.name || 'website') + (data.lang === 'es' ? ' (ES)' : ''),
        body: 'New lead from the website.\n\n' + lines + '\n\nOpen the sheet: ' + ss.getUrl(),
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('IAM lead endpoint is running');
}
