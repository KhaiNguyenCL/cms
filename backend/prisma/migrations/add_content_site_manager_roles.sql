-- Migration: Add CONTENT_MANAGER and SITE_MANAGER roles, add siteId to users

-- 1. Add new enum values (safe — ADD VALUE is non-destructive in Postgres)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CONTENT_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SITE_MANAGER';

-- 2. Add siteId column to users (nullable, FK to stores)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "siteId" TEXT;
ALTER TABLE users
    ADD CONSTRAINT IF NOT EXISTS "users_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "users_siteId_idx" ON users("siteId");
