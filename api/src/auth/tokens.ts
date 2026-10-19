import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes as URL-safe text: unguessable, so it can act as a password for one click. */
export const newToken = () => randomBytes(32).toString('base64url');

/** We store only this hash, so a database leak doesn't hand out working links or sessions. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
