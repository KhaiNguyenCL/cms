# CLAUDE.md — Digital Signage CMS

## Project Overview

Multi-tenant digital signage CMS for managing Android TV devices.
**Stack:** Node.js + TypeScript + Express · React + Vite + MUI v7 · PostgreSQL + Prisma · Redis + BullMQ · Socket.IO
**Android Player:** E:\player (Kotlin, WebView shell + Socket.IO command service)

---

## Folder Structure

```
backend/src/
├── config/index.ts              # All env vars — read from here, never process.env directly
├── modules/<feature>/           # One folder per domain
│   ├── <feature>.routes.ts      # Router: auth + authorize + validate + controller
│   ├── <feature>.controller.ts  # Parse req → call service → res.json
│   ├── <feature>.service.ts     # Business logic + raw SQL queries
│   └── <feature>.schema.ts      # Zod input validation schemas
├── shared/
│   ├── app.ts                   # Express setup, mount all routers
│   ├── cache/redis.ts           # Redis singleton + typed key helpers
│   ├── database/db.ts           # query(), queryOne(), withTransaction()
│   ├── jobs/queues.ts           # BullMQ queue definitions
│   ├── jobs/workers/            # BullMQ worker implementations
│   ├── middleware/auth.middleware.ts
│   ├── middleware/error.middleware.ts
│   ├── socket/socket.server.ts  # Socket.IO: /device + /admin namespaces
│   ├── utils/logger.ts
│   └── utils/quota.ts           # checkDeviceQuota, checkUserQuota, checkStorageQuota
└── server.ts                    # Bootstrap + graceful shutdown

frontend/src/
├── api/client.ts                # Axios instance, token refresh interceptor
├── api/<feature>.api.ts         # One file per feature
├── pages/<feature>/             # One folder per page
├── store/slices/authSlice.ts    # User auth + org switching state (managingOrgId for SUPER_ADMIN)
├── store/slices/uiSlice.ts      # Toast + color mode
├── types/index.ts               # All shared TypeScript interfaces
├── hooks/                       # Custom React hooks
└── App.tsx                      # Routes + providers

E:\player/                       # Android TV Player App (Kotlin)
├── app/src/main/java/com/signagecms/player/
│   ├── MainActivity.kt          # WebView container, kiosk mode, watchdog
│   ├── CommandService.kt        # Foreground service, Socket.IO /device namespace
│   ├── PairingActivity.kt       # First-launch pairing wizard
│   ├── PlayerBridge.kt          # Bridge CommandService ↔ MainActivity
│   ├── ApiClient.kt             # REST client with retry
│   ├── MediaCache.kt            # Local file cache
│   ├── MediaDownloadManager.kt  # Background downloader (coroutines)
│   ├── KioskManager.kt          # Device Owner lock-task mode
│   ├── AdminReceiver.kt         # Device Admin component
│   ├── BootReceiver.kt          # Auto-start on boot (multi-OEM)
│   ├── DeviceInfo.kt            # CPU/memory/network info
│   └── EncryptedPrefs.kt        # AES-256 credential storage
```

---

## Backend Modules (19 total)

| Module | Routes | Description |
|---|---|---|
| `auth` | `/api/auth` | JWT login/logout/refresh, device pairing |
| `platform-auth` | `/api/platform` | Super-admin platform access |
| `organizations` | `/api/organizations` | Multi-tenant org CRUD, quotas, settings |
| `users` | `/api/users` | User CRUD, role/status updates |
| `devices` | `/api/devices` | Device registration, commands, comments, health |
| `device-sync` | `/api/device` | Heartbeat, content hash sync `/sync` endpoint |
| `device-groups` | `/api/device-groups` | Group CRUD, member management |
| `media` | `/api/media` | Upload, signed URLs, thumbnail generation |
| `playlists` | `/api/playlists` | Playlist CRUD, ordered items, reorder |
| `schedules` | `/api/schedules` | Schedules with time/DOW/timezone filtering |
| `schedule-assignments` | `/api/schedule-assignments` | Bind schedules to devices/sites (sortOrder) |
| `sites` | `/api/sites` | Store/site management, device clustering, NTP sync |
| `analytics` | `/api/analytics` | Dashboard KPIs, playback stats, device health |
| `license` | `/api/license` | Per-device license assign/transfer/revoke, pool management |
| `content-history` | `/api/content-history` | Playlist sync logs per device (`device_content_logs`) |
| `software-history` | `/api/software-history` | Device app version tracking |
| `action-history` | `/api/action-history` | Admin action audit logs |
| `alarm` | `/api/alarm` | Device offline alerts, status history |

