const { PrismaClient } = require('@prisma/client');

function createPrismaClient(databaseUrl) {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
}

module.exports = { createPrismaClient };
