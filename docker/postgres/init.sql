-- =============================================================================
--  SignageCMS — PostgreSQL Init Script
--  Source of truth for fresh database initialization.
--  Run automatically when Docker container starts for the first time.
--
--  Last updated: 2026-04-16
--  Reflects all migrations applied through this date.
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "UserRole"       AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER', 'CONTENT_MANAGER', 'SITE_MANAGER');
CREATE TYPE "UserStatus"     AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "DeviceStatus"   AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "MediaType"      AS ENUM ('VIDEO', 'IMAGE', 'GIF', 'HTML', 'URL');
CREATE TYPE "MediaStatus"    AS ENUM ('PROCESSING', 'READY', 'ERROR');
CREATE TYPE "ScheduleTarget" AS ENUM ('ALL', 'DEVICE', 'GROUP');

-- ─── Organizations ────────────────────────────────────────────────────────────

CREATE TABLE "organizations" (
    "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "name"              TEXT        NOT NULL,
    "slug"              TEXT        NOT NULL,
    "settings"          JSONB,
    "isActive"          BOOLEAN     NOT NULL DEFAULT true,
    "isSystem"          BOOLEAN     NOT NULL DEFAULT false,
    "maxDevices"        INTEGER     NOT NULL DEFAULT 10,
    "maxUsers"          INTEGER     NOT NULL DEFAULT 5,
    "storageQuotaBytes" BIGINT      NOT NULL DEFAULT 10737418240,
    "storageBaseMb"     INTEGER     NOT NULL DEFAULT 100,
    "ext50mb"           INTEGER     NOT NULL DEFAULT 0,
    "ext100mb"          INTEGER     NOT NULL DEFAULT 0,
    "ext200mb"          INTEGER     NOT NULL DEFAULT 0,
    "pkg12m"            INTEGER     NOT NULL DEFAULT 0,
    "pkg24m"            INTEGER     NOT NULL DEFAULT 0,
    "pkg36m"            INTEGER     NOT NULL DEFAULT 0,
    "deviceAdminPin"    TEXT        NOT NULL DEFAULT '0000',
    "backupPlan"        INTEGER     DEFAULT NULL,  -- NULL | 3 | 7 | 10 (days)
    "suspendedAt"       TIMESTAMPTZ,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- ─── Platform Admins ──────────────────────────────────────────────────────────

CREATE TABLE "platform_admins" (
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
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- ─── Mail Configs ─────────────────────────────────────────────────────────────

CREATE TABLE "mail_configs" (
    "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "name"        TEXT        NOT NULL,
    "host"        TEXT        NOT NULL,
    "port"        INTEGER     NOT NULL DEFAULT 587,
    "secure"      BOOLEAN     NOT NULL DEFAULT false,
    "username"    TEXT        NOT NULL,
    "password"    TEXT        NOT NULL,
    "fromName"    TEXT        NOT NULL,
    "fromAddress" TEXT        NOT NULL,
    "isActive"    BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "mail_configs_pkey" PRIMARY KEY ("id")
);

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT         NOT NULL,
    "email"          TEXT         NOT NULL,
    "passwordHash"   TEXT         NOT NULL,
    "role"           "UserRole"   NOT NULL DEFAULT 'MANAGER',
    "status"         "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "siteId"         TEXT,
    "isRoot"         BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key"          ON "users"("email");
CREATE INDEX        "users_organizationId_idx" ON "users"("organizationId");

-- ─── Stores (Sites / Sync Groups) ────────────────────────────────────────────
-- Defined before devices because devices.storeId references stores.id

CREATE TABLE "stores" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"  TEXT        NOT NULL,
    "name"            TEXT        NOT NULL,
    "description"     TEXT,
    "address"         TEXT,
    "contact"         TEXT,
    "timezone"        TEXT        DEFAULT NULL,
    "openDate"        TIMESTAMPTZ,
    "closeDate"       TIMESTAMPTZ,
    "playlistId"      TEXT,
    "startEpoch"      BIGINT,
    "totalDurationMs" INTEGER,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stores_org_name_unique" ON "stores"("organizationId", lower("name"));
CREATE INDEX        "stores_orgId_idx"        ON "stores"("organizationId");

-- ─── Devices ──────────────────────────────────────────────────────────────────

CREATE TABLE "devices" (
    "id"               TEXT           NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"   TEXT           NOT NULL,
    "name"             TEXT           NOT NULL,
    "location"         TEXT,
    "timezone"         TEXT           NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "pairingCode"      TEXT,
    "androidId"        TEXT,
    "model"            TEXT,
    "osVersion"        TEXT,
    "appVersion"       TEXT,
    "status"           "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "isLicensed"       BOOLEAN        NOT NULL DEFAULT false,
    "licenseExpiresAt" TIMESTAMPTZ,
    "licenseStartDate" TIMESTAMPTZ,
    "licenseEndDate"   TIMESTAMPTZ,
    "lastSeen"         TIMESTAMPTZ,
    "lastOnlineAt"     TIMESTAMPTZ,
    "lastOfflineAt"    TIMESTAMPTZ,
    "settings"         JSONB,
    "storeId"          TEXT,
    "role"             TEXT           NOT NULL DEFAULT 'STANDALONE' CHECK ("role" IN ('MASTER','SLAVE','STANDALONE')),
    "downloadStatus"   TEXT           NOT NULL DEFAULT 'PENDING'    CHECK ("downloadStatus" IN ('PENDING','DOWNLOADING','READY','ERROR')),
    "contentReady"     BOOLEAN        NOT NULL DEFAULT false,
    "deletedAt"        TIMESTAMPTZ    DEFAULT NULL,
    "createdAt"        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    "updatedAt"        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "devices_androidId_key"             ON "devices"("androidId") WHERE "androidId" IS NOT NULL;
CREATE UNIQUE INDEX "devices_pairingCode_key"           ON "devices"("pairingCode") WHERE "pairingCode" IS NOT NULL;
CREATE UNIQUE INDEX "devices_org_name_unique"           ON "devices"("organizationId", lower("name"));
CREATE INDEX        "devices_organizationId_status_idx" ON "devices"("organizationId", "status");
CREATE INDEX        "devices_lastSeen_idx"              ON "devices"("lastSeen");
CREATE INDEX        "devices_storeId_idx"               ON "devices"("storeId");
CREATE INDEX        "idx_devices_org_deleted"           ON "devices"("organizationId", "deletedAt");

-- ─── Device Groups ────────────────────────────────────────────────────────────

CREATE TABLE "device_groups" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "name"           TEXT        NOT NULL,
    "description"    TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    "deletedAt"      TIMESTAMPTZ   DEFAULT NULL,
    "createdAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_org_title_unique"              ON "media"("organizationId", lower("title"));
CREATE INDEX        "media_organizationId_type_status_idx" ON "media"("organizationId", "type", "status");
CREATE INDEX        "media_fileHash_idx"                   ON "media"("fileHash");
CREATE INDEX        "idx_media_org_deleted"                ON "media"("organizationId", "deletedAt");

-- ─── Playlists ────────────────────────────────────────────────────────────────

CREATE TABLE "playlists" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"  TEXT        NOT NULL,
    "name"            TEXT        NOT NULL,
    "description"     TEXT,
    "isDefault"       BOOLEAN     NOT NULL DEFAULT false,
    "isAutoGenerated" BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "playlists_org_name_unique"    ON "playlists"("organizationId", lower("name"));
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
    "startDate"      TIMESTAMPTZ      NOT NULL,
    "endDate"        TIMESTAMPTZ,
    "startTime"      TEXT,
    "endTime"        TEXT,
    "daysOfWeek"     INTEGER[]        NOT NULL DEFAULT '{}',
    "priority"       INTEGER          NOT NULL DEFAULT 0,
    "isActive"       BOOLEAN          NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schedules_org_name_unique"          ON "schedules"("organizationId", lower("name"));
CREATE INDEX        "schedules_organizationId_isActive_idx" ON "schedules"("organizationId", "isActive");
CREATE INDEX        "schedules_startDate_endDate_idx"        ON "schedules"("startDate", "endDate");

-- ─── Schedule Assignments ─────────────────────────────────────────────────────

CREATE TABLE "schedule_assignments" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "scheduleId"     TEXT        NOT NULL,
    "targetType"     TEXT        NOT NULL CHECK ("targetType" IN ('DEVICE', 'SITE')),
    "targetId"       TEXT        NOT NULL,
    "assignedById"   TEXT,
    "assignedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "sortOrder"      INTEGER     NOT NULL DEFAULT 0,
    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_assignments_unique" UNIQUE ("scheduleId", "targetType", "targetId")
);
CREATE INDEX "sa_orgId_idx"      ON "schedule_assignments"("organizationId");
CREATE INDEX "sa_target_idx"     ON "schedule_assignments"("targetType", "targetId");
CREATE INDEX "sa_scheduleId_idx" ON "schedule_assignments"("scheduleId");

-- ─── Analytics ────────────────────────────────────────────────────────────────

CREATE TABLE "playback_logs" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        NOT NULL,
    "mediaId"        TEXT        NOT NULL,
    "playedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "durationPlayed" INTEGER     NOT NULL,
    "completed"      BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT "playback_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playback_logs_deviceId_playedAt_idx" ON "playback_logs"("deviceId", "playedAt" DESC);
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
    "processCpuPercent" DOUBLE PRECISION,
    "wanIp"            TEXT,
    "subnet"           TEXT,
    "ipProtocol"       TEXT,
    "reportedAt"       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT "device_health_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_health_deviceId_reportedAt_idx" ON "device_health"("deviceId", "reportedAt" DESC);

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

CREATE TABLE "device_content_logs" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,
    "playlistId"     TEXT,
    "playlistName"   TEXT,
    "scheduleName"   TEXT,
    "syncedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "device_content_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dcl_deviceId_syncedAt_idx" ON "device_content_logs"("deviceId", "syncedAt" DESC);

CREATE TABLE "playlist_play_logs" (
    "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"    TEXT        NOT NULL,
    "playlistId"  TEXT        NOT NULL,
    "startedAt"   TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "completed"   BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "playlist_play_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ppl_deviceId_startedAt_idx" ON "playlist_play_logs"("deviceId", "startedAt" DESC);

-- ─── License ──────────────────────────────────────────────────────────────────

CREATE TABLE "device_licenses" (
    "id"                      TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"                TEXT        NOT NULL,
    "organizationId"          TEXT        NOT NULL,
    "packageType"             TEXT        NOT NULL,  -- '12M' | '24M' | '36M'
    "activatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt"               TIMESTAMPTZ NOT NULL,
    "activatedById"           TEXT,
    "activatedByName"         TEXT,
    "transferredFromDeviceId" TEXT,
    CONSTRAINT "device_licenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_licenses_deviceId_unique" UNIQUE ("deviceId")
);
CREATE INDEX "device_licenses_orgId_idx" ON "device_licenses"("organizationId");

CREATE TABLE "license_history" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"        TEXT,
    "deviceName"      TEXT,
    "organizationId"  TEXT        NOT NULL,
    "action"          TEXT        NOT NULL,  -- ASSIGN | TRANSFER | ADJUST_EXPIRY | REVOKE | EDIT_POOL
    "detail"          JSONB,
    "performedById"   TEXT,
    "performedByName" TEXT,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "license_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "license_history_orgId_createdAt_idx" ON "license_history"("organizationId", "createdAt" DESC);

CREATE TABLE "purchase_requests" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"  TEXT        NOT NULL,
    "requestedById"   TEXT,
    "requestedByName" TEXT,
    "packageType"     TEXT        NOT NULL,  -- '12M' | '24M' | '36M'
    "quantity"        INTEGER     NOT NULL,
    "status"          TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    "note"            TEXT,
    "adminNote"       TEXT,
    "resolvedById"    TEXT,
    "resolvedAt"      TIMESTAMPTZ,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_requests_orgId_createdAt_idx" ON "purchase_requests"("organizationId", "createdAt" DESC);
CREATE INDEX "purchase_requests_status_idx"           ON "purchase_requests"("status", "createdAt" DESC);

-- License transfer requests (org users → SUPER_ADMIN approves)
CREATE TABLE "transfer_requests" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"   TEXT        NOT NULL,
    "fromDeviceId"     TEXT        NOT NULL,
    "fromDeviceName"   TEXT        NOT NULL,
    "toDeviceId"       TEXT        NOT NULL,
    "toDeviceName"     TEXT        NOT NULL,
    "requestedById"    TEXT,
    "requestedByName"  TEXT,
    "status"           TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    "note"             TEXT,
    "adminNote"        TEXT,
    "resolvedById"     TEXT,
    "resolvedAt"       TIMESTAMPTZ,
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tr_orgId_idx"  ON "transfer_requests"("organizationId", "createdAt" DESC);
CREATE INDEX "tr_status_idx" ON "transfer_requests"("status", "createdAt" DESC);

-- ─── Storage Quota Pool ───────────────────────────────────────────────────────

CREATE TABLE "storage_purchase_requests" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"  TEXT        NOT NULL,
    "packageMb"       INTEGER     NOT NULL,   -- 50 | 100 | 200
    "quantity"        INTEGER     NOT NULL DEFAULT 1,
    "status"          TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    "note"            TEXT,
    "adminNote"       TEXT,
    "requestedById"   TEXT,
    "requestedByName" TEXT,
    "resolvedById"    TEXT,
    "resolvedAt"      TIMESTAMPTZ,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "storage_purchase_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "spr_orgId_idx"  ON "storage_purchase_requests"("organizationId");
CREATE INDEX "spr_status_idx" ON "storage_purchase_requests"("status");

CREATE TABLE "storage_history" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"  TEXT        NOT NULL,
    "action"          TEXT        NOT NULL,  -- ADJUST_POOL | PURCHASE_APPROVED
    "performedById"   TEXT,
    "performedByName" TEXT,
    "detail"          JSONB,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "storage_history_pkey" PRIMARY KEY ("id")
);

-- ─── Backup Plan Requests ─────────────────────────────────────────────────────

CREATE TABLE "backup_plan_requests" (
    "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId"   TEXT        NOT NULL,
    "requestedPlan"    INTEGER     NOT NULL,  -- 3 | 7 | 10
    "status"           TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
    "note"             TEXT,
    "adminNote"        TEXT,
    "requestedById"    TEXT,
    "requestedByName"  TEXT,
    "resolvedById"     TEXT,
    "resolvedAt"       TIMESTAMPTZ,
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "backup_plan_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bpr_orgId_idx"  ON "backup_plan_requests"("organizationId");
CREATE INDEX "bpr_status_idx" ON "backup_plan_requests"("status");

-- ─── Org Backups (Snapshot / Restore) ────────────────────────────────────────

CREATE TABLE "org_backups" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "label"          TEXT        NOT NULL,
    "type"           TEXT        NOT NULL DEFAULT 'MANUAL',  -- 'MANUAL' | 'AUTO'
    "snapshot"       JSONB       NOT NULL,
    "createdBy"      TEXT,  -- userId, NULL if AUTO
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "org_backups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "org_backups_orgId_createdAt_idx" ON "org_backups"("organizationId", "createdAt" DESC);

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE "notifications" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "type"           TEXT        NOT NULL,
    "title"          TEXT        NOT NULL,
    "body"           TEXT,
    "entityId"       TEXT,
    "entityType"     TEXT,
    "read"           BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notif_orgId_createdAt_idx" ON "notifications"("organizationId", "createdAt" DESC);
CREATE INDEX "notif_orgId_read_idx"      ON "notifications"("organizationId", "read");

-- ─── Action Logs ─────────────────────────────────────────────────────────────

CREATE TABLE "action_logs" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "userId"         TEXT,
    "userEmail"      TEXT,
    "action"         TEXT        NOT NULL,  -- CREATE | UPDATE | DELETE
    "resourceType"   TEXT        NOT NULL,  -- DEVICE | MEDIA | PLAYLIST | SCHEDULE | USER | STORE | VERSION
    "resourceId"     TEXT,
    "resourceName"   TEXT,
    "detail"         JSONB,
    "occurredAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "action_logs_orgId_occurredAt_idx" ON "action_logs"("organizationId", "occurredAt" DESC);

-- ─── Alarm / Device Status Events ────────────────────────────────────────────

CREATE TABLE "device_status_events" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,
    "event"          TEXT        NOT NULL,   -- ONLINE | OFFLINE | APP_EXIT
    "reason"         TEXT        NOT NULL,   -- NETWORK | SOFTWARE | DEVICE_OFF
    "occurredAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "device_status_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dse_deviceId_occurredAt_idx" ON "device_status_events"("deviceId", "occurredAt" DESC);
CREATE INDEX "dse_orgId_occurredAt_idx"    ON "device_status_events"("organizationId", "occurredAt" DESC);

CREATE TABLE "alarm_emails" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "email"          TEXT        NOT NULL,
    "enabled"        BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "alarm_emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alarm_emails_org_email_unique" UNIQUE ("organizationId", "email")
);
CREATE INDEX "alarm_emails_orgId_idx" ON "alarm_emails"("organizationId");

-- ─── Software / Version History ───────────────────────────────────────────────

CREATE TABLE "app_versions" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT,  -- NULL = global / available to all orgs
    "versionName"    TEXT        NOT NULL,
    "versionCode"    INTEGER     NOT NULL,
    "downloadUrl"    TEXT        NOT NULL,
    "releaseNotes"   TEXT,
    "isLatest"       BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "app_versions_orgId_idx" ON "app_versions"("organizationId");

CREATE TABLE "device_version_logs" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"       TEXT        NOT NULL,
    "organizationId" TEXT        NOT NULL,
    "fromVersion"    TEXT,
    "toVersion"      TEXT        NOT NULL,
    "method"         TEXT        NOT NULL DEFAULT 'HEARTBEAT',  -- HEARTBEAT | OTA | ROLLBACK
    "triggeredBy"    TEXT,
    "occurredAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "device_version_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dvl_deviceId_occurredAt_idx" ON "device_version_logs"("deviceId", "occurredAt" DESC);

-- ─── Programs (legacy — kept for migration compatibility) ─────────────────────

CREATE TABLE "programs" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "name"           TEXT        NOT NULL,
    "description"    TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "programs_org_name_unique" ON "programs"("organizationId", lower("name"));
CREATE INDEX        "programs_orgId_idx"        ON "programs"("organizationId");

CREATE TABLE "program_schedules" (
    "id"         TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
    "programId"  TEXT    NOT NULL,
    "scheduleId" TEXT    NOT NULL,
    "position"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "program_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "program_schedules_program_schedule_unique" UNIQUE ("programId", "scheduleId")
);
CREATE INDEX "ps_programId_idx" ON "program_schedules"("programId");

CREATE TABLE "program_assignments" (
    "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT        NOT NULL,
    "programId"      TEXT        NOT NULL,
    "targetType"     TEXT        NOT NULL CHECK("targetType" IN ('STORE', 'DEVICE')),
    "targetId"       TEXT        NOT NULL,
    "assignedById"   TEXT,
    "assignedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "program_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "program_assignments_target_unique" UNIQUE ("targetType", "targetId")
);
CREATE INDEX "pa_orgId_idx"    ON "program_assignments"("organizationId");
CREATE INDEX "pa_programId_idx" ON "program_assignments"("programId");

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

-- Organizations
ALTER TABLE "users"
    ADD CONSTRAINT "users_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "users"
    ADD CONSTRAINT "users_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "stores"("id") ON DELETE SET NULL;

ALTER TABLE "stores"
    ADD CONSTRAINT "stores_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "stores"
    ADD CONSTRAINT "stores_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE SET NULL;

ALTER TABLE "devices"
    ADD CONSTRAINT "devices_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "devices"
    ADD CONSTRAINT "devices_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL;

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
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id");

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

ALTER TABLE "schedule_assignments"
    ADD CONSTRAINT "schedule_assignments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "schedule_assignments_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE;

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

ALTER TABLE "device_licenses"
    ADD CONSTRAINT "device_licenses_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "device_licenses_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "license_history"
    ADD CONSTRAINT "license_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "transfer_requests"
    ADD CONSTRAINT "transfer_requests_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "storage_purchase_requests"
    ADD CONSTRAINT "storage_purchase_requests_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "backup_plan_requests"
    ADD CONSTRAINT "backup_plan_requests_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "org_backups"
    ADD CONSTRAINT "org_backups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "programs"
    ADD CONSTRAINT "programs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "program_schedules"
    ADD CONSTRAINT "program_schedules_programId_fkey"
    FOREIGN KEY ("programId")  REFERENCES "programs"("id")  ON DELETE CASCADE,
    ADD CONSTRAINT "program_schedules_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE;

ALTER TABLE "program_assignments"
    ADD CONSTRAINT "program_assignments_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE;

ALTER TABLE "device_status_events"
    ADD CONSTRAINT "device_status_events_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_version_logs"
    ADD CONSTRAINT "device_version_logs_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;

-- ─── Performance Indexes ──────────────────────────────────────────────────────

CREATE INDEX "idx_devices_orgId_status"         ON "devices"("organizationId", "status");
CREATE INDEX "idx_schedules_orgId_active"        ON "schedules"("organizationId", "isActive");
CREATE INDEX "idx_playlist_items_playlistId_pos" ON "playlist_items"("playlistId", "position");
CREATE INDEX "idx_media_orgId_status"            ON "media"("organizationId", "status");
CREATE INDEX "idx_playback_logs_deviceId_playedAt" ON "playback_logs"("deviceId", "playedAt" DESC);

-- =============================================================================
--  Seed Data
--  Email:    admin@dms.saigontech.net
--  Password: Admin@123456  ← Change immediately after first login
-- =============================================================================

INSERT INTO "organizations" (
    id, name, slug, "isActive", "isSystem",
    "maxDevices", "maxUsers", "storageQuotaBytes"
) VALUES (
    'org-system-001',
    'DMS Signage',
    'dms-signage',
    true,
    true,
    9999,
    9999,
    107374182400  -- 100GB
) ON CONFLICT DO NOTHING;

INSERT INTO "users" (
    id, "organizationId", email, "passwordHash", role, status
) VALUES (
    'user-super-admin-001',
    'org-system-001',
    'admin@dms.saigontech.net',
    '$2b$12$iRJDzXiY25C5NKB.gVRXyuSB4d8Y2f56tB0/RrzJSHQWoT2d2kINy',
    'SUPER_ADMIN',
    'ACTIVE'
) ON CONFLICT DO NOTHING;
