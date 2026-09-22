const DURATION_UNITS_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

/**
 * Parses a duration string in the canonical form the env schema
 * validates (`15m`, `7d`, `1h`, etc.) into milliseconds.
 *
 * Deliberately re-implements rather than reusing the `ms` package that
 * `jsonwebtoken` pulls in transitively: `ms` accepts a wider grammar
 * (`1.5h`, `2 days`, `-3m`) than our env regex does, and the whole
 * point of validating at boot is knowing everything reaching this
 * function is already in canonical form. If the two ever drift, this
 * throws rather than silently accepting something env.ts rejected.
 */
export function parseDuration(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration string: ${duration}`);
  }
  const [, value, unit] = match;
  return Number(value) * DURATION_UNITS_MS[unit];
}

/**
 * Returns the absolute expiry Date for a token issued now.
 * `from` is injectable for tests; production callers omit it.
 */
export function getExpiryDate(duration: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + parseDuration(duration));
}