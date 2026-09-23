# Product Requirements Document

## Product

An AI-powered customer support platform where customers receive fast answers,
can be handed off to human agents, and can track the resulting support
conversation and ticket.

## Users

- **Customer**: registers, signs in, chats with AI, receives escalation, and
  follows tickets.
- **Agent**: manages assigned tickets and conversations, replies to customers,
  and updates availability.
- **Admin**: manages users and knowledge content and reviews analytics.

## MVP requirements

1. Secure registration and login with CUSTOMER-only self-registration.
2. Short-lived access JWTs and revocable, rotating refresh tokens in httpOnly
   cookies.
3. Customer conversations with persisted messages and conversation status.
4. AI responses grounded in a searchable knowledge base.
5. Confidence and groundedness evaluation with escalation to a human when the
   AI cannot answer safely.
6. Ticket creation, assignment, status changes, and resolution.
7. Real-time updates through the existing Socket.IO boundary.
8. Agent availability, queue views, and customer notifications.
9. Admin knowledge-document management and operational analytics.

## Non-functional requirements

- Node owns application state; Python owns AI processing.
- Passwords use bcrypt; refresh tokens are hashed at rest.
- Request inputs are validated with Zod or the equivalent Python schema.
- Authentication and authorization decisions happen server-side.
- AI outages degrade to human escalation rather than silently losing a
  customer message.
- Services run independently in Docker and can scale separately in deployment.

## Current acceptance state

Authentication is complete and Docker-verified. The database schema includes
planned support, audit, notification, and knowledge entities, but their
user-facing workflows are not yet complete. All other MVP requirements remain
delivery work tracked in `docs/project-plan.md`.

## Out of scope

Voice input, multi-language support, PWA packaging, and unrelated bonus
features remain deferred.
