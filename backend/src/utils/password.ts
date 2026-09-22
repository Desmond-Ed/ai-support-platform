import bcrypt from 'bcrypt';

/**
 * Bcrypt cost factor. 10 is bcrypt's own default; 12 roughly doubles the
 * hashing work (~250-300ms on typical hardware) for meaningfully better
 * resistance to offline brute-force as GPUs get faster, while staying
 * well under a latency budget a login endpoint can absorb. Revisit if
 * p95 login latency ever becomes a real concern — this is a security/UX
 * trade-off, not a magic number.
 */
const BCRYPT_COST_FACTOR = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}