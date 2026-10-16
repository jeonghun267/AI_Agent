import {scrypt, randomBytes, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {reject, AppError} from '../domain/errors.mjs';
import {newId, nowIso, randomToken, sha256} from '../domain/primitives.mjs';
import {cleanText, parseEmail, parsePassword} from '../domain/validation.mjs';

const derive = promisify(scrypt);
const DUMMY_SALT = '0'.repeat(32);
const hashPassword = async (password, salt) => (await derive(password, salt, 64)).toString('hex');

export function createAuthService({repos, config}) {
  const ttlMs = config.sessionTtlSeconds * 1000;

  function createSession(userId) {
    const token = randomToken(32);
    const csrf = randomToken(24);
    repos.sessions.insert({tokenHash: sha256(token), userId, csrf, expiresAt: Date.now() + ttlMs, createdAt: nowIso()});
    return {token, csrf, user: repos.users.findById(userId), maxAgeSeconds: config.sessionTtlSeconds};
  }

  // Creates the account only. signup() also signs the new user in.
  async function register(input) {
    const email = parseEmail(input.email);
    const password = parsePassword(input.password);
    const name = cleanText(input.name, 50) || email.split('@')[0];
    reject(repos.users.existsByEmail(email), '이미 가입한 이메일입니다. 로그인해 주세요.', 'email_taken', 409);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(password, salt);
    const id = newId();
    try {
      repos.users.insert({id, email, name, salt, passwordHash, createdAt: nowIso()});
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new AppError(409, 'email_taken', '이미 가입한 이메일입니다. 로그인해 주세요.');
      throw error;
    }
    return repos.users.findById(id);
  }

  async function signup(input) {
    const user = await register(input);
    return createSession(user.id);
  }

  // Always runs scrypt, even for unknown emails, so timing does not reveal accounts.
  async function login(input) {
    const email = cleanText(input.email, 200).toLowerCase();
    const credentials = repos.users.findCredentialsByEmail(email);
    const derived = await derive(String(input.password ?? '').slice(0, 200), credentials?.salt ?? DUMMY_SALT, 64);
    const valid = !!credentials && timingSafeEqual(derived, Buffer.from(credentials.passwordHash, 'hex'));
    reject(!valid, '이메일 또는 비밀번호를 확인하세요.', 'unauthorized', 401);
    return createSession(credentials.id);
  }

  // Returns the signed-in user for a cookie token, extending the session once
  // half of its lifetime has passed (renewed: true tells the route to reissue the cookie).
  function resolveSession(token) {
    if (!token) return null;
    const session = repos.sessions.find(sha256(token));
    if (!session) return null;
    const now = Date.now();
    const user = session.expiresAt > now ? repos.users.findById(session.userId) : null;
    if (!user) {
      repos.sessions.delete(session.tokenHash);
      return null;
    }
    const renewed = session.expiresAt - now < ttlMs / 2;
    if (renewed) repos.sessions.extend(session.tokenHash, now + ttlMs);
    return {user, csrf: session.csrf, renewed, maxAgeSeconds: config.sessionTtlSeconds};
  }

  function logout(token) {
    if (token) repos.sessions.delete(sha256(token));
  }

  async function verifyPassword(userId, password) {
    const credentials = repos.users.findCredentialsById(userId);
    if (!credentials) return false;
    const derived = await derive(String(password ?? '').slice(0, 200), credentials.salt, 64);
    return timingSafeEqual(derived, Buffer.from(credentials.passwordHash, 'hex'));
  }

  function cleanupExpiredSessions() {
    repos.sessions.deleteExpired(Date.now());
  }

  return {register, signup, login, resolveSession, logout, verifyPassword, cleanupExpiredSessions};
}
