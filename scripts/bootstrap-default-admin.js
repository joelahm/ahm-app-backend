#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/password');

const prisma = new PrismaClient();

const DEFAULT_ADMIN = {
  email: 'developer@alliedhealthmedia.co.uk',
  firstName: 'Joel',
  lastName: 'Aposaga',
  roleCode: 'ADMIN'
};

function generatePassword(length = 20) {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}';
  const all = lower + upper + digits + symbols;

  const required = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];

  while (required.length < length) {
    const idx = crypto.randomInt(0, all.length);
    required.push(all[idx]);
  }

  for (let i = required.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
}

async function main() {
  const totalUsers = await prisma.user.count();

  if (totalUsers > 0) {
    console.log('Skipped: users table is not empty. Default admin was not created.');
    return;
  }

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

  const plainPassword = generatePassword();
  const passwordHash = await hashPassword(plainPassword);

  await prisma.user.create({
    data: {
      email: DEFAULT_ADMIN.email,
      passwordHash,
      firstName: DEFAULT_ADMIN.firstName,
      lastName: DEFAULT_ADMIN.lastName,
      roleCode: DEFAULT_ADMIN.roleCode,
      status: 'ACTIVE',
      isActive: true
    }
  });

  console.log('Default admin user created. Save this password now:');
  console.log(`email: ${DEFAULT_ADMIN.email}`);
  console.log(`password: ${plainPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Failed to bootstrap default admin user.');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