---

## Database Schema (Current — 14 Models)

```
Organization  — multi-tenant root (quota, license pool pkg12m/24m/36m, deviceAdminPin)
User          — role: SUPER_ADMIN | ADMIN | MANAGER | VIEWER; status: ACTIVE | INACTIVE | SUSPENDED
Device        — status: ONLINE | OFFLINE | ERROR; isLicensed, licenseExpiresAt, lastOfflineAt, storeId
DeviceGroup   — many-to-many via DeviceGroupMember
DeviceHealth  — CPU, memory, storage, network, IP, MAC, heap, wanIp (per heartbeat)
DeviceComment — notes left by admins on a device
Media         — type: VIDEO | IMAGE | HTML | URL; status: PROCESSING | READY | ERROR
PlaylistItem  — position, durationOverride, transition
Playlist      — isDefault, isAutoGenerated (auto-created for direct media schedules)
Schedule      — targetType: ALL | DEVICE | GROUP; daysOfWeek[], startTime/endTime, priority
PlaybackLog   — deviceId, mediaId, durationPlayed, completed
Store         — site/location; startEpoch+totalDurationMs for NTP sync playback
DeviceLicense — per-device license (packageType: 12M|24M|36M, activatedAt, expiresAt)
LicenseHistory— audit trail for license actions
PurchaseRequest— PENDING | APPROVED | REJECTED purchase requests
```

Additional tables (raw SQL, not in Prisma schema):
```
platform_admins       — super-admin accounts (no org affiliation)
schedule_assignments  — bind schedules to targetId (device or site), sortOrder
device_content_logs   — playlist sync history per device (used by content-history module)
software_history      — device app version snapshots
action_history        — admin action audit log
alarm_events          — device offline/online events
org_backups           — per-org JSONB snapshots for backup/restore (PLANNED)
```

Planned schema changes:
```
Media         — ADD COLUMN deletedAt TIMESTAMPTZ (soft delete — PLANNED)
```

---

## Backend Rules

### Module Pattern

Every new module must follow this exact 4-file pattern:

```typescript
// routes.ts
router.post('/', authenticate, authorize('ADMIN'), validate(createSchema), ctrl.create);
 
// controller.ts
export async function create(req: Request, res: Response, next: NextFunction) {
    try {
        const body = createSchema.shape.body.parse(req.body);
        const result = await service.create(req.user!.organizationId, body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

// service.ts — throws AppError for domain errors
export async function create(orgId: string, data: CreateBody) {
    const existing = await queryOne(`SELECT id FROM table WHERE ...`, [...]);
    if (existing) throw new AppError(409, 'Already exists');
    return queryOne(`INSERT INTO table ... RETURNING *`, [...]);
}

// schema.ts
export const createSchema = z.object({
    body: z.object({ name: z.string().min(1).max(100) }),
});
```

### Database

- **Prisma is for migrations only** — never import PrismaClient at runtime
- Use `query<T>()`, `queryOne<T>()`, `withTransaction()` from `shared/database/db.ts`
- Always filter by `organizationId` in every query (multi-tenant isolation)
- Use parameterized queries `$1, $2` — never string interpolation
- Catch unique constraint: `handleUniqueViolation(err, 'Friendly message')`
- DB migrations: add raw `ALTER TABLE IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS` directly

### Auth & Authorization

```typescript
// Role hierarchy (SUPER_ADMIN and PLATFORM_ADMIN bypass all checks):
SUPER_ADMIN > ADMIN > MANAGER > VIEWER

// Middleware stack on protected routes:
authenticate          // Verifies JWT → populates req.user
authorize('ADMIN')    // Checks req.user.role
validate(schema)      // Zod parse

// req.user fields:
{ userId, organizationId, role, isRoot?, type }

// SUPER_ADMIN org-switching:
// Frontend injects X-Organization-Id header → auth.middleware overrides req.user.organizationId
```

