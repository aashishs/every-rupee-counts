import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PDFParse } from 'pdf-parse';
import { decryptSecret } from './secretCrypto.js';
import { isLikelyInvestmentMail } from './contractParsers.js';

const INVESTMENT_SEARCH_SINCE_DAYS = 90;

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function extractPdfText(buffer) {
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
  const textBody = [parsed.text || '', stripHtml(parsed.html || '')]
    .filter(Boolean)
    .join('\n')
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
      contentType.includes('html') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.html') ||
      lower.endsWith('.htm')
    ) {
      const raw = att.content.toString('utf8');
      text = lower.endsWith('.html') || lower.endsWith('.htm') || contentType.includes('html')
        ? stripHtml(raw)
        : raw;
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

export async function testImapConnection(accountLike) {
  const password = accountLike.password || decryptSecret(accountLike);
  const client = new ImapFlow({
    host: accountLike.imap_host,
    port: Number(accountLike.imap_port || 993),
    secure: accountLike.imap_secure !== false,
    auth: {
      user: accountLike.username || accountLike.email_address,
      pass: password,
    },
    logger: false,
  });

  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    await client.logout();
    return {
      ok: true,
      messages: status.messages || 0,
      unseen: status.unseen || 0,
    };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      // ignore
    }
    const error = new Error(err.responseText || err.message || 'IMAP connection failed');
    error.status = 400;
    throw error;
  }
}

export async function fetchInvestmentMails(
  accountRow,
  { limit = 40, rescan = false, sinceDays = INVESTMENT_SEARCH_SINCE_DAYS } = {}
) {
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
  const lastUidFloor = rescan ? 0 : Number(accountRow.last_uid || 0);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date();
      since.setDate(since.getDate() - Number(sinceDays || INVESTMENT_SEARCH_SINCE_DAYS));

      const uids = await client.search({ since });
      const sorted = (uids || []).sort((a, b) => a - b);
      const candidates = sorted.filter((uid) => uid > lastUidFloor).slice(-limit);

      for (const uid of candidates) {
        maxUid = Math.max(maxUid, uid);
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const subject = parsed.subject || '';
        const from = parsed.from?.text || '';
        const hasAttachment = (parsed.attachments || []).length > 0;
        const preview = parsed.text || stripHtml(parsed.html || '');

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
    const text = await extractPdfText(file.buffer);
    return {
      text,
      filename: name,
      subject: `Uploaded contract: ${name}`,
      from: 'upload',
      date: new Date().toISOString().slice(0, 10),
      messageId: null,
    };
  }

  if (lower.endsWith('.eml') || mime.includes('message/rfc822')) {
    const parsed = await simpleParser(file.buffer);
    const docs = await extractDocumentsFromParsedMail(parsed);
    return docs.length
      ? docs
      : [{
          text: parsed.text || stripHtml(parsed.html || ''),
          filename: name,
          subject: parsed.subject || `Uploaded: ${name}`,
          from: parsed.from?.text || 'upload',
          date: parsed.date ? parsed.date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          messageId: parsed.messageId || null,
        }];
  }

  const raw = file.buffer.toString('utf8');
  const text =
    lower.endsWith('.html') || lower.endsWith('.htm') || mime.includes('html')
      ? stripHtml(raw)
      : raw;

  return {
    text,
    filename: name,
    subject: `Uploaded contract: ${name}`,
    from: 'upload',
    date: new Date().toISOString().slice(0, 10),
    messageId: null,
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
