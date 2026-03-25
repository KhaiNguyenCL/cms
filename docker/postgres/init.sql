-- =============================================================================
--  SignageCMS — PostgreSQL Init Script
--  Chạy tự động khi Docker container khởi tạo lần đầu.
--  Source of truth: backend/prisma/schema.prisma
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "UserRole"       AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER');
CREATE TYPE "UserStatus"     AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "DeviceStatus"   AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "MediaType"      AS ENUM ('VIDEO', 'IMAGE', 'HTML', 'URL');
CREATE TYPE "MediaStatus"    AS ENUM ('PROCESSING', 'READY', 'ERROR');
CREATE TYPE "ScheduleTarget" AS ENUM ('ALL', 'DEVICE', 'GROUP');

-- ─── Organizations ────────────────────────────────────────────────────────────

CREATE TABLE "organizations" (
    "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "name"              TEXT        NOT NULL,
    "slug"              TEXT        NOT NULL,
    "settings"          JSONB,
    "isActive"          BOOLEAN     NOT NULL DEFAULT true,
    "maxDevices"        INTEGER     NOT NULL DEFAULT 10,
    "maxUsers"          INTEGER     NOT NULL DEFAULT 5,
    "storageQuotaBytes" BIGINT      NOT NULL DEFAULT 10737418240,
    "pointsTotal"       INTEGER     NOT NULL DEFAULT 30,
    "pointsUsed"        INTEGER     NOT NULL DEFAULT 0,
    "licenseStatus"     TEXT        NOT NULL DEFAULT 'TRIAL',
    "suspendedAt"       TIMESTAMPTZ,
    "deviceAdminPin"    TEXT        NOT NULL DEFAULT '0000',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- ─── Platform Admins (no org affiliation — manage all orgs) ──────────────────

CREATE TABLE IF NOT EXISTS "platform_admins" (
    "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "email"        TEXT        NOT NULL,
    "passwordHash" TEXT        NOT NULL,
    "name"         TEXT        NOT NULL DEFAULT '',
    "isActive"     BOOLEAN     NOT NULL DEFAULT true,
    "lastLoginAt"  TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_key" ON "platform_admins"("email");

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "email"          TEXT        NOT NULL,
    "passwordHash"   TEXT        NOT NULL,
    "role"           "UserRole"  NOT NULL DEFAULT 'MANAGER',
    "status"         "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key"            ON "users"("email");
CREATE INDEX        "users_organizationId_idx"   ON "users"("organizationId");

-- ─── Devices ──────────────────────────────────────────────────────────────────

CREATE TABLE "devices" (
    "id"             TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT          NOT NULL,
    "name"           TEXT          NOT NULL,
    "location"       TEXT,
    "timezone"       TEXT          NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "pairingCode"    TEXT,
    "androidId"      TEXT,
    "model"          TEXT,
    "osVersion"      TEXT,
    "appVersion"     TEXT,
    "status"          "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "isLicensed"      BOOLEAN        NOT NULL DEFAULT true,
    "lastSeen"        TIMESTAMP(3),
    "lastOfflineAt"   TIMESTAMPTZ,
    "settings"        JSONB,
    "role"            TEXT           NOT NULL DEFAULT 'STANDALONE' CHECK ("role" IN ('MASTER','SLAVE','STANDALONE')),
    "downloadStatus"  TEXT           NOT NULL DEFAULT 'PENDING'    CHECK ("downloadStatus" IN ('PENDING','DOWNLOADING','READY','ERROR')),
    "contentReady"    BOOLEAN        NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "devices_androidId_key"              ON "devices"("androidId") WHERE "androidId" IS NOT NULL;
CREATE UNIQUE INDEX "devices_pairingCode_key"            ON "devices"("pairingCode") WHERE "pairingCode" IS NOT NULL;
CREATE UNIQUE INDEX "devices_org_name_unique"            ON "devices"("organizationId", lower("name"));
CREATE INDEX        "devices_organizationId_status_idx"  ON "devices"("organizationId", "status");
CREATE INDEX        "devices_lastSeen_idx"               ON "devices"("lastSeen");

-- ─── Device Groups ────────────────────────────────────────────────────────────

CREATE TABLE "device_groups" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "description"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_groups_organizationId_idx" ON "device_groups"("organizationId");

CREATE TABLE "device_group_members" (
    "deviceId" TEXT NOT NULL,
    "groupId"  TEXT NOT NULL,
    CONSTRAINT "device_group_members_pkey" PRIMARY KEY ("deviceId", "groupId")
);

-- ─── Media ────────────────────────────────────────────────────────────────────

CREATE TABLE "media" (
    "id"             TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT          NOT NULL,
    "uploadedById"   TEXT          NOT NULL,
    "title"          TEXT          NOT NULL,
    "description"    TEXT,
    "type"           "MediaType"   NOT NULL,
    "filePath"       TEXT          NOT NULL,
    "fileSize"       BIGINT        NOT NULL,
    "mimeType"       TEXT          NOT NULL,
    "fileHash"       TEXT          NOT NULL,
    "duration"       INTEGER,
    "width"          INTEGER,
    "height"         INTEGER,
    "thumbnailPath"  TEXT,
    "tags"           TEXT[]        NOT NULL DEFAULT '{}',
    "metadata"       JSONB,
    "status"         "MediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_org_title_unique"            ON "media"("organizationId", lower("title"));
CREATE INDEX        "media_organizationId_type_status_idx" ON "media"("organizationId", "type", "status");
CREATE INDEX        "media_fileHash_idx"                   ON "media"("fileHash");

-- ─── Playlists ────────────────────────────────────────────────────────────────

CREATE TABLE "playlists" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "description"    TEXT,
    "isDefault"      BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "playlists_org_name_unique"  ON "playlists"("organizationId", lower("name"));
CREATE INDEX        "playlists_organizationId_idx" ON "playlists"("organizationId");

CREATE TABLE "playlist_items" (
    "id"               TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
    "playlistId"       TEXT    NOT NULL,
    "mediaId"          TEXT    NOT NULL,
    "position"         INTEGER NOT NULL,
    "durationOverride" INTEGER,
    "transition"         TEXT,
    "transitionDuration" INTEGER,
    CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playlist_items_playlistId_position_idx" ON "playlist_items"("playlistId", "position");

-- ─── Schedules ────────────────────────────────────────────────────────────────

CREATE TABLE "schedules" (
    "id"             TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT             NOT NULL,
    "name"           TEXT             NOT NULL,
    "playlistId"     TEXT             NOT NULL,
    "targetType"     "ScheduleTarget" NOT NULL,
    "targetDeviceId" TEXT,
    "targetGroupId"  TEXT,
    "startDate"      TIMESTAMP(3)     NOT NULL,
    "endDate"        TIMESTAMP(3),
    "startTime"      TEXT,
    "endTime"        TEXT,
    "daysOfWeek"     INTEGER[]        NOT NULL DEFAULT '{}',
    "priority"       INTEGER          NOT NULL DEFAULT 0,
    "isActive"       BOOLEAN          NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schedules_org_name_unique"         ON "schedules"("organizationId", lower("name"));
CREATE INDEX        "schedules_organizationId_isActive_idx" ON "schedules"("organizationId", "isActive");
CREATE INDEX        "schedules_startDate_endDate_idx"        ON "schedules"("startDate", "endDate");

-- ─── Analytics ────────────────────────────────────────────────────────────────

CREATE TABLE "playback_logs" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT         NOT NULL,
    "mediaId"        TEXT         NOT NULL,
    "playedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationPlayed" INTEGER      NOT NULL,
    "completed"      BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT "playback_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playback_logs_deviceId_playedAt_idx" ON "playback_logs"("deviceId",  "playedAt" DESC);
CREATE INDEX "playback_logs_mediaId_playedAt_idx"  ON "playback_logs"("mediaId",   "playedAt" DESC);
CREATE INDEX "playback_logs_playedAt_idx"           ON "playback_logs"("playedAt"  DESC);

CREATE TABLE "device_health" (
    "id"               TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"         TEXT             NOT NULL,
    "cpuUsage"         DOUBLE PRECISION,
    "memoryUsage"      DOUBLE PRECISION,
    "storageTotal"     BIGINT,
    "storageUsed"      BIGINT,
    "networkType"      TEXT,
    "isOnline"         BOOLEAN          NOT NULL DEFAULT true,
    "ipAddress"        TEXT,
    "macAddress"       TEXT,
    "heapMemory"       BIGINT,
    "networkConnected" BOOLEAN,
    "reportedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_health_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_health_deviceId_reportedAt_idx" ON "device_health"("deviceId", "reportedAt" DESC);

-- ─── Device Comments ──────────────────────────────────────────────────────────

CREATE TABLE "device_comments" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,
    "userId"         TEXT,
    "userName"       TEXT,
    "comment"        TEXT        NOT NULL,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "device_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dc_deviceId_createdAt_idx" ON "device_comments"("deviceId", "createdAt" DESC);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

ALTER TABLE "users"
    ADD CONSTRAINT "users_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "devices"
    ADD CONSTRAINT "devices_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "device_groups"
    ADD CONSTRAINT "device_groups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "device_group_members"
    ADD CONSTRAINT "device_group_members_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "device_group_members_groupId_fkey"
    FOREIGN KEY ("groupId")  REFERENCES "device_groups"("id") ON DELETE CASCADE;

ALTER TABLE "media"
    ADD CONSTRAINT "media_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "media_uploadedById_fkey"
    FOREIGN KEY ("uploadedById")   REFERENCES "users"("id");

ALTER TABLE "playlists"
    ADD CONSTRAINT "playlists_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "playlist_items"
    ADD CONSTRAINT "playlist_items_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "playlist_items_mediaId_fkey"
    FOREIGN KEY ("mediaId")    REFERENCES "media"("id")     ON DELETE CASCADE;

ALTER TABLE "schedules"
    ADD CONSTRAINT "schedules_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "schedules_playlistId_fkey"
    FOREIGN KEY ("playlistId")     REFERENCES "playlists"("id"),
    ADD CONSTRAINT "schedules_targetGroupId_fkey"
    FOREIGN KEY ("targetGroupId")  REFERENCES "device_groups"("id");

ALTER TABLE "playback_logs"
    ADD CONSTRAINT "playback_logs_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "playback_logs_mediaId_fkey"
    FOREIGN KEY ("mediaId")  REFERENCES "media"("id")   ON DELETE CASCADE;

ALTER TABLE "device_health"
    ADD CONSTRAINT "device_health_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_comments"
    ADD CONSTRAINT "device_comments_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;

-- ─── License Transactions ──────────────────────────────────────────────────────

CREATE TABLE "license_transactions" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT         NOT NULL,
    "type"           TEXT         NOT NULL,
    "points"         INTEGER      NOT NULL,
    "deviceCount"    INTEGER,
    "description"    TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "license_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "license_transactions_orgId_createdAt_idx"
    ON "license_transactions"("organizationId", "createdAt" DESC);

ALTER TABLE "license_transactions"
    ADD CONSTRAINT "license_transactions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ─── Performance Indexes (Production) ──────────────────────────────────────────
-- These cover the hottest query paths: device heartbeat lookup, schedule
-- evaluation per device, and playlist item ordering during sync.

-- Device lookup by org (heartbeat, device list)
CREATE INDEX IF NOT EXISTS "idx_devices_orgId_status"
    ON "devices"("organizationId", "status");

-- Schedule lookup by org + active flag (sync query)
CREATE INDEX IF NOT EXISTS "idx_schedules_orgId_active"
    ON "schedules"("organizationId", "isActive");

-- Playlist items ordering (sync returns items sorted by position)
CREATE INDEX IF NOT EXISTS "idx_playlist_items_playlistId_pos"
    ON "playlist_items"("playlistId", "position");

-- Media lookup by org + status (media list + upload quota check)
CREATE INDEX IF NOT EXISTS "idx_media_orgId_status"
    ON "media"("organizationId", "status");

-- Playback logs by device + time (analytics queries)
CREATE INDEX IF NOT EXISTS "idx_playback_logs_deviceId_playedAt"
    ON "playback_logs"("deviceId", "playedAt" DESC);

-- Run on existing DB (idempotent):
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "deviceAdminPin" TEXT NOT NULL DEFAULT '0000';

-- ─── Schedule Assignments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_assignments (
    id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "scheduleId"     TEXT        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    "targetType"     TEXT        NOT NULL CHECK ("targetType" IN ('DEVICE', 'SITE')),
    "targetId"       TEXT        NOT NULL,
    "assignedById"   TEXT,
    "assignedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "sortOrder"      INT         NOT NULL DEFAULT 0,
    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY (id),
    CONSTRAINT "schedule_assignments_unique" UNIQUE ("scheduleId", "targetType", "targetId")
);
CREATE INDEX IF NOT EXISTS "sa_orgId_idx"        ON schedule_assignments ("organizationId");
CREATE INDEX IF NOT EXISTS "sa_target_idx"       ON schedule_assignments ("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "sa_scheduleId_idx"   ON schedule_assignments ("scheduleId");

-- ─── Programs (legacy — kept for migration only) ───────────────────────────────

CREATE TABLE IF NOT EXISTS programs (
    id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    description      TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "programs_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS "programs_org_name_unique" ON programs("organizationId", lower(name));
CREATE INDEX        IF NOT EXISTS "programs_orgId_idx"        ON programs("organizationId");

CREATE TABLE IF NOT EXISTS program_schedules (
    id           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "programId"  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    "scheduleId" TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    position     INT  NOT NULL DEFAULT 0,
    CONSTRAINT "program_schedules_pkey" PRIMARY KEY (id),
    CONSTRAINT "program_schedules_program_schedule_unique" UNIQUE ("programId", "scheduleId")
);
CREATE INDEX IF NOT EXISTS "ps_programId_idx" ON program_schedules("programId");

CREATE TABLE IF NOT EXISTS program_assignments (
    id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "programId"      TEXT        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    "targetType"     TEXT        NOT NULL CHECK("targetType" IN ('STORE', 'DEVICE')),
    "targetId"       TEXT        NOT NULL,
    "assignedById"   TEXT,
    "assignedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "program_assignments_pkey" PRIMARY KEY (id),
    CONSTRAINT "program_assignments_target_unique" UNIQUE ("targetType", "targetId")
);
CREATE INDEX IF NOT EXISTS "pa_orgId_idx"    ON program_assignments("organizationId");
CREATE INDEX IF NOT EXISTS "pa_programId_idx" ON program_assignments("programId");

-- ─── Unique name constraints per org (run IF NOT EXISTS for existing installs) ─
CREATE UNIQUE INDEX IF NOT EXISTS "stores_org_name_unique" ON stores("organizationId", lower(name));

-- ─── Site timezone (2026-03-17) ───────────────────────────────────────────────
-- Run on existing DB:
-- ALTER TABLE stores ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;
