import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { TicketService } from '../services/ticket.service.js';
import type { AgentAvailabilityInput } from '../validators/ticket.validators.js';

function customerId(req: Request): string {
  if (!req.user) {
    throw new AppError('Not authenticated', 401);
  }
  return req.user.id;
}

export const TicketController = {
  async list(req: Request, res: Response): Promise<void> {
    const tickets = await TicketService.listForCustomer(customerId(req));
    res.status(200).json({ tickets });
  },

  async listForAgent(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const tickets = await TicketService.listForAgent(req.user.id);
    res.status(200).json({ tickets });
  },

  async updateAvailability(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const availability = await TicketService.setAgentAvailability(
      req.user.id,
      (req.body as AgentAvailabilityInput).status,
    );
    res.status(200).json({ availability });
  },

  async create(req: Request, res: Response): Promise<void> {
    const payload = req.body as {
      conversationId?: string;
      subject?: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    };

    if (!payload.conversationId || !payload.subject) {
      throw new AppError('conversationId and subject are required', 400);
    }

    const ticket = await TicketService.createForCustomer(customerId(req), payload.conversationId, {
      subject: payload.subject,
      description: payload.description ?? null,
      priority: payload.priority ?? 'MEDIUM',
    });

    res.status(201).json({ ticket });
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const payload = req.body as {
      status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    };

    if (typeof req.params.id !== 'string') {
      throw new AppError('Ticket not found', 404);
    }
    if (!payload.status) {
      throw new AppError('status is required', 400);
    }

    const ticket = await TicketService.updateStatus(req.params.id, payload.status);
    res.status(200).json({ ticket });
  },

  async assignAgent(req: Request, res: Response): Promise<void> {
    const payload = req.body as { agentId?: string };

    if (typeof req.params.id !== 'string') {
      throw new AppError('Ticket not found', 404);
    }
    if (!payload.agentId) {
      throw new AppError('agentId is required', 400);
    }

    const assignment = await TicketService.assignAgent(req.params.id, payload.agentId);
    res.status(200).json({ assignment });
  },
};
