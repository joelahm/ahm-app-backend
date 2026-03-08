# Auth System Design (NextAuth + Express + MySQL)

## A) Architecture

### High-level auth architecture
- Frontend (Next.js + Auth.js/NextAuth) is the session orchestrator for browser/app UI.
- Backend (Express + MySQL) is the identity authority and token issuer/revoker.
- Credential verification occurs only in backend (`POST /api/v1/auth/login`).
- Access token is short-lived JWT (default 15m).
- Refresh token is long-lived JWT (default 30d), rotated on every refresh.
- Backend stores only `sha256(refreshToken)` hash + metadata, never raw refresh tokens.

### Token lifecycle strategy
- Login: issue access + refresh, persist refresh record (`session_id`, `token_family`, `jti`, hash).
- Refresh: validate refresh token, detect replay/reuse, rotate to new refresh token.
- Reuse detection: if rotated/revoked token is reused, revoke the entire token family.
- Logout: revoke token family (or session scope if needed).
- Password change/disable: revoke active refresh tokens for that user.

### Separation of concerns
- NextAuth responsibilities:
  - Collect credentials from UI.
  - Call backend `/auth/login` and hold backend tokens in its JWT cookie/session state.
  - Refresh access token via `/auth/refresh` when expired.
  - Route guards and role checks in frontend rendering/navigation.
- Backend responsibilities:
  - Password verification, user status checks, role authorization, token issuance/revocation.
  - Audit logs and security controls (rate-limit, brute-force protections).

### Extensibility for future OAuth providers
- `auth_identities` table is provider-agnostic (`provider`, `provider_user_id`).
- Credentials login is represented as identity provider `credentials`.
- Adding Google later only inserts/updates `auth_identities`; `users`, sessions, role checks, and token contract stay unchanged.

## B) Backend Design (Express + MySQL)

### API Contract

#### `POST /api/v1/auth/login`
Request:
```json
{
  "email": "admin@company.com",
  "password": "StrongPass123!"
}
```
Response 200:
```json
{
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "role": "ADMIN"
  },
  "tokens": {
    "accessToken": "<jwt>",
    "accessTokenExpiresAt": 1770000000,
    "refreshToken": "<jwt>",
    "refreshTokenExpiresAt": 1772592000,
    "sessionId": "22f7f5f4-857a-4626-9f88-6d95f16d99f7"
  }
}
```

#### `POST /api/v1/auth/refresh`
Request:
```json
{ "refreshToken": "<jwt>" }
```
Response 200:
```json
{
  "user": { "id": 1, "email": "admin@company.com", "role": "ADMIN" },
  "tokens": {
    "accessToken": "<new-jwt>",
    "accessTokenExpiresAt": 1770000500,
    "refreshToken": "<rotated-jwt>",
    "refreshTokenExpiresAt": 1772592500,
    "sessionId": "22f7f5f4-857a-4626-9f88-6d95f16d99f7"
  }
}
```

#### `POST /api/v1/auth/logout`
Request:
```json
{ "refreshToken": "<jwt>" }
```
Response 200:
```json
{ "success": true }
```

#### `GET /api/v1/auth/me`
Header: `Authorization: Bearer <accessToken>`

Response 200:
```json
{
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "role": "ADMIN",
    "status": "ACTIVE",
    "firstName": "System",
    "lastName": "Admin"
  }
}
```

#### `POST /api/v1/users` (admin only)
Request:
```json
{
  "email": "member@company.com",
  "password": "StrongPass123!",
  "role": "TEAM_MEMBER",
  "firstName": "Team",
  "lastName": "Member"
}
```
Response 201:
```json
{
  "user": {
    "id": 2,
    "email": "member@company.com",
    "role": "TEAM_MEMBER",
    "status": "ACTIVE",
    "isActive": true
  }
}
```

#### `PATCH /api/v1/users/:id` (admin only)
Request:
```json
{
  "role": "TEAM_MEMBER",
  "status": "DISABLED",
  "isActive": false
}
```
Response 200:
```json
{ "success": true }
```

#### `PATCH /api/v1/users/:id/password` (admin only)
Request:
```json
{ "newPassword": "N3wStrongPassword!" }
```
Response 200:
```json
{ "success": true }
```

