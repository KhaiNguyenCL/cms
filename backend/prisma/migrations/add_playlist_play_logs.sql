-- ============================================================
--  Add playlist_play_logs table
--  Track full playlist cycle completions per device
-- ============================================================

CREATE TABLE IF NOT EXISTS "playlist_play_logs" (
    "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "deviceId"    TEXT        NOT NULL,
    "playlistId"  TEXT        NOT NULL,
    "startedAt"   TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,
    "completed"   BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "playlist_play_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ppl_deviceId_startedAt_idx"
    ON "playlist_play_logs"("deviceId", "startedAt" DESC);
