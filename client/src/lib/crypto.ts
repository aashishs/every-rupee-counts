import CryptoJS from 'crypto-js';

const DEVICE_KEY = 'erc_device_id';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function deriveKey(passwordOrToken: string, salt: string) {
  return CryptoJS.PBKDF2(passwordOrToken, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  }).toString();
}

export function encryptPayload(data: unknown, key: string) {
  const iv = CryptoJS.lib.WordArray.random(16).toString();
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key + iv);
  return {
    encrypted_payload: encrypted.toString(),
    iv,
    checksum: CryptoJS.SHA256(encrypted.toString()).toString(),
  };
}

export function decryptPayload(encrypted_payload: string, iv: string, key: string) {
  const decrypted = CryptoJS.AES.decrypt(encrypted_payload, key + iv);
  const text = decrypted.toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error('Failed to decrypt payload');
  return JSON.parse(text);
}
