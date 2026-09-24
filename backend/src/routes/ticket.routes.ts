import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { agentAvailabilitySchema } from '../validators/ticket.validators.js';

export const ticketRouter = Router();

ticketRouter.use(authenticate);
ticketRouter.get('/', TicketController.list);
ticketRouter.post('/', TicketController.create);
ticketRouter.patch(
	'/availability',
	requireRole('AGENT', 'ADMIN'),
	validateBody(agentAvailabilitySchema),
	TicketController.updateAvailability,
);
ticketRouter.get('/agent', requireRole('AGENT', 'ADMIN'), TicketController.listForAgent);
ticketRouter.patch('/:id/status', requireRole('AGENT', 'ADMIN'), TicketController.updateStatus);
ticketRouter.patch('/:id/assign', requireRole('AGENT', 'ADMIN'), TicketController.assignAgent);
