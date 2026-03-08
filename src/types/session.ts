import type { Role } from './auth';

export interface BackendTokenState {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthJsJWT {
  user?: SessionUser;
  backend?: BackendTokenState;
  error?: 'RefreshAccessTokenError';
}

export interface AppSession {
  user: SessionUser;
  backend: BackendTokenState;
  error?: 'RefreshAccessTokenError';
}
