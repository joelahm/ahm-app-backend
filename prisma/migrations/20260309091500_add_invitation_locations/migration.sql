-- Add locations metadata per invitation
ALTER TABLE user_invitations
  ADD COLUMN locations_json JSON NULL AFTER role_code;
