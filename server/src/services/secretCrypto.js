import crypto from 'crypto';
import { config } from '../config/index.js';

const KEY = crypto.scryptSync(config.jwtSecret, 'erc-mail-secrets-v1', 32);

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    password_enc: encrypted.toString('base64'),
    password_iv: iv.toString('hex'),
    password_tag: tag.toString('hex'),
  };
}

export function decryptSecret({ password_enc, password_iv, password_tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(password_iv, 'hex'));
  decipher.setAuthTag(Buffer.from(password_tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(password_enc, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
