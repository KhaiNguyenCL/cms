-- Digital Signage CMS - Initial Schema Migration
-- Generated from Prisma schema, run inside PostgreSQL container

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE', 'HTML', 'URL');
CREATE TYPE "MediaStatus" AS ENUM ('PROCESSING', 'READY', 'ERROR');
CREATE TYPE "ScheduleTarget" AS ENUM ('ALL', 'DEVICE', 'GROUP');

-- Organizations
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Users
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MANAGER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- Devices
CREATE TABLE "devices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pairingCode" TEXT,
    "androidId" TEXT,
    "model" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeen" TIMESTAMP(3),
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "devices_pairingCode_key" ON "devices"("pairingCode") WHERE "pairingCode" IS NOT NULL;
CREATE INDEX "devices_organizationId_status_idx" ON "devices"("organizationId", "status");
CREATE INDEX "devices_lastSeen_idx" ON "devices"("lastSeen");

-- Device Groups
CREATE TABLE "device_groups" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_groups_organizationId_idx" ON "device_groups"("organizationId");

-- Device Group Members
CREATE TABLE "device_group_members" (
    "deviceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "device_group_members_pkey" PRIMARY KEY ("deviceId", "groupId")
);

-- Media
CREATE TABLE "media" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "MediaType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailPath" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "metadata" JSONB,
    "status" "MediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_organizationId_type_status_idx" ON "media"("organizationId", "type", "status");
CREATE INDEX "media_fileHash_idx" ON "media"("fileHash");

-- Playlists
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playlists_organizationId_idx" ON "playlists"("organizationId");

-- Playlist Items
CREATE TABLE "playlist_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "playlistId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "durationOverride" INTEGER,
    "transition" TEXT,
    CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playlist_items_playlistId_position_idx" ON "playlist_items"("playlistId", "position");

-- Schedules
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "targetType" "ScheduleTarget" NOT NULL,
    "targetDeviceId" TEXT,
    "targetGroupId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "schedules_organizationId_isActive_idx" ON "schedules"("organizationId", "isActive");
CREATE INDEX "schedules_startDate_endDate_idx" ON "schedules"("startDate", "endDate");

-- Playback Logs
CREATE TABLE "playback_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationPlayed" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "playback_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playback_logs_deviceId_playedAt_idx" ON "playback_logs"("deviceId", "playedAt" DESC);
CREATE INDEX "playback_logs_mediaId_playedAt_idx" ON "playback_logs"("mediaId", "playedAt" DESC);
CREATE INDEX "playback_logs_playedAt_idx" ON "playback_logs"("playedAt" DESC);

-- Device Health
CREATE TABLE "device_health" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId" TEXT NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "storageTotal" BIGINT,
    "storageUsed" BIGINT,
    "networkType" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_health_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_health_deviceId_reportedAt_idx" ON "device_health"("deviceId", "reportedAt" DESC);

-- Foreign Keys
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "device_groups"("id") ON DELETE CASCADE;
ALTER TABLE "media" ADD CONSTRAINT "media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id");
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id");
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "device_groups"("id");
ALTER TABLE "playback_logs" ADD CONSTRAINT "playback_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;
ALTER TABLE "playback_logs" ADD CONSTRAINT "playback_logs_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE;
ALTER TABLE "device_health" ADD CONSTRAINT "device_health_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;
