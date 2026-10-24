const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const unhex = str => Uint8Array.from(str.match(/../g) || [], h => parseInt(h, 16));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
}
export async function hashPassword(password) {
  // Web Crypto on Workers supports at most 100,000 PBKDF2 iterations.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$100000$${hex(salt)}$${hex(await derive(password, salt, 100000))}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, count, salt, expected] = stored.split('$');
  if (algorithm !== 'pbkdf2-sha256' || count !== '100000' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const actual = await derive(password, unhex(salt), Number(count));
  const target = unhex(expected);
  let difference = actual.length ^ target.length;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ target[i];
  return difference === 0;
}
export function sessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map(c => c.trim()).find(c => c.startsWith('saints_creditos_session='))?.split('=')[1];
}
export function sessionCookie(request, token, maxAge = 604800) {
  return `saints_creditos_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
