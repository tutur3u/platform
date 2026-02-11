ALTER TABLE meet_together_user_timeblocks ADD COLUMN tentative boolean NOT NULL DEFAULT false;
ALTER TABLE meet_together_guest_timeblocks ADD COLUMN tentative boolean NOT NULL DEFAULT false;