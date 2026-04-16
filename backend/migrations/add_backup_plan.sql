-- Migration: backup plan per org + purchase request table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "backupPlan" INTEGER DEFAULT NULL;
-- NULL = no plan, 3 = 3 days, 7 = 7 days, 10 = 10 days

CREATE TABLE IF NOT EXISTS backup_plan_requests (
    id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "requestedPlan"  INTEGER     NOT NULL,   -- 3 | 7 | 10
    status           TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    note             TEXT,
    "adminNote"      TEXT,
    "requestedById"  TEXT,
    "requestedByName" TEXT,
    "resolvedById"   TEXT,
    "resolvedAt"     TIMESTAMPTZ,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "backup_plan_requests_pkey" PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "bpr_orgId_idx"    ON backup_plan_requests ("organizationId");
CREATE INDEX IF NOT EXISTS "bpr_status_idx"   ON backup_plan_requests (status);
