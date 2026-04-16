-- Migration: org_backups table for per-org snapshot backup & restore
-- Run: docker exec signage-postgres sh -c "psql -U signage_dev -d signage_cms_dev -f /dev/stdin" < backend/migrations/create_org_backups.sql

CREATE TABLE IF NOT EXISTS org_backups (
    id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    label            TEXT        NOT NULL,
    type             TEXT        NOT NULL DEFAULT 'MANUAL', -- 'MANUAL' | 'AUTO'
    snapshot         JSONB       NOT NULL,
    "createdBy"      TEXT,       -- userId, NULL if AUTO
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "org_backups_pkey" PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "org_backups_orgId_createdAt_idx" ON org_backups ("organizationId", "createdAt" DESC);
