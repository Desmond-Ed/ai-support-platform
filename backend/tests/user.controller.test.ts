import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const updateProfile = vi.hoisted(() => vi.fn());

vi.mock('../src/services/user.service.js', () => ({
  UserService: { updateProfile },
}));

import { UserController } from '../src/controllers/user.controller.js';

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('UserController', () => {
  it('rejects profile updates without an authenticated user', async () => {
    const res = response();

    await expect(UserController.updateMe({ body: { name: 'Updated User' } } as Request, res)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Not authenticated',
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('uses the authenticated user id instead of a client-supplied id', async () => {
    const res = response();
    const updatedUser = { id: 'user-1', name: 'Updated User' };
    updateProfile.mockResolvedValue(updatedUser);

    await UserController.updateMe(
      {
        user: { id: 'user-1', role: 'CUSTOMER' },
        body: { id: 'other-user', name: 'Updated User' },
      } as Request,
      res,
    );

    expect(updateProfile).toHaveBeenCalledWith('user-1', { id: 'other-user', name: 'Updated User' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ user: updatedUser });
  });
});