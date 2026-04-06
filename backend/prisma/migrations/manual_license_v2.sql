-- ============================================================
--  License v2 Migration
--  Xóa hệ thống points cũ, thêm hệ thống license theo thiết bị
-- ============================================================

-- 1. Xóa bảng cũ (nếu tồn tại)
DROP TABLE IF EXISTS license_queue CASCADE;
DROP TABLE IF EXISTS device_licenses CASCADE;
DROP TABLE IF EXISTS license_packages CASCADE;
DROP TABLE IF EXISTS license_transactions CASCADE;

-- 2. Cập nhật organizations — xóa cột cũ, thêm cột mới
ALTER TABLE organizations
    DROP COLUMN IF EXISTS "pointsTotal",
    DROP COLUMN IF EXISTS "pointsUsed",
    DROP COLUMN IF EXISTS "licenseStatus",
    DROP COLUMN IF EXISTS "suspendedAt";

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS "pkg12m" INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pkg24m" INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pkg36m" INT NOT NULL DEFAULT 0;

-- 3. Cập nhật devices — thêm licenseExpiresAt
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS "licenseExpiresAt" TIMESTAMPTZ;

-- 4. Tạo bảng device_licenses mới
CREATE TABLE IF NOT EXISTS device_licenses (
    id                        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "deviceId"                TEXT        NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
    "organizationId"          TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "packageType"             TEXT        NOT NULL,
    "activatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt"               TIMESTAMPTZ NOT NULL,
    "activatedById"           TEXT,
    "activatedByName"         TEXT,
    "transferredFromDeviceId" TEXT REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "dl_orgId_idx" ON device_licenses("organizationId");

-- 5. Tạo bảng license_history
CREATE TABLE IF NOT EXISTS license_history (
    id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        REFERENCES devices(id) ON DELETE SET NULL,
    "deviceName"     TEXT,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action           TEXT        NOT NULL,
    detail           JSONB,
    "performedById"  TEXT,
    "performedByName" TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "lh_orgId_createdAt_idx" ON license_history("organizationId", "createdAt" DESC);

-- 6. Tạo bảng purchase_requests
CREATE TABLE IF NOT EXISTS purchase_requests (
    id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "requestedById"  TEXT,
    "requestedByName" TEXT,
    "packageType"    TEXT        NOT NULL,
    quantity         INT         NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'PENDING',
    note             TEXT,
    "adminNote"      TEXT,
    "resolvedById"   TEXT,
    "resolvedAt"     TIMESTAMPTZ,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "pr_orgId_createdAt_idx" ON purchase_requests("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "pr_status_createdAt_idx" ON purchase_requests(status, "createdAt" DESC);
