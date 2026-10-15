USE taplink_nfc;

CREATE TABLE IF NOT EXISTS public_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  slug VARCHAR(40) NOT NULL UNIQUE,
  profile_type ENUM('personal', 'business') NOT NULL DEFAULT 'personal',
  headline VARCHAR(120) NOT NULL DEFAULT '',
  company VARCHAR(120) NOT NULL DEFAULT '',
  bio VARCHAR(600) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  public_email VARCHAR(254) NOT NULL DEFAULT '',
  website VARCHAR(500) NOT NULL DEFAULT '',
  location VARCHAR(300) NOT NULL DEFAULT '',
  photo_filename VARCHAR(53) NULL,
  social_links JSON NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_public_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS taplink_add_profile_fields;
DELIMITER //
CREATE PROCEDURE taplink_add_profile_fields()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'public_profiles' AND column_name = 'profile_type'
  ) THEN
    ALTER TABLE public_profiles ADD COLUMN profile_type ENUM('personal', 'business') NOT NULL DEFAULT 'personal' AFTER slug;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'public_profiles' AND column_name = 'location'
  ) THEN
    ALTER TABLE public_profiles ADD COLUMN location VARCHAR(300) NOT NULL DEFAULT '' AFTER website;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'public_profiles' AND column_name = 'photo_filename'
  ) THEN
    ALTER TABLE public_profiles ADD COLUMN photo_filename VARCHAR(53) NULL AFTER location;
  END IF;
END//
DELIMITER ;
CALL taplink_add_profile_fields();
DROP PROCEDURE taplink_add_profile_fields;

UPDATE app_settings
SET setting_value = 'TapLink'
WHERE setting_key = 'app_name' AND setting_value = 'TapLink NFC';
