import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'E2ePassword123!';

const users = [
  {
    email: 'e2e.admin@example.com',
    name: 'E2E Admin',
    role: Role.ADMIN,
  },
  {
    email: 'e2e.agent@example.com',
    name: 'E2E Agent',
    role: Role.AGENT,
  },
  {
    email: 'e2e.customer@example.com',
    name: 'E2E Customer',
    role: Role.CUSTOMER,
  },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const user of users) {
    const seeded = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
      },
      create: {
        ...user,
        passwordHash,
      },
    });

    if (seeded.role === Role.AGENT) {
      await prisma.agentAvailability.upsert({
        where: { agentId: seeded.id },
        update: { status: 'AVAILABLE' },
        create: { agentId: seeded.id, status: 'AVAILABLE' },
      });
    }
  }

  console.log(`Seeded ${users.length} isolated E2E identities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
