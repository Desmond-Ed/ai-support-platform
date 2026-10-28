import 'dotenv/config';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = 'DevPassword123!';
const isProduction = process.env.NODE_ENV === 'production';

const adminEmail =
  process.env.SEED_ADMIN_EMAIL?.trim() || (isProduction ? '' : 'admin@example.com');
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : DEV_PASSWORD);
const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';

async function main(): Promise<void> {
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required when NODE_ENV=production',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: Role.ADMIN,
    },
  });

  if (isProduction) {
    console.log('Seeded production admin:', admin.email);
    return;
  }

  const agent = await prisma.user.upsert({
    where: { email: 'agent@example.com' },
    update: {},
    create: {
      email: 'agent@example.com',
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
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      passwordHash,
      name: 'Dev Customer',
      role: Role.CUSTOMER,
    },
  });

  const requestedCustomer = await prisma.user.upsert({
    where: { email: 'lo-customer@example.com' },
    update: {},
    create: {
      email: 'lo-customer@example.com',
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
  console.log(`All dev accounts use password: ${DEV_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
