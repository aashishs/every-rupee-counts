import { Router } from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { encryptSecret } from '../services/secretCrypto.js';
import {
  PROVIDER_PRESETS,
  fetchInvestmentMails,
  extractTextFromUpload,
  extractDocumentsFromParsedMail,
} from '../services/mailFetcher.js';
import {
  parseInvestmentDocument,
  fingerprintMessage,
  contentHash,
  isLikelyInvestmentMail,
} from '../services/contractParsers.js';
import {
  importTrades,
  sampleContractNoteText,
  sampleMutualFundCasText,
} from '../services/portfolioImport.js';
import { simpleParser } from 'mailparser';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 5 },
});

const router = Router();
router.use(authenticate);

async function processDocument(userId, doc, { source, emailAccountId = null }) {
  const hash = contentHash(doc.text);
  const fp = fingerprintMessage({
    messageId: doc.messageId,
    subject: doc.subject,
    from: doc.from,
    attachmentName: doc.filename,
    contentHash: hash,
  });

  const existing = await query(
    `SELECT id, status, trades_imported FROM mail_import_jobs
     WHERE user_id = $1 AND fingerprint = $2 LIMIT 1`,
    [userId, fp]
  );
  if (existing.rows[0]) {
    return {
      skipped: true,
      job: existing.rows[0],
      reason: 'Already imported',
    };
  }

  const jobRes = await query(
    `INSERT INTO mail_import_jobs
      (user_id, email_account_id, source, status, subject, from_address, message_id,
       fingerprint, attachment_name, raw_excerpt)
     VALUES ($1,$2,$3,'processing',$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      userId,
      emailAccountId,
      source,
      doc.subject || null,
      doc.from || null,
      doc.messageId || null,
      fp,
      doc.filename || null,
      String(doc.text || '').slice(0, 1500),
    ]
  );
  const job = jobRes.rows[0];

  try {
    const parsed = parseInvestmentDocument(doc.text, {
      subject: doc.subject,
      from: doc.from,
      filename: doc.filename,
      date: doc.date,
    });

    if (!parsed.trades.length) {
      await query(
        `UPDATE mail_import_jobs
         SET status = 'no_trades', document_type = $1, broker = $2, trades_found = 0,
             completed_at = NOW(), error_message = 'No stock/MF trades detected'
         WHERE id = $3`,
        [parsed.document_type, parsed.broker, job.id]
      );
      return {
        skipped: false,
        job: { ...job, status: 'no_trades', trades_found: 0, trades_imported: 0 },
        trades: [],
      };
    }

    const result = await importTrades(userId, parsed.trades, { importJobId: job.id });
    await query(
      `UPDATE mail_import_jobs
       SET status = 'imported', document_type = $1, broker = $2,
           trades_found = $3, trades_imported = $4, completed_at = NOW(),
           meta = $5::jsonb
       WHERE id = $6`,
      [
        parsed.document_type,
        parsed.broker,
        parsed.trades.length,
        result.imported,
        JSON.stringify({ skipped: result.skipped }),
        job.id,
      ]
    );

    return {
      skipped: false,
      job: {
        ...job,
        status: 'imported',
        document_type: parsed.document_type,
        broker: parsed.broker,
        trades_found: parsed.trades.length,
        trades_imported: result.imported,
      },
      trades: result.transactions,
    };
  } catch (err) {
    await query(
      `UPDATE mail_import_jobs
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [err.message, job.id]
    );
    throw err;
  }
}

router.get(
  '/providers',
  asyncHandler(async (_req, res) => {
    res.json({
      providers: Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
        id,
        label: p.label,
        host: p.host,
        port: p.port,
        secure: p.secure,
      })),
      tips: {
        gmail:
          'Enable 2-Step Verification, create an App Password, then use imap.gmail.com with that app password.',
        outlook: 'Use your Outlook email and an app password / IMAP-enabled password.',
        custom: 'Any IMAP mailbox works — Gmail, Yahoo, Zoho, corporate mail, etc.',
      },
    });
  })
);

router.get(
  '/accounts',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, label, provider, email_address, imap_host, imap_port, imap_secure,
              username, last_synced_at, last_uid, is_active, created_at, updated_at
       FROM email_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ accounts: result.rows });
  })
);