### Error Handling

- Throw `new AppError(statusCode, message)` from services for domain errors
- Controllers always wrap in try/catch and call `next(err)`
- HTTP 400 = bad input, 401 = unauth, 403 = forbidden, 404 = not found, 409 = conflict

### Response Format

```typescript
// Success
res.json({ success: true, data: result });

// Paginated
res.json({ success: true, data: rows, total, page, limit, totalPages });

// Error (handled by errorHandler middleware — never manually)
{ error: "message" }
```

### Socket.IO

- Device namespace `/device`: Android TV clients (device JWT auth)
- Admin namespace `/admin`: Web dashboard (user JWT auth)
- Rooms: `device:{deviceId}` for commands, `org:{orgId}` for broadcasts
- Send command: `pushCommandToDevice(deviceId, command, payload?)`
- Broadcast to admins: `emitToAdmins(orgId, event, data?)`
- Notify content changed: `broadcastContentUpdate(orgId, eventType)`
- NTP sync: `broadcastSyncState(storeId, state)` → devices in same store sync playback position

### Device Commands (12 total)

```
command.restart          command.reload_content    command.clear_cache
command.screenshot       command.exit_app          command.reset_pairing
command.sleep            command.wake_up           command.set_volume
command.download_content command.network_on        command.network_off
```

### BullMQ Jobs (6 workers)

| Worker | Trigger |
|---|---|
| `video-transcoding` | Media upload (VIDEO type) |
| `thumbnail` | Video/image upload |
| `device-notification` | State-changing socket events |
| `cleanup-logs` | Scheduled nightly |
| `generate-reports` | Analytics export |
| `license-deduction` | Daily 00:01 UTC |

---

## Frontend Rules

### API Files

```typescript
// api/<feature>.api.ts — export a plain object
export const devicesApi = {
    list: async (params: ListParams) => {
        const { data } = await apiClient.get<PaginatedResponse<Device>>('/devices', { params });
        return data;
    },
    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<Device>>(`/devices/${id}`);
        return data.data;
    },
};
```

- Always use `apiClient` from `@api/client` (handles token refresh)
- Frontend injects `X-Organization-Id` header automatically when SUPER_ADMIN is managing an org
- Types live in `src/types/index.ts`

### Pages & React Query

```typescript
// Query
const { data, isLoading } = useQuery({
    queryKey: ['feature', ...deps],
    queryFn: () => featureApi.list(params),
    staleTime: 30_000,
});

// Mutation
const mutation = useMutation({
    mutationFn: (id: string) => featureApi.delete(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['feature'] });
        dispatch(pushToast({ severity: 'success', message: '...' }));
    },
    onError: (err: any) => dispatch(pushToast({
        severity: 'error',
        message: err?.response?.data?.message ?? 'Thao tác thất bại',
    })),
});
```

### State Management

- Redux only for: user auth (`authSlice`) and UI state (`uiSlice`)
- `authSlice` also holds `managingOrgId`/`managingOrgName` for SUPER_ADMIN org-switching
- Server data lives in React Query cache — do not put it in Redux
- Show toasts: `dispatch(pushToast({ severity, message }))`

### CSS / MUI — Chrome 73 Compatibility (Android TV WebView)

The `/player` route runs in Android WebView (Chrome 73). **Avoid these CSS properties on player pages:**

```
// DON'T
inset: 0
gap: 8px  (in Flexbox — supported Chrome 84+)

// DO
top: 0; right: 0; bottom: 0; left: 0
margin on children instead of gap
```

`build.target: ['es2019', 'chrome73']` only transpiles JS — does NOT fix CSS.
Emotion/MUI `sx` generates CSS at runtime → no auto-polyfill.
This restriction applies **only to player pages** — regular dashboard pages are fine.

---

## Android Player (E:\player)

### Architecture

Hybrid: Android kiosk shell (Kotlin) + WebView (React SPA from backend `/player` route).

