import {createHash, randomBytes, randomUUID} from 'node:crypto';

export const newId = () => randomUUID();
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const nowIso = () => new Date().toISOString();
export const todayIso = () => nowIso().slice(0, 10);
