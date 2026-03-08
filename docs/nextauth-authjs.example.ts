import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

type Role = 'ADMIN' | 'TEAM_MEMBER';

interface BackendLoginResponse {
  user: { id: number; email: string; role: Role };
  tokens: {
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
    sessionId: string;
  };
}

async function loginWithCredentials(email: string, password: string) {
  const response = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) return null;
  const data = (await response.json()) as BackendLoginResponse;

  return {
    id: String(data.user.id),
    email: data.user.email,
    role: data.user.role,
    backend: data.tokens
  };
}

async function refreshBackendToken(token: any) {
  const refreshToken = token?.backend?.refreshToken;
  if (!refreshToken) {
    return { ...token, error: 'RefreshAccessTokenError' };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      return { ...token, error: 'RefreshAccessTokenError' };
    }

    const data = (await response.json()) as BackendLoginResponse;

    return {
      ...token,
      user: {
        id: String(data.user.id),
        email: data.user.email,
        role: data.user.role
      },
      backend: data.tokens,
      error: undefined
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        return loginWithCredentials(String(credentials.email), String(credentials.password));
      }
    })
    // Later: add Google() provider here without changing token/session contract.
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.user = {
          id: user.id,
          email: user.email,
          role: (user as any).role
        };
        token.backend = (user as any).backend;
        return token;
      }

      const expiresAt = token?.backend?.accessTokenExpiresAt;
      const isExpired = !expiresAt || Date.now() >= expiresAt * 1000;

      if (!isExpired) {
        return token;
      }

      return refreshBackendToken(token);
    },
    async session({ session, token }) {
      (session as any).user = token.user;
      (session as any).backend = token.backend;
      (session as any).error = token.error;
      return session;
    }
  }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Example server-side role guard for app router:
// const session = await auth();
// if (!session?.user || session.user.role !== 'ADMIN') redirect('/forbidden');