- **BootReceiver** — auto-starts on boot (handles Xiaomi QUICKBOOT_POWERON, Hisense, TCL, Roku)
- **PairingActivity** — first-launch wizard: Device Admin → Battery Optimization → Notifications → pairing code → device JWT
- **CommandService** — foreground service, Socket.IO `/device` namespace, dispatches via PlayerBridge
- **MainActivity** — fullscreen WebView, kiosk mode, watchdog (5min no ping → reload), nightly restart (3 AM)
- **PlayerBridge** — callback bridge between CommandService and MainActivity
- **KioskManager** — Device Owner lock-task, keyguard bypass on boot
- **MediaCache + MediaDownloadManager** — local file cache, atomic downloads (`.tmp` → rename)
- **EncryptedPrefs** — AES-256 via Android Keystore, stores device JWT + server URL

### Device Owner Setup

```bash
adb shell dpm set-device-owner com.signagecms.player/.admin.AdminReceiver
```

### Key Behaviors

- Back button guard: 5× back within 3s → PIN dialog (admin exit)
- Home button guard: `onUserLeaveHint()` → PIN; correct PIN → allow exit
- Crash recovery: `App.kt` installs global handler → AlarmManager restart (3s delay)
- MAC address: reads `/sys/class/net/wlan0/address` (not NetworkInterface — returns 02:00:00:00:00:00 on Android 6+)
- CPU usage: `/proc/loadavg` fallback for Android 10+ (getProcessCpuPercent deprecated)

---

## Naming Conventions

| Context | Convention | Example |
|---|---|---|
| API routes | kebab-case | `/api/device-groups` |
| Files | dot-separated | `devices.routes.ts` |
| DB columns | camelCase (Prisma) | `organizationId`, `createdAt` |
| Enum values | UPPER_SNAKE_CASE | `ONLINE`, `ADMIN` |
| React components | PascalCase | `DevicesPage`, `RoleChip` |
| Hooks | camelCase + use prefix | `usePlayerSocket` |

---

## Do / Don't

### Do
- Follow the 4-file module pattern for every new backend feature
- Always filter queries by `organizationId`
- Use `AppError` for expected errors, `next(err)` in controllers
- Validate all input with Zod schemas before it reaches the service
- Use `withTransaction()` for multi-step DB operations
- Use typed Redis key helpers from `redis.ts`
- Invalidate React Query cache after mutations
- Call `checkDeviceQuota` / `checkUserQuota` / `checkStorageQuota` before creating resources

### Don't
- Don't import or use PrismaClient at runtime — migrations only
- Don't use `process.env` directly — use `config` from `config/index.ts`
- Don't put server data in Redux — use React Query
- Don't add `refetchInterval` to every query — only where real-time matters
- Don't add error handling for impossible cases — trust AppError + middleware
- Don't create new patterns when an existing one already works
- Don't add abstractions for single-use logic
- Don't use `inset` or Flexbox `gap` on player/TV pages (Chrome 73)
- Don't use `KEYS` in Redis — use `SMEMBERS` on tracked sets

---

## Multi-Tenancy

Every data access must be scoped to `organizationId`. The tenant context is always `req.user!.organizationId` (set by auth middleware). SUPER_ADMIN can override via `X-Organization-Id` header — the middleware handles this transparently.

---

## License System

Per-device license model (not points-based):
- `DeviceLicense` table: one row per licensed device (packageType: `12M` | `24M` | `36M`)
- `Organization` has pool columns: `pkg12m`, `pkg24m`, `pkg36m` (available license counts)
- `LicenseHistory` tracks: ASSIGN | TRANSFER | ADJUST_EXPIRY | REVOKE | EDIT_POOL
- `PurchaseRequest` table: orgs request licenses → SUPER_ADMIN approves
- Heartbeat returns `isLicensed` + `licenseExpiresAt`; `/sync` returns early if license expired

---

## Content Sync Flow

```
Android heartbeat → POST /api/device/heartbeat
  → returns { contentHash, syncRequired, licenseStatus, deviceAdminPin }
  → if syncRequired: GET /api/device/sync
    → returns { schedules, playlist, items, mediaUrls (signed), syncGroup }
    → device updates content, logs to device_content_logs via logPlaylistSync()
```

NTP Sync Groups (Stores):
- `Store.startEpoch` (Unix ms) + `Store.totalDurationMs` → device calculates current slot
- `broadcastSyncState(storeId)` → all devices in store jump to correct position
- `MediaSlide` accepts `startOffsetMs` prop for IMAGE timer offset / VIDEO seek

---

## Key Files to Read Before Editing

