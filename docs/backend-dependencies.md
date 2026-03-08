# Backend Dependencies

Install dependencies:

```bash
npm install
```

Prisma commands:

```bash
npm run prisma:generate
npm run prisma:migrate:dev -- --name <change_name>
npm run prisma:migrate:deploy
npm run prisma:seed
npm run prisma:pull     # optional, if schema changed directly in DB
```

The backend now uses Prisma Client for all DB access.
