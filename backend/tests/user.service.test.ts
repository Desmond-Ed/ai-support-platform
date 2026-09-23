import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../src/generated/prisma/client.js';

const findById = vi.hoisted(() => vi.fn());
const updateName = vi.hoisted(() => vi.fn());

vi.mock('../src/repositories/UserRepository.js', () => ({
  UserRepository: { findById, updateName },
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

  it('updates the profile name without exposing the password hash', async () => {
    const updatedUser = { ...user, name: 'Updated User' };
    findById.mockResolvedValue(user);
    updateName.mockResolvedValue(updatedUser);

    const result = await UserService.updateProfile(user.id, { name: 'Updated User' });

    expect(updateName).toHaveBeenCalledWith(user.id, 'Updated User');
    expect(result).toEqual({
      id: user.id,
      email: user.email,
      name: 'Updated User',
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('does not update a missing profile', async () => {
    findById.mockResolvedValue(null);

    await expect(UserService.updateProfile('missing-user', { name: 'Updated User' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'User not found',
    });
    expect(updateName).not.toHaveBeenCalled();
  });
});
