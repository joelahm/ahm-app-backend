const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { description: 'System administrator with user management rights' },
    create: {
      code: 'ADMIN',
      description: 'System administrator with user management rights'
    }
  });

  await prisma.role.upsert({
    where: { code: 'TEAM_MEMBER' },
    update: { description: 'Default application user role' },
    create: {
      code: 'TEAM_MEMBER',
      description: 'Default application user role'
    }
  });

  await prisma.role.upsert({
    where: { code: 'GUEST' },
    update: { description: 'Guest role with limited permissions' },
    create: {
      code: 'GUEST',
      description: 'Guest role with limited permissions'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
