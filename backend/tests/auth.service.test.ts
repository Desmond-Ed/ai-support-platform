import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../src/generated/prisma/client.js';

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  userRepository: {
    existsByEmail: vi.fn(),
    create: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
  },
  refreshTokenRepository: {
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    revoke: vi.fn(),
    revokeIfActive: vi.fn(),
    revokeAllForUser: vi.fn(),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  hashToken: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/config/db.js', () => ({ prisma: mocks.prisma }));
vi.mock('../src/config/env.js', () => ({
  env: {
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));
vi.mock('../src/repositories/UserRepository.js', () => ({
  UserRepository: mocks.userRepository,
}));
vi.mock('../src/repositories/RefreshTokenRepository.js', () => ({
  RefreshTokenRepository: mocks.refreshTokenRepository,
}));
vi.mock('../src/utils/password.js', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock('../src/utils/jwt.js', () => ({
  hashToken: mocks.hashToken,
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));
vi.mock('../src/utils/logger.js', () => ({ logger: mocks.logger }));

import { AuthService } from '../src/services/auth.service.js';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'password-hash',
  name: 'Test User',
  role: 'CUSTOMER',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as User;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.hashPassword.mockResolvedValue('new-password-hash');
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashToken.mockReturnValue('refresh-hash');
  mocks.signAccessToken.mockReturnValue('access-token');
  mocks.signRefreshToken.mockReturnValue('refresh-token');
  mocks.verifyRefreshToken.mockReturnValue({ sub: user.id, jti: 'token-1' });
  mocks.refreshTokenRepository.create.mockResolvedValue({});
});

describe('AuthService', () => {
  it('registers a customer and removes passwordHash from the response', async () => {
    mocks.userRepository.existsByEmail.mockResolvedValue(false);
    mocks.userRepository.create.mockResolvedValue(user);

    const result = await AuthService.register({
      email: user.email,
      password: 'DevPassword123!',
      name: user.name,
    });

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(mocks.userRepository.create).toHaveBeenCalledWith({
      email: user.email,
      passwordHash: 'new-password-hash',
      name: user.name,
    });
  });

  it('rejects invalid login credentials with the same public error', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      AuthService.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid email or password' });
  });

  it('rotates an active refresh token after conditional revocation succeeds', async () => {
    mocks.refreshTokenRepository.findByTokenHash.mockResolvedValue({
      id: 'refresh-row-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    mocks.userRepository.findById.mockResolvedValue(user);
    mocks.refreshTokenRepository.revokeIfActive.mockResolvedValue(true);

    const result = await AuthService.refresh('raw-refresh-token');

    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(mocks.refreshTokenRepository.revokeIfActive).toHaveBeenCalledWith(
      'refresh-row-1',
      mocks.prisma,
    );
    expect(mocks.refreshTokenRepository.create).toHaveBeenCalledOnce();
  });

  it('rejects a concurrent refresh that loses the conditional revoke', async () => {
    mocks.refreshTokenRepository.findByTokenHash.mockResolvedValue({
      id: 'refresh-row-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    mocks.userRepository.findById.mockResolvedValue(user);
    mocks.refreshTokenRepository.revokeIfActive.mockResolvedValue(false);

    await expect(AuthService.refresh('raw-refresh-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Refresh token already used',
    });
    expect(mocks.refreshTokenRepository.create).not.toHaveBeenCalled();
  });

  it('revokes all sessions when a revoked refresh token is reused', async () => {
    mocks.refreshTokenRepository.findByTokenHash.mockResolvedValue({
      id: 'refresh-row-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(AuthService.refresh('reused-refresh-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Refresh token reuse detected — all sessions revoked',
    });
    expect(mocks.refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(user.id);
    expect(mocks.userRepository.findById).not.toHaveBeenCalled();
  });

  it('silently revokes an active logout token', async () => {
    mocks.refreshTokenRepository.findByTokenHash.mockResolvedValue({
      id: 'refresh-row-1',
      revokedAt: null,
    });

    await AuthService.logout('raw-refresh-token');

    expect(mocks.refreshTokenRepository.revoke).toHaveBeenCalledWith('refresh-row-1');
  });

  it('revokes all active sessions for logout-all', async () => {
    await AuthService.logoutAll(user.id);

    expect(mocks.refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(user.id);
  });
});
