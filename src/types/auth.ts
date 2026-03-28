export type Role = 'ADMIN' | 'TEAM_MEMBER';
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  status?: UserStatus;
  firstName?: string | null;
  lastName?: string | null;
}

export interface TokenBundle {
  accessToken: string;
  accessTokenExpiresAt: number; // Unix epoch seconds
  refreshToken: string;
  refreshTokenExpiresAt: number; // Unix epoch seconds
  sessionId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: TokenBundle;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  user: AuthUser;
  tokens: TokenBundle;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  status?: UserStatus;
}

export interface PatchUserRequest {
  email?: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  status?: UserStatus;
}

export interface PatchPasswordRequest {
  newPassword: string;
}

export interface InviteMember {
  email: string;
  role: Role;
}

export interface InviteUsersRequest {
  members: InviteMember[];
  locations: string[];
}

export interface RegisterInvitedUserRequest {
  token: string;
  firstName: string;
  lastName: string;
  title: string;
  phoneNumber: string;
  email: string;
  country: string;
  timezone: string;
  dateFormat: string;
  password: string;
  confirmPassword: string;
}
