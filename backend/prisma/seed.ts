import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('DevPassword123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: '[email protected]' },
    update: {},
    create: {
      email: '[email protected]',
      passwordHash,
      name: 'Dev Admin',
      role: Role.ADMIN,
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: '[email protected]' },
    update: {},
    create: {
      email: '[email protected]',
      passwordHash,
      name: 'Dev Agent',
      role: Role.AGENT,
    },
  });

  await prisma.agentAvailability.upsert({
    where: { agentId: agent.id },
    update: {},
    create: { agentId: agent.id, status: 'AVAILABLE' },
  });

  const customer = await prisma.user.upsert({
    where: { email: '[email protected]' },
    update: {},
    create: {
      email: '[email protected]',
      passwordHash,
      name: 'Dev Customer',
      role: Role.CUSTOMER,
    },
  });

  const requestedCustomer = await prisma.user.upsert({
    where: { email: 'lo33663@gmail.com' },
    update: {},
    create: {
      email: 'lo33663@gmail.com',
      passwordHash,
      name: 'Lo Customer',
      role: Role.CUSTOMER,
    },
  });

  console.log('Seeded:', {
    admin: admin.email,
    agent: agent.email,
    customer: customer.email,
    requestedCustomer: requestedCustomer.email,
  });
  console.log('All dev accounts use password: DevPassword123!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
