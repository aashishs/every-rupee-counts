import crypto from 'crypto';

const ISIN_RE = /\b(IN[A-Z0-9]{10})\b/g;
const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s*([0-9,]+\.?[0-9]*)/i;

function parseNumber(value) {
  if (value == null) return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function detectBroker(text = '', from = '') {
  const blob = `${from} ${text}`.toLowerCase();
  const brokers = [
    ['zerodha', 'zerodha'],
    ['kite', 'zerodha'],
    ['groww', 'groww'],
    ['upstox', 'upstox'],
    ['angel one', 'angel one'],
    ['angelbroking', 'angel one'],
    ['icici direct', 'icici direct'],
    ['hdfc securities', 'hdfc securities'],
    ['kotak securities', 'kotak'],
    ['5paisa', '5paisa'],
    ['motilal', 'motilal oswal'],
    ['sharekhan', 'sharekhan'],
    ['cams', 'cams'],
    ['kfintech', 'kfintech'],
    ['karvy', 'kfintech'],
    ['nsdl', 'nsdl'],
    ['cdsl', 'cdsl'],
  ];
  for (const [needle, name] of brokers) {
    if (blob.includes(needle)) return name;
  }
  return 'unknown';
}

function detectDocumentType(text = '', subject = '', filename = '') {
  const blob = `${subject} ${filename} ${text}`.toLowerCase();
  if (/(contract\s*note|digitally signed contract|trade confirmation)/i.test(blob)) {
    return 'contract_note';
  }
  if (/(consolidated account statement|\bcas\b|mutual fund statement|folio)/i.test(blob)) {
    return 'mf_cas';
  }
  if (/(tradebook|trade book|order history)/i.test(blob)) return 'tradebook';
  if (/(sip confirmation|sip instalment|systematic investment)/i.test(blob)) return 'mf_sip';
  if (/(equity|nse|bse|isin|buy|sell).{0,40}(qty|quantity|units)/is.test(blob)) {
    return 'contract_note';
  }
  return 'unknown';
}

function fingerprintTrade(userId, trade) {
  const key = [
    userId,
    trade.trade_date,
    trade.side,
    trade.symbol || '',
    trade.isin || '',
    trade.name,
    trade.quantity,
    trade.price,
    trade.amount,
    trade.broker || '',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
}

function fingerprintMessage({ messageId, subject, from, attachmentName, contentHash }) {
  const key = [messageId || '', subject || '', from || '', attachmentName || '', contentHash || ''].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 40);
}

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
}

function inferAssetType(name = '', isin = '', hint = '') {
  const blob = `${name} ${isin} ${hint}`.toLowerCase();
  if (/mutual|growth|direct plan|regular plan|folio|nav|\bmf\b|sip/.test(blob)) return 'mutual_fund';
  if (/etf/.test(blob)) return 'etf';
  return 'stock';
}

function portfolioType(assetType) {
  if (assetType === 'mutual_fund') return 'Mutual Funds';
  if (assetType === 'etf') return 'Stocks';
  return 'Stocks';
}

/**
 * Parse Zerodha / generic Indian equity contract note text.
 * Looks for lines like:
 * BUY RELIANCE 10 2450.50 NSE INE002A01018
 * or tabular "Buy/Sell Symbol Qty Price Amount"
 */
