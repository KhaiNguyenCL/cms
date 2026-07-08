# PROJECT.md — Digital Signage CMS

> **Cách dùng file này:**
> - Cập nhật cột Status mỗi khi hoàn thành một feature
> - Thêm dòng mới vào đúng domain khi bắt đầu feature mới
> - Claude tự cập nhật file này sau mỗi lần implement xong

**Legend:** ✅ Done · 🔄 In Progress · 📋 Planned · ❌ Blocked

---

## 1. Authentication & Identity

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Login / Logout / Refresh JWT | ✅ | ✅ | — | ✅ Done |
| Device pairing (tạo JWT cho Android) | ✅ | ✅ | — | ✅ Done |
| Platform Auth (Super Admin login riêng) | ✅ | ✅ | — | ✅ Done |
| User CRUD + role/status update | ✅ | ✅ | — | ✅ Done |

---

## 2. Organizations & Multi-tenancy

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Org CRUD + settings | ✅ | ✅ | — | ✅ Done |
| Quota (device / user / storage) | ✅ | ✅ | — | ✅ Done |
| Storage quota module | ✅ | ✅ | — | ✅ Done |
| X-Organization-Id org-switching (Super Admin) | ✅ | ✅ | — | ✅ Done |

---

## 3. Device Management

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Device CRUD + settings | ✅ | ✅ | — | ✅ Done |
| Device commands (12 lệnh) | ✅ | ✅ | ✅ device-notification | ✅ Done |
| Device health (CPU/mem/storage/network) | ✅ | ✅ | — | ✅ Done |
| Device comments | ✅ | ✅ | — | ✅ Done |
| Device groups (CRUD + members) | ✅ | ✅ | — | ✅ Done |
| Heartbeat + content hash sync | ✅ | — | — | ✅ Done |
| Soft delete + Trash tab | ✅ | ✅ | ✅ media-purge | ✅ Done |

---

## 4. Content Management

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Media upload (VIDEO / IMAGE / HTML / URL) | ✅ | ✅ | ✅ thumbnail | ✅ Done |
| Video transcoding | ✅ | ✅ | ✅ video-transcoding | ✅ Done |
| Signed URLs + thumbnail generation | ✅ | ✅ | — | ✅ Done |
| Media soft delete + Trash tab | ✅ | ✅ | ✅ media-purge (30 ngày) | ✅ Done |
| Playlist CRUD + ordered items + reorder | ✅ | ✅ | — | ✅ Done |
| Content history (sync logs per device) | ✅ | ✅ | — | ✅ Done |

---

## 5. Scheduling

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Schedule CRUD (time / DOW / timezone) | ✅ | ✅ | — | ✅ Done |
| Schedule assignments (bind to device / site) | ✅ | ✅ | — | ✅ Done |

---

## 6. Sites & NTP Sync

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Sites (stores) CRUD | ✅ | ✅ | — | ✅ Done |
| Sync Groups (NTP playback sync) | ✅ | ✅ | — | ✅ Done |
| broadcastSyncState → startEpoch + totalDurationMs | ✅ | ✅ | — | ✅ Done |

---

## 7. License System

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Per-device license (assign / transfer / revoke) | ✅ | ✅ | — | ✅ Done |
| License pool management (pkg12m/24m/36m) | ✅ | ✅ | — | ✅ Done |
| Purchase request flow (PENDING → APPROVED) | ✅ | ✅ | — | ✅ Done |
| Daily license deduction | ✅ | — | ✅ license-deduction | ✅ Done |

---

## 8. Analytics & History

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Dashboard KPIs + playback stats | ✅ | ✅ | ✅ generate-reports | ✅ Done |
| Content history (device_content_logs) | ✅ | ✅ | — | ✅ Done |
| Software history (app version snapshots) | ✅ | ✅ | — | ✅ Done |
| Action history (audit log) | ✅ | ✅ | — | ✅ Done |
| Nightly log cleanup | ✅ | — | ✅ cleanup-logs | ✅ Done |

---

## 9. Alerts & Notifications

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| Alarm (device offline alerts + history) | ✅ | ✅ | — | ✅ Done |
| In-app notifications | ✅ | ✅ | — | ✅ Done |
| Mail config (SMTP settings) | ✅ | ✅ | — | ✅ Done |
| Mail templates | ✅ | ✅ | ✅ mail-notification | ✅ Done |

---

## 10. Backup & Restore

| Feature | Backend | Frontend | Worker | Status |
|---|---|---|---|---|
| **Part 1 — Soft Delete foundation** | | | | |
| Media soft delete (deletedAt, không xóa file) | ✅ | ✅ | — | ✅ Done |
| Device soft delete (deletedAt, giữ JWT) | ✅ | ✅ | — | ✅ Done |
| Media purge worker (hard delete sau 30 ngày) | — | — | ✅ media-purge | ✅ Done |
| **Part 2 — Per-Org Snapshot** | | | | |
| Snapshot CRUD (list / create / delete) | ✅ | ✅ | — | ✅ Done |
| Restore từ snapshot (withTransaction) | ✅ | ✅ | — | ✅ Done |
| Auto daily backup (02:00 UTC) | — | — | ✅ backup-snapshot | ✅ Done |
| Backup plan request flow (ADMIN → SUPER_ADMIN) | ✅ | ✅ | — | ✅ Done |
| Backup plan UI trong SuperAdminPage | ✅ | ✅ | — | ✅ Done |

---

## 11. Android Player (E:\player)

| Feature | Kotlin | Status |
|---|---|---|
| WebView shell + kiosk mode (lock-task) | ✅ | ✅ Done |
| Pairing wizard (PairingActivity) | ✅ | ✅ Done |
| Socket.IO CommandService (foreground service) | ✅ | ✅ Done |
| PlayerBridge (CommandService ↔ MainActivity) | ✅ | ✅ Done |
| Media cache + background download | ✅ | ✅ Done |
| Device Owner setup (DeviceAdmin) | ✅ | ✅ Done |
| Auto-start on boot (multi-OEM) | ✅ | ✅ Done |
| Back/Home button guard + PIN dialog | ✅ | ✅ Done |
| Crash recovery (AlarmManager restart) | ✅ | ✅ Done |
| Encrypted credentials (AES-256) | ✅ | ✅ Done |
| NTP sync playback (startOffsetMs) | ✅ | ✅ Done |

---

## 12. Infrastructure & DevOps

| Feature | Status | Ghi chú |
|---|---|---|
| Docker Compose (Postgres + Redis + pgAdmin) | ✅ Done | `docker/` |
| BullMQ workers (8 workers) | ✅ Done | `shared/jobs/workers/` |
| Socket.IO (/device + /admin namespaces) | ✅ Done | `shared/socket/` |
| Redis typed key helpers | ✅ Done | `shared/cache/redis.ts` |
| Prisma migrations | ✅ Done | `prisma/` |
| Raw SQL init script | ✅ Done | `docker/postgres/init.sql` |

---

## Backlog / Tính năng đang xem xét

| Idea | Priority | Ghi chú |
|---|---|---|
| — | — | Thêm vào đây khi có ý tưởng mới |

---

*Cập nhật lần cuối: 2026-05-28*