router.post(
  '/accounts',
  [
    body('email_address').isEmail(),
    body('password').isLength({ min: 4 }),
    body('provider').optional().isString(),
    body('imap_host').optional().isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const provider = (req.body.provider || 'gmail').toLowerCase();
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
    const host = req.body.imap_host || preset.host;
    const port = Number(req.body.imap_port || preset.port || 993);
    const secure = req.body.imap_secure !== false && req.body.imap_secure !== 'false';
    const username = req.body.username || req.body.email_address;
    const label = req.body.label || preset.label || provider;

    if (!host) {
      return res.status(400).json({ error: 'IMAP host is required for custom providers' });
    }

    const enc = encryptSecret(req.body.password);
    const result = await query(
      `INSERT INTO email_accounts
        (user_id, label, provider, email_address, imap_host, imap_port, imap_secure,
         username, password_enc, password_iv, password_tag)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, label, provider, email_address, imap_host, imap_port, imap_secure,
                 username, last_synced_at, is_active, created_at`,
      [
        req.user.id,
        label,
        provider,
        req.body.email_address,
        host,
        port,
        secure,
        username,
        enc.password_enc,
        enc.password_iv,
        enc.password_tag,
      ]
    );

    res.status(201).json({ account: result.rows[0] });
  })
);

router.delete(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE email_accounts SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true });
  })
);

