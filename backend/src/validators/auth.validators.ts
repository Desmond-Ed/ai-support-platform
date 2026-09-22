import { z } from 'zod';

/**
 * Self-registration is CUSTOMER-only by design — this schema has no
 * `role` field, and never will. Accepting a client-supplied role here
 * would let anyone register as ADMIN. AGENT/ADMIN accounts are
 * provisioned out-of-band (seed script for now; Phase 9's admin
 * dashboard adds a proper admin-only user-management endpoint).
 */

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Must be a valid email address')
    .max(255),
  // Bcrypt silently truncates input beyond 72 bytes — capping here
  // means the constraint is visible and enforced, not a silent foot_gun.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  name: z.string().trim().min(1).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // No min/max on login — we're checking a password the user already
  // has, not enforcing policy on it. Reject on mismatch, not on shape.
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;