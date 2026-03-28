-- Add avatar URL field for user profile image
ALTER TABLE users
  ADD COLUMN avatar_url VARCHAR(512) NULL AFTER last_name;
