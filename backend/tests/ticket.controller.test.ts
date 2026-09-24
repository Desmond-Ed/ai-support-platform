import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const setAgentAvailability = vi.hoisted(() => vi.fn());

vi.mock('../src/services/ticket.service.js', () => ({
  TicketService: { setAgentAvailability },
}));

import { TicketController } from '../src/controllers/ticket.controller.js';

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('TicketController', () => {
  it('rejects availability updates without authentication', async () => {
    await expect(
      TicketController.updateAvailability({ body: { status: 'AVAILABLE' } } as Request, response()),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(setAgentAvailability).not.toHaveBeenCalled();
  });

  it('updates availability for the authenticated agent', async () => {
    const res = response();
    const availability = { id: 'availability-1', agentId: 'agent-1', status: 'BUSY' };
    setAgentAvailability.mockResolvedValue(availability);

    await TicketController.updateAvailability(
      {
        user: { id: 'agent-1', role: 'AGENT' },
        body: { status: 'BUSY', agentId: 'other-agent' },
      } as Request,
      res,
    );

    expect(setAgentAvailability).toHaveBeenCalledWith('agent-1', 'BUSY');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ availability });
  });
});