### Middleware design
- `authenticateAccessToken`:
  - Reads bearer token.
  - Verifies JWT signature, issuer, audience, expiry.
  - Optionally validates session state against `refresh_tokens` (revoked/not found => reject).
- `requireRole(...roles)`:
  - Expects `req.auth` from token middleware.
  - Rejects with 403 when role not authorized.

### SQL schema and constraints
- Prisma-managed schema: `prisma/schema.prisma`
- Initial Prisma migration: `prisma/migrations/20260307210827_init_auth/migration.sql`
- Key choices:
  - Roles table + FK (`users.role_code`) for extensibility.
  - Provider-agnostic identities table for future OAuth.
  - Refresh token family+rotation fields for revocation and replay detection.
  - Audit logs with JSON metadata for security events.

### Safe migration pattern for new user columns
1. Add nullable column (`ALTER TABLE ... ADD COLUMN ... NULL`).
2. Deploy app that writes/reads it safely.
3. Backfill existing rows in batches.
4. Add `NOT NULL` and indexes after data is complete.

Use Prisma migrations for new columns (`npx prisma migrate dev --name <change_name>`), then backfill data as needed.

## C) NextAuth/Auth.js Integration

### Credentials provider now, OAuth-ready later
- Keep one backend contract for token issuance regardless of provider.
- In Auth.js, provider `credentials` calls backend `/auth/login`.
- Later, Google provider callback should exchange identity with backend and still receive same token bundle shape.

See complete example file: `docs/nextauth-authjs.example.ts`.

### JWT/session callback strategy
Store in token/session:
- `user.id`, `user.email`, `user.role`
- `backend.accessToken`, `backend.refreshToken`
- `backend.accessTokenExpiresAt`, `backend.refreshTokenExpiresAt`

### Auto refresh behavior
- On every `jwt` callback:
  - If access token valid, return current token.
  - If expired, call `/auth/refresh` with `refreshToken`.
  - On failure, set `token.error = 'RefreshAccessTokenError'`.

### Role guards in Next.js
- Server-side: `auth()` in layouts/pages and redirect unauthorized users.
- Client-side: role gate components for UI controls.

## D) Security + Ops
- Password hashing: `bcrypt`/`bcryptjs` with cost 12+ (tune in production).
- Refresh token persistence: store only SHA-256 hash.
- Rotation and reuse detection:
  - Rotate on every refresh.
  - Reuse of old/rotated token revokes token family.
- Brute-force/rate limit:
  - Global API rate limit.
  - Stronger limit on `/auth/login` and `/auth/refresh`.
  - Optional username/IP lockout in Redis or DB counters.
- Account disable behavior:
  - `status != ACTIVE` or `is_active = 0` blocks login/refresh.
  - Revoke all active sessions on disable.
- Auditing:
  - Log login success/failure, refresh reuse detection, logout, password changes, user role/status changes.
  - Include actor, IP, user-agent, request-id.

## E) Implementation Order
1. Run `npx prisma migrate dev --name init_auth` (already applied).
2. Seed roles with `npm run prisma:seed`.
3. Add env vars + secrets management.
4. Wire `src/app-auth.js` and `src/www-auth.js` as backend entry.
5. Implement auth and users modules (already scaffolded in `src/modules/*`).
6. Add rate limits + structured audit logging hooks.
7. Integrate NextAuth credentials provider with backend login/refresh/logout.
8. Add role guards in Next.js layouts/routes.
9. Add tests (auth service, token rotation, middleware, admin user flows).
10. Later: add OAuth provider by inserting into `auth_identities` (Prisma model `AuthIdentity`).

## Suggested Backend Module Structure
```txt
src/
  app-auth.js
  www-auth.js
  config/
    env.js
    db.js
  lib/
    jwt.js
    password.js
    refreshToken.js
    errors.js
  middleware/
    authenticateAccessToken.js
    requireRole.js
    errorHandler.js
  modules/
    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
    users/
      users.routes.js
      users.controller.js
      users.service.js
    health/
      health.routes.js
  types/
    auth.ts
    session.ts
prisma/
  schema.prisma
  migrations/
    20260307210827_init_auth/migration.sql
  seed.js
docs/
  nextauth-authjs.example.ts
```
