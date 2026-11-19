import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const token = () => randomBytes(32).toString('hex');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
const dummy = hashPassword(token());
export function validPassword(password, hash) {
  const reference = hash || dummy;
  const result = hashPassword(password, reference.split(':')[0]);
  return timingSafeEqual(Buffer.from(result), Buffer.from(reference)) && Boolean(hash);
}
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function string(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Verifique os campos preenchidos.');
  return value.trim();
}
export function parseUpload(file) {
  const name = string(file.name, 120).replace(/[\x00-\x1f/\\]/g, '_');
  const encoded = string(file.data, 2_800_000);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail(400, 'Anexo inválido.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 2_000_000) fail(400, 'Cada anexo deve ter até 2 MB.');
  const hex = bytes.subarray(0, 8).toString('hex');
  const mime = hex === '89504e470d0a1a0a' ? 'image/png'
    : hex.startsWith('ffd8ff') ? 'image/jpeg'
    : hex.startsWith('255044462d') ? 'application/pdf'
    : !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/u.test(bytes.toString('utf8')) && name.toLowerCase().endsWith('.txt') ? 'text/plain' : '';
  if (!mime) fail(400, 'Envie PNG, JPEG, PDF ou TXT.');
  return { name, bytes, mime };
}