| File | Why |
|---|---|
| `backend/src/config/index.ts` | All config shape and defaults |
| `backend/src/shared/database/db.ts` | DB helpers API |
| `backend/src/shared/middleware/auth.middleware.ts` | JWT payload shape, authorize() |
| `backend/src/shared/socket/socket.server.ts` | All socket events + room naming |
| `backend/src/shared/utils/quota.ts` | Quota enforcement helpers |
| `frontend/src/api/client.ts` | Axios interceptors, token refresh, X-Organization-Id injection |
| `frontend/src/types/index.ts` | All shared types |
| `backend/prisma/schema.prisma` | Canonical DB schema (use for migrations) |
| `docker/postgres/init.sql` | Full DB init with all tables incl. non-Prisma ones |

---

## Backup & Restore System (Planned — Not Yet Implemented)

Tính năng lớn, chia 2 phần phụ thuộc nhau. **Phải implement Part 1 trước Part 2.**

---

### Part 1: Media Soft Delete

**Mục tiêu:** Khi user "xóa" media, file vật lý vẫn còn trên disk — chỉ ẩn khỏi UI. Đây là điều kiện tiên quyết để restore hoạt động đúng (snapshot restore trỏ về file vẫn còn).

#### DB Migration
```sql
ALTER TABLE media ADD COLUMN "deletedAt" TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX ON media ("organizationId", "deletedAt");
```

#### Backend changes
- `media.service.ts` `deleteMedia()` → thay hard delete bằng `UPDATE media SET "deletedAt" = NOW()` (KHÔNG xóa file vật lý)
- Tất cả query `listMedia`, `getMediaById` → thêm `AND "deletedAt" IS NULL`
- `checkStorageQuota` → không tính media có `deletedAt IS NOT NULL`
- Thêm endpoints:
  - `GET  /api/media/trash` — danh sách media đã xóa mềm (ADMIN, MANAGER, CONTENT_MANAGER)
  - `POST /api/media/:id/restore` — khôi phục media (ADMIN, MANAGER, CONTENT_MANAGER)
  - `DELETE /api/media/:id/permanent` — xóa hẳn file vật lý (ADMIN only)

#### BullMQ Worker mới: `media-purge`
- Chạy nightly (cùng với `cleanup-logs`)
- Xóa hẳn media có `deletedAt < NOW() - 30 days`: xóa file + thumbnail trên disk, sau đó DELETE DB row
- Retention mặc định: 30 ngày (configurable qua env `MEDIA_TRASH_RETENTION_DAYS`)

#### Frontend changes
- `MediaPage.tsx`: thêm tab "Thùng rác" (icon: `DeleteOutline`)
- Tab trash: hiển thị media đã xóa + nút Restore + nút Xóa vĩnh viễn (ADMIN only)
- Nút delete hiện tại → đổi thành soft delete (không cần thay đổi API call, chỉ thay đổi toast message)

---

### Part 2: Per-Org Snapshot Backup & Restore

**Mục tiêu:** ADMIN/SUPER_ADMIN có thể tạo snapshot toàn bộ data của org dưới dạng JSONB, và restore về bất kỳ snapshot nào. Vì media soft delete đảm bảo file còn trên disk, restore metadata là đủ.

#### DB Migration (raw SQL — không dùng Prisma)
```sql
CREATE TABLE org_backups (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "organizationId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'MANUAL',  -- 'MANUAL' | 'AUTO'
    snapshot    JSONB NOT NULL,
    "createdBy" TEXT,                            -- userId, NULL nếu AUTO
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON org_backups ("organizationId", "createdAt" DESC);
```

#### Snapshot JSONB structure (version 1)
```json
{
  "version": 1,
  "snapshotAt": "<ISO timestamp>",
  "sites": [...],
  "deviceGroups": [...],
  "devices": [...],
  "media": [...],
  "playlists": [...],
  "playlistItems": [...],
  "schedules": [...],
  "scheduleAssignments": [...]
}
```
- **Không** snapshot: `users`, `playback_logs`, `action_history`, `device_health`, `alarm_events` (telemetry/audit — không restore)
- Media snapshot bao gồm cả rows có `deletedAt IS NOT NULL` (để restore về đúng trạng thái)

