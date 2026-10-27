import { prisma } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import type { Role } from '../generated/prisma/client.js';
import { KnowledgeModerationService, type KnowledgeListQuery } from './knowledgeModeration.service.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { AuditService, type AuditQuery } from './audit.service.js';
import type { User } from '../generated/prisma/client.js';

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const AdminService = {
  async listUsers() {
    return UserRepository.findMany();
  },

  async listKnowledgeDocuments(query: KnowledgeListQuery) {
    return KnowledgeModerationService.list(query);
  },

  async listAuditLogs(query: AuditQuery) {
    return AuditService.list(query);
  },

  async updateUser(
    id: string,
    data: { role?: Role; isActive?: boolean },
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const user = await UserRepository.findById(id, tx);
      if (!user) throw new AppError('User not found', 404);

      const nextRole = data.role ?? user.role;
      const nextIsActive = data.isActive ?? user.isActive;
      if (nextRole === user.role && nextIsActive === user.isActive) {
        return publicUser(user);
      }

      const updated = await UserRepository.updateAdminFields(
        id,
        { role: nextRole, isActive: nextIsActive },
        tx,
      );

      await AuditService.record(
        {
          actorId,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          metadata: {
            previousRole: user.role,
            newRole: updated.role,
            previousIsActive: user.isActive,
            newIsActive: updated.isActive,
          },
        },
        tx,
      );

      return publicUser(updated);
    });
  },
};