router.post(
  '/accounts/:id/sync',
  asyncHandler(async (req, res) => {
    const accountRes = await query(
      `SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
      [req.params.id, req.user.id]
    );
    const account = accountRes.rows[0];
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const { documents, maxUid } = await fetchInvestmentMails(account, {
      limit: Number(req.body?.limit || 40),
    });

    const results = [];
    for (const doc of documents) {
      const outcome = await processDocument(req.user.id, doc, {
        source: 'imap',
        emailAccountId: account.id,
      });
      results.push(outcome);
    }

    await query(
      `UPDATE email_accounts
       SET last_synced_at = NOW(), last_uid = GREATEST(last_uid, $1), updated_at = NOW()
       WHERE id = $2`,
      [maxUid, account.id]
    );

    const imported = results.filter((r) => r.job?.status === 'imported').length;
    const trades = results.reduce((s, r) => s + Number(r.job?.trades_imported || 0), 0);

    res.json({
      scannedDocuments: documents.length,
      jobs: results.map((r) => r.job),
      importedJobs: imported,
      tradesImported: trades,
    });
  })
);

router.post(
  '/upload',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    const results = [];
    for (const file of files) {
      const extracted = await extractTextFromUpload(file);
      const docs = Array.isArray(extracted) ? extracted : [extracted];
      for (const doc of docs) {
        if (!doc?.text || doc.text.trim().length < 20) continue;
        const outcome = await processDocument(req.user.id, doc, { source: 'upload' });
        results.push(outcome);
      }
    }

    res.json({
      jobs: results.map((r) => r.job),
      importedJobs: results.filter((r) => r.job?.status === 'imported').length,
      tradesImported: results.reduce((s, r) => s + Number(r.job?.trades_imported || 0), 0),
    });
  })
);

router.post(
  '/paste',
  [body('text').isString().isLength({ min: 40 })],
  validate,
  asyncHandler(async (req, res) => {
    const doc = {
      text: req.body.text,
      subject: req.body.subject || 'Pasted contract note / statement',
      from: req.body.from || 'paste',
      filename: req.body.filename || null,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      messageId: null,
    };

    if (
      !isLikelyInvestmentMail({
        subject: doc.subject,
        from: doc.from,
        text: doc.text,
      }) &&
      !req.body.force
    ) {
      // Still try parsing — user explicitly pasted
    }

    const outcome = await processDocument(req.user.id, doc, { source: 'paste' });
    res.json(outcome);
  })
);

router.post(
  '/demo',
  asyncHandler(async (req, res) => {
    const kind = (req.body?.kind || 'both').toLowerCase();
    const docs = [];
    if (kind === 'stocks' || kind === 'both') {
      docs.push({
        text: sampleContractNoteText(),
        subject: 'Digitally Signed Contract Note - Zerodha',
        from: 'noreply@zerodha.com',
        filename: 'contract-note-sample.txt',
        date: '2026-09-05',
        messageId: `demo-cn-${req.user.id}-${Date.now()}`,
      });
    }
    if (kind === 'mf' || kind === 'both') {
      docs.push({
        text: sampleMutualFundCasText(),
        subject: 'CAMS Consolidated Account Statement',
        from: 'donotreply@camsonline.com',
        filename: 'cas-sample.txt',
        date: '2026-09-05',
        messageId: `demo-cas-${req.user.id}-${Date.now()}`,
      });
    }

    const results = [];
    for (const doc of docs) {
      results.push(await processDocument(req.user.id, doc, { source: 'demo' }));
    }

    res.json({
      jobs: results.map((r) => r.job),
      importedJobs: results.filter((r) => r.job?.status === 'imported').length,
      tradesImported: results.reduce((s, r) => s + Number(r.job?.trades_imported || 0), 0),
      transactions: results.flatMap((r) => r.trades || []),
    });
  })
);

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, source, status, subject, from_address, document_type, broker,
              attachment_name, trades_found, trades_imported, error_message, created_at, completed_at
       FROM mail_import_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ jobs: result.rows });
  })
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM investment_transactions
       WHERE user_id = $1
       ORDER BY trade_date DESC, created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ transactions: result.rows });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [overview, byAsset, byBroker, recentTx, jobs] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS trade_count,
           COALESCE(SUM(CASE WHEN side IN ('buy','sip','switch_in') THEN amount ELSE 0 END),0) AS buy_amount,
           COALESCE(SUM(CASE WHEN side IN ('sell','switch_out') THEN amount ELSE 0 END),0) AS sell_amount,
           COUNT(DISTINCT COALESCE(isin, symbol, name))::int AS holdings_touched
         FROM investment_transactions WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT asset_type, COUNT(*)::int AS trades, COALESCE(SUM(amount),0) AS amount
         FROM investment_transactions WHERE user_id = $1
         GROUP BY asset_type ORDER BY amount DESC`,
        [userId]
      ),
      query(
        `SELECT COALESCE(broker,'unknown') AS broker, COUNT(*)::int AS trades, COALESCE(SUM(amount),0) AS amount
         FROM investment_transactions WHERE user_id = $1
         GROUP BY COALESCE(broker,'unknown') ORDER BY trades DESC`,
        [userId]
      ),
      query(
        `SELECT * FROM investment_transactions
         WHERE user_id = $1
         ORDER BY trade_date DESC, created_at DESC LIMIT 8`,
        [userId]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'imported')::int AS imported_jobs,
           COUNT(*)::int AS total_jobs,
           COALESCE(SUM(trades_imported),0)::int AS trades_imported
         FROM mail_import_jobs WHERE user_id = $1`,
        [userId]
      ),
    ]);

    res.json({
      overview: {
        tradeCount: overview.rows[0].trade_count,
        buyAmount: Number(overview.rows[0].buy_amount),
        sellAmount: Number(overview.rows[0].sell_amount),
        holdingsTouched: overview.rows[0].holdings_touched,
        importedJobs: jobs.rows[0].imported_jobs,
        totalJobs: jobs.rows[0].total_jobs,
        tradesImported: jobs.rows[0].trades_imported,
      },
      byAsset: byAsset.rows,
      byBroker: byBroker.rows,
      recentTransactions: recentTx.rows,
    });
  })
);

// Parse .eml without saving — preview helper
router.post(
  '/preview-eml',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'EML file required' });
    const parsed = await simpleParser(req.file.buffer);
    const docs = await extractDocumentsFromParsedMail(parsed);
    const previews = docs.map((d) => {
      const parsedDoc = parseInvestmentDocument(d.text, d);
      return {
        subject: d.subject,
        from: d.from,
        filename: d.filename,
        document_type: parsedDoc.document_type,
        broker: parsedDoc.broker,
        trades: parsedDoc.trades,
      };
    });
    res.json({ previews });
  })
);

export default router;
