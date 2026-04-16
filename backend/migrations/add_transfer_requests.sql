-- Transfer requests: org users request license transfer, SUPER_ADMIN approves/rejects
CREATE TABLE IF NOT EXISTS transfer_requests (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "fromDeviceId"   TEXT NOT NULL,
    "fromDeviceName" TEXT NOT NULL,
    "toDeviceId"     TEXT NOT NULL,
    "toDeviceName"   TEXT NOT NULL,
    "requestedById"  TEXT,
    "requestedByName" TEXT,
    status           TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    note             TEXT,
    "adminNote"      TEXT,
    "resolvedById"   TEXT,
    "resolvedAt"     TIMESTAMPTZ,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tr_orgId_idx  ON transfer_requests ("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS tr_status_idx ON transfer_requests (status, "createdAt" DESC);
