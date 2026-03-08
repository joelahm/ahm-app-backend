-- 003_add_google_provider_example.sql
-- No schema change needed if auth_identities is already provider-agnostic.

-- Example data insertion pattern after OAuth callback verification:
-- INSERT INTO auth_identities (user_id, provider, provider_user_id, provider_email, provider_profile_json)
-- VALUES (:userId, 'google', :googleSub, :email, :profileJson)
-- ON DUPLICATE KEY UPDATE
--   provider_email = VALUES(provider_email),
--   provider_profile_json = VALUES(provider_profile_json),
--   last_used_at = NOW();

-- Optional: provider-specific performance index if needed at scale.
CREATE INDEX idx_auth_identity_provider_email ON auth_identities(provider, provider_email);
