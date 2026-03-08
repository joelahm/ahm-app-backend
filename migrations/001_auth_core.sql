-- 001_auth_core.sql
-- Core auth schema for credentials auth now, OAuth providers later.

CREATE TABLE IF NOT EXISTS roles (
  code VARCHAR(32) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO roles (code, description)
VALUES
  ('ADMIN', 'System administrator with user management rights'),
  ('TEAM_MEMBER', 'Default application user role')
ON DUPLICATE KEY UPDATE description = VALUES(description);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role_code VARCHAR(32) NOT NULL,
  first_name VARCHAR(120) NULL,
  last_name VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  password_changed_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_code (role_code),
  KEY idx_users_status_active (status, is_active),
  CONSTRAINT fk_users_role_code FOREIGN KEY (role_code) REFERENCES roles(code)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(64) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255) NULL,
  provider_profile_json JSON NULL,
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_identity_provider_user (provider, provider_user_id),
  KEY idx_auth_identity_user_id (user_id),
  KEY idx_auth_identity_provider (provider),
  CONSTRAINT fk_auth_identity_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- For credentials auth, store a first-class identity record too.
INSERT INTO auth_identities (user_id, provider, provider_user_id, provider_email)
SELECT id, 'credentials', email, email
FROM users
WHERE NOT EXISTS (
  SELECT 1
  FROM auth_identities ai
  WHERE ai.user_id = users.id
    AND ai.provider = 'credentials'
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  session_id CHAR(36) NOT NULL,
  token_family CHAR(36) NOT NULL,
  jti CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  revoked_reason VARCHAR(128) NULL,
  replaced_by_jti CHAR(36) NULL,
  created_by_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_jti (jti),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user_id (user_id),
  KEY idx_refresh_session_id (session_id),
  KEY idx_refresh_family (token_family),
  KEY idx_refresh_expires_at (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NULL,
  request_id VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor_user_id (actor_user_id),
  KEY idx_audit_action_created_at (action, created_at),
  KEY idx_audit_resource (resource_type, resource_id),
  CONSTRAINT fk_audit_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;