#### New module: `backup` (4-file pattern)
```
backend/src/modules/backup/
├── backup.routes.ts
├── backup.controller.ts
├── backup.service.ts
└── backup.schema.ts
```

#### API Routes
```
GET    /api/backup            — list snapshots của org (ADMIN, SUPER_ADMIN)
POST   /api/backup            — tạo manual snapshot (ADMIN, SUPER_ADMIN)
DELETE /api/backup/:id        — xóa snapshot (ADMIN, SUPER_ADMIN)
POST   /api/backup/:id/restore — restore từ snapshot (ADMIN, SUPER_ADMIN)
```

#### Restore logic (`withTransaction`)
Thứ tự DELETE (tôn trọng FK constraints):
1. `schedule_assignments` WHERE `"organizationId"` (via join)
2. `schedules`
3. `playlist_items` (via playlist FK)
4. `playlists`
5. `media` — soft-delete tất cả hiện tại (`deletedAt = NOW()`) thay vì DELETE, để file không mất
6. `device_group_members` → `device_groups`
7. `devices`
8. `stores` (sites)

Sau đó INSERT lại từ snapshot theo thứ tự ngược lại. Cuối cùng: gọi `invalidateContentHashForOrg()` để device re-sync.

#### BullMQ Worker mới: `backup-snapshot`
- AUTO: chạy daily lúc 02:00 UTC cho **tất cả org active**
- Sau khi tạo: gọi worker `backup-cleanup` để giữ tối đa 7 AUTO snapshots gần nhất / org
- MANUAL snapshot: không bị cleanup tự động (chỉ xóa khi user chủ động xóa)

#### Frontend changes
- `SuperAdminPage.tsx`: section "Backup & Restore" trong `DetailRow` của mỗi org
- Org settings page (ADMIN): tab "Backup" mới
  - Danh sách snapshots: date, type (AUTO/MANUAL), actions
  - Nút "Tạo snapshot"
  - Nút "Restore" → confirmation dialog: _"Dữ liệu hiện tại (devices, media, playlists, schedules) sẽ bị thay thế bằng snapshot ngày [X]. Tiếp tục?"_
  - Nút "Xóa snapshot"

---

### Tại sao restore hoạt động được

```
Org muốn restore về ngày hôm qua
  → Snapshot ngày hôm qua có metadata media M1, M2, M3
  → File vật lý M1.mp4, M2.jpg, M3.gif vẫn còn trên disk (soft delete giữ lại)
  → Restore: DELETE current DB rows → INSERT snapshot rows
  → Media rows trỏ về đúng filePath đang tồn tại → content sync hoạt động bình thường ✓

Edge case: Media upload SAU snapshot, bị xóa mềm, cron purge đã chạy → file mất hẳn
  → Nhưng media đó không có trong snapshot (upload sau) → không ảnh hưởng restore ✓
```

---

### Module table update (khi implement xong)
Thêm vào bảng Backend Modules:
```
| `backup` | `/api/backup` | Per-org JSONB snapshots, manual + auto daily, restore với transaction |
```

### BullMQ Workers update (khi implement xong)
Thêm 2 workers:
```
| `backup-snapshot` | Daily 02:00 UTC (auto) hoặc manual trigger qua API |
| `media-purge`     | Nightly — hard delete media có deletedAt > 30 ngày |
```

---

## Dev Environment

- Backend: `http://localhost:3000` (HTTP + WS)
- Frontend: `http://localhost:5173` (Vite dev)
- PostgreSQL: `localhost:5433` (Docker, mapped from 5432 inside container)
- Redis: `localhost:6379` (Docker)
- pgAdmin: `http://localhost:5050`
- Storage: `E:/cms/storage/`

### Docker PostgreSQL

Container name: `signage-postgres`  
DB user/db (dev): `signage_dev` / `signage_cms_dev`  
Connection string: `postgresql://signage_dev:dev_password123@127.0.0.1:5433/signage_cms_dev`

**Run SQL migration against the running container:**
```bash
docker exec signage-postgres sh -c "psql -U signage_dev -d signage_cms_dev -f /dev/stdin" < path/to/migration.sql
```

**Or inline SQL:**
```bash
docker exec signage-postgres sh -c "psql -U signage_dev -d signage_cms_dev -c \"<SQL>\""
```
