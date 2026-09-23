import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../src/generated/prisma/client.js';

const findById = vi.hoisted(() => vi.fn());

vi.mock('../src/repositories/UserRepository.js', () => ({
  UserRepository: { findById },
}));

import { UserService } from '../src/services/user.service.js';

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
});

describe('UserService', () => {
  it('returns the current user without passwordHash', async () => {
    findById.mockResolvedValue(user);

    const result = await UserService.getById(user.id);

    expect(result).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns 404 when the user no longer exists', async () => {
    findById.mockResolvedValue(null);

    await expect(UserService.getById('missing-user')).rejects.toMatchObject({
      statusCode: 404,
      message: 'User not found',
    });
  });
});
