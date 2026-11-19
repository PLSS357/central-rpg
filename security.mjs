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
