-- Part 1: Soft Delete for Media and Devices
-- Run: docker exec signage-postgres sh -c "psql -U signage_dev -d signage_cms_dev -f /dev/stdin" < backend/migrations/add_soft_delete.sql

ALTER TABLE media  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_media_org_deleted   ON media   ("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS idx_devices_org_deleted ON devices ("organizationId", "deletedAt");
