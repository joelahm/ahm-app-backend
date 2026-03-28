-- Add registration profile fields for invited user onboarding
ALTER TABLE users
  ADD COLUMN title VARCHAR(120) NULL AFTER last_name,
  ADD COLUMN phone_number VARCHAR(64) NULL AFTER title,
  ADD COLUMN country VARCHAR(120) NULL AFTER phone_number,
  ADD COLUMN timezone VARCHAR(64) NULL AFTER country,
  ADD COLUMN date_format VARCHAR(32) NULL AFTER timezone;
