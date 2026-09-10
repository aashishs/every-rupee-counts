import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PDFParse } from 'pdf-parse';
import { decryptSecret } from './secretCrypto.js';
import { isLikelyInvestmentMail } from './contractParsers.js';

const INVESTMENT_SEARCH_SINCE_DAYS = 90;

async function extractPdfText(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy?.();
    return result?.text || '';
  } catch {
    return '';
  }
}

export async function extractDocumentsFromParsedMail(parsed) {
  const docs = [];
  const subject = parsed.subject || '';
  const from = parsed.from?.text || '';
  const date = parsed.date ? parsed.date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const textBody = [parsed.text || '', parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '']
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

  const attachments = parsed.attachments || [];
  let attachmentDocs = 0;

  for (const att of attachments) {
    const name = att.filename || 'attachment';
    const lower = name.toLowerCase();
    const contentType = (att.contentType || '').toLowerCase();
    let text = '';

    if (contentType.includes('pdf') || lower.endsWith('.pdf')) {
      text = await extractPdfText(att.content);
    } else if (
      contentType.includes('text') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.html') ||
      lower.endsWith('.htm')
    ) {
      text = att.content.toString('utf8');
    }

    if (text && text.trim().length > 40) {
      docs.push({
        subject,
        from,
        date,
        messageId: parsed.messageId || null,
        filename: name,
        text,
        source: 'attachment',
      });
      attachmentDocs += 1;
    }
  }

  if (
    textBody.length > 80 &&
    (attachmentDocs === 0 || isLikelyInvestmentMail({ subject, from, text: textBody }))
  ) {
    docs.push({
      subject,
      from,
      date,
      messageId: parsed.messageId || null,
      filename: null,
      text: textBody,
      source: 'body',
    });
  }

  return docs;
}

export async function fetchInvestmentMails(accountRow, { limit = 40 } = {}) {
  const password = decryptSecret(accountRow);
  const client = new ImapFlow({
    host: accountRow.imap_host,
    port: accountRow.imap_port,
    secure: accountRow.imap_secure !== false,
    auth: {
      user: accountRow.username,
      pass: password,
    },
    logger: false,
  });

  const documents = [];
  let maxUid = Number(accountRow.last_uid || 0);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date();
      since.setDate(since.getDate() - INVESTMENT_SEARCH_SINCE_DAYS);

      // Broad OR search; filter further in JS
      const uids = await client.search({
        since,
      });

      const sorted = (uids || []).sort((a, b) => a - b);
      const candidates = sorted.filter((uid) => uid > Number(accountRow.last_uid || 0)).slice(-limit);

      for (const uid of candidates) {
        maxUid = Math.max(maxUid, uid);
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const subject = parsed.subject || '';
        const from = parsed.from?.text || '';
        const hasAttachment = (parsed.attachments || []).length > 0;
        const preview = parsed.text || '';

        if (!isLikelyInvestmentMail({ subject, from, text: preview, hasAttachment })) {
          continue;
        }

        const docs = await extractDocumentsFromParsedMail(parsed);
        for (const doc of docs) {
          documents.push({ ...doc, uid });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }

  return { documents, maxUid };
}

export async function extractTextFromUpload(file) {
  const name = file.originalname || 'upload';
  const lower = name.toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (mime.includes('pdf') || lower.endsWith('.pdf')) {
    return {
      text: await extractPdfText(file.buffer),
      filename: name,
      subject: `Uploaded: ${name}`,
      from: 'upload',
    };
  }

  if (lower.endsWith('.eml') || mime.includes('message/rfc822')) {
    const parsed = await simpleParser(file.buffer);
    const docs = await extractDocumentsFromParsedMail(parsed);
    return docs;
  }

  const text = file.buffer.toString('utf8');
  return {
    text,
    filename: name,
    subject: `Uploaded: ${name}`,
    from: 'upload',
  };
}

export const PROVIDER_PRESETS = {
  gmail: { host: 'imap.gmail.com', port: 993, secure: true, label: 'Gmail' },
  outlook: { host: 'outlook.office365.com', port: 993, secure: true, label: 'Outlook' },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993, secure: true, label: 'Yahoo' },
  zoho: { host: 'imap.zoho.com', port: 993, secure: true, label: 'Zoho' },
  icloud: { host: 'imap.mail.me.com', port: 993, secure: true, label: 'iCloud' },
  custom: { host: '', port: 993, secure: true, label: 'Custom IMAP' },
};
