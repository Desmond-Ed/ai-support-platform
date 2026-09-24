import { AppError } from '../utils/AppError.js';
import type { Role } from '../generated/prisma/client.js';
import { KnowledgeDocumentRepository } from '../repositories/KnowledgeDocumentRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';

export const AdminService = {
  async listUsers() {
    return UserRepository.findMany();
  },

  async listKnowledgeDocuments() {
    return KnowledgeDocumentRepository.findMany();
  },

  async updateUser(id: string, data: { role?: Role; isActive?: boolean }) {
    const user = await UserRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return UserRepository.updateAdminFields(id, data);
  },
};