export function parseContractNote(text, meta = {}) {
  const trades = [];
  const broker = detectBroker(text, meta.from);
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const tradeDate =
    normalizeDate(
      (text.match(/(?:Trade\s*Date|Contract\s*Date|Settlement\s*Date|Date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i) || [])[1]
    ) || meta.date || new Date().toISOString().slice(0, 10);

  const linePatterns = [
    /^(BUY|SELL|B|S)\s+([A-Z0-9&\-.]+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s+(NSE|BSE))?(?:\s+(IN[A-Z0-9]{10}))?/i,
    /^(BUY|SELL)\s+(.+?)\s+Qty[:\s]+(\d+(?:\.\d+)?)\s+(?:Price|Rate)[:\s]+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(?:Amount|Value)[:\s]+(\d+(?:,\d{3})*(?:\.\d+)?)/i,
  ];

  for (const line of lines) {
    for (const re of linePatterns) {
      const m = line.match(re);
      if (!m) continue;
      const sideRaw = m[1].toUpperCase();
      const side = sideRaw === 'S' || sideRaw === 'SELL' ? 'sell' : 'buy';
      const symbolOrName = m[2].trim();
      const qty = parseNumber(m[3]);
      const price = parseNumber(m[4]);
      const amount = parseNumber(m[5]) || qty * price;
      const exchange = m[6] || null;
      const isin = m[7] || (line.match(ISIN_RE) || [])[0] || null;
      trades.push({
        trade_date: tradeDate,
        side,
        asset_type: 'stock',
        name: symbolOrName,
        symbol: /^[A-Z0-9&\-.]+$/.test(symbolOrName) ? symbolOrName : null,
        isin,
        quantity: qty,
        price,
        amount,
        charges: 0,
        broker,
        exchange,
        notes: 'Imported from contract note',
      });
      break;
    }
  }

  // Fallback: ISIN + buy/sell nearby blocks
  if (!trades.length) {
    const blocks = text.split(/(?=(?:BUY|SELL)\b)/i);
    for (const block of blocks.slice(0, 40)) {
      const sideMatch = block.match(/\b(BUY|SELL)\b/i);
      if (!sideMatch) continue;
      const isin = (block.match(ISIN_RE) || [])[0];
      const qtyMatch = block.match(/(?:Qty|Quantity|Units)\s*[:\-]?\s*([0-9,]+\.?\d*)/i);
      const priceMatch = block.match(/(?:Price|Rate|Avg\.?\s*Price)\s*[:\-]?\s*([0-9,]+\.?\d*)/i);
      const amountMatch = block.match(/(?:Amount|Value|Net\s*Total)\s*[:\-]?\s*(?:₹|Rs\.?)?\s*([0-9,]+\.?\d*)/i);
      const nameMatch = block.match(/(?:Security|Scrip|Symbol|Company)\s*[:\-]?\s*([A-Za-z0-9 &\-.]+)/i);
      if (!qtyMatch && !amountMatch) continue;
      const quantity = parseNumber(qtyMatch?.[1]);
      const price = parseNumber(priceMatch?.[1]);
      const amount = parseNumber(amountMatch?.[1]) || quantity * price;
      if (!quantity && !amount) continue;
      trades.push({
        trade_date: tradeDate,
        side: sideMatch[1].toLowerCase() === 'sell' ? 'sell' : 'buy',
        asset_type: 'stock',
        name: (nameMatch?.[1] || isin || 'Equity trade').trim(),
        symbol: nameMatch?.[1]?.trim().match(/^[A-Z0-9&\-.]+$/) ? nameMatch[1].trim() : null,
        isin: isin || null,
        quantity: quantity || (price ? amount / price : 0),
        price: price || (quantity ? amount / quantity : 0),
        amount,
        charges: 0,
        broker,
        exchange: null,
        notes: 'Imported from contract note',
      });
    }
  }

  // Groww / Upstox / Angel confirmation style single-line blocks
  if (!trades.length) {
    const growwLike =
      /(?:Bought|Sold|BUY|SELL)\s+([A-Z0-9&\-.]+)\s+(?:x|×)?\s*(\d+(?:\.\d+)?)\s*(?:shares?|qty)?\s*(?:@|at|for)?\s*(?:₹|Rs\.?)?\s*([0-9,]+\.?\d*)/gi;
    let gm;
    while ((gm = growwLike.exec(text)) !== null) {
      const side = /sell|sold/i.test(gm[0]) ? 'sell' : 'buy';
      const qty = parseNumber(gm[2]);
      const price = parseNumber(gm[3]);
      trades.push({
        trade_date: tradeDate,
        side,
        asset_type: 'stock',
        name: gm[1],
        symbol: gm[1],
        isin: null,
        quantity: qty,
        price,
        amount: qty * price,
        charges: 0,
        broker,
        exchange: null,
        notes: 'Imported from trade confirmation',
      });
    }
  }

  return {
    document_type: 'contract_note',
    broker,
    trades,
  };
}

/**
 * Parse CAMS / KFintech style mutual fund CAS text.
 */
export function parseMutualFundCas(text, meta = {}) {
  const trades = [];
  const broker = detectBroker(text, meta.from) || 'cams';
  const chunks = String(text).split(/(?=Folio\s*No\.?\s*[:\-]?)/i);

  for (const chunk of chunks) {
    const folio = (chunk.match(/Folio\s*No\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i) || [])[1];
    const scheme =
      (chunk.match(/(?:Scheme|Fund)\s*[:\-]?\s*([^\n]{5,120})/i) || [])[1]?.trim() ||
      (chunk.match(/([A-Za-z][A-Za-z0-9 &\-().]{8,80}(?:Fund|Growth|Direct|Regular)[^\n]*)/) || [])[1]?.trim();
    const isin = (chunk.match(ISIN_RE) || [])[0] || null;
    if (!scheme && !isin) continue;

    const txnRe =
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(Purchase|SIP|Redeem(?:ption)?|Switch\s*In|Switch\s*Out|Dividend(?:\s*Reinvest)?)\s+.*?([0-9,]+\.?\d*)\s+([0-9,]+\.?\d*)\s+([0-9,]+\.?\d*)/gi;

    let m;
    while ((m = txnRe.exec(chunk)) !== null) {
      const sideRaw = m[2].toLowerCase();
      let side = 'other';
      if (sideRaw.includes('purchase') || sideRaw === 'sip') side = sideRaw === 'sip' ? 'sip' : 'buy';
      else if (sideRaw.includes('redeem')) side = 'sell';
      else if (sideRaw.includes('switch in')) side = 'switch_in';
      else if (sideRaw.includes('switch out')) side = 'switch_out';
      else if (sideRaw.includes('dividend')) side = 'dividend';

      const amount = parseNumber(m[3]);
      const price = parseNumber(m[4]); // NAV
      const quantity = parseNumber(m[5]); // units
      trades.push({
        trade_date: normalizeDate(m[1]),
        side,
        asset_type: 'mutual_fund',
        name: scheme || isin || 'Mutual Fund',
        symbol: folio || null,
        isin,
        quantity,
        price,
        amount: amount || quantity * price,
        charges: 0,
        broker,
        exchange: null,
        notes: folio ? `Folio ${folio}` : 'Imported from MF CAS',
      });
    }
  }

  // Email SIP confirmation fallback
  if (!trades.length) {
    const sipAmount = parseNumber((text.match(AMOUNT_RE) || [])[1]);
    const fundName =
      (text.match(/(?:scheme|fund)\s*[:\-]?\s*([^\n]{5,100})/i) || [])[1]?.trim() ||
      (text.match(/in\s+([A-Za-z][A-Za-z0-9 &\-().]{8,80}Fund[^\n]*)/i) || [])[1]?.trim();
    if (fundName && sipAmount > 0) {
      trades.push({
        trade_date: meta.date || new Date().toISOString().slice(0, 10),
        side: 'sip',
        asset_type: 'mutual_fund',
        name: fundName,
        symbol: null,
        isin: (text.match(ISIN_RE) || [])[0] || null,
        quantity: 0,
        price: 0,
        amount: sipAmount,
        charges: 0,
        broker,
        exchange: null,
        notes: 'Imported from SIP confirmation email',
      });
    }
  }

  return {
    document_type: 'mf_cas',
    broker,
    trades,
  };
}

export function parseInvestmentDocument(text, meta = {}) {
  const subject = meta.subject || '';
  const filename = meta.filename || '';
  const docType = detectDocumentType(text, subject, filename);
  let parsed;
  if (docType === 'mf_cas' || docType === 'mf_sip') {
    parsed = parseMutualFundCas(text, meta);
  } else {
    parsed = parseContractNote(text, meta);
    if (!parsed.trades.length) {
      const mf = parseMutualFundCas(text, meta);
      if (mf.trades.length) parsed = mf;
    }
  }

  parsed.document_type = parsed.trades.length
    ? parsed.document_type || docType
    : docType;
  parsed.broker = parsed.broker || detectBroker(text, meta.from);
  return parsed;
}

export function isLikelyInvestmentMail({ subject = '', from = '', text = '', hasAttachment = false }) {
  const blob = `${subject} ${from} ${text.slice(0, 2000)}`.toLowerCase();
  const keywords = [
    'contract note',
    'digitally signed',
    'trade confirmation',
    'cams',
    'kfintech',
    'consolidated account statement',
    'mutual fund',
    'sip confirmation',
    'folio',
    'zerodha',
    'groww',
    'upstox',
    'angel one',
    'nse',
    'bse',
    'isin',
  ];
  const hit = keywords.some((k) => blob.includes(k));
  return hit || (hasAttachment && /(contract|cas|statement|trade)/i.test(subject));
}

export {
  detectBroker,
  detectDocumentType,
  fingerprintTrade,
  fingerprintMessage,
  contentHash,
  inferAssetType,
  portfolioType,
  parseNumber,
  normalizeDate,
};
