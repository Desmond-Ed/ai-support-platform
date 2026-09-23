import { UserRepository } from '../repositories/UserRepository.js';
import { AppError } from '../utils/AppError.js';
import type { User } from '../generated/prisma/client.js';

export type SafeUser = Omit<User, 'passwordHash'>;

function sanitizeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return safe;
}

export const UserService = {
  async getById(id: string): Promise<SafeUser> {
    const user = await UserRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return sanitizeUser(user);
  },
};