ALTER TABLE media   RENAME COLUMN deletedat TO deletedat_tmp;
ALTER TABLE media   RENAME COLUMN deletedat_tmp TO "deletedAt";
ALTER TABLE devices RENAME COLUMN deletedat TO deletedat_tmp;
ALTER TABLE devices RENAME COLUMN deletedat_tmp TO "deletedAt";
