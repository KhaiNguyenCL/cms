# CLAUDE.md — Digital Signage CMS

## Project Overview

Multi-tenant digital signage CMS for managing Android TV devices.
**Stack:** Node.js + TypeScript + Express · React + Vite + MUI v7 · PostgreSQL + Prisma · Redis + BullMQ · Socket.IO

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
│   └── utils/logger.ts
└── server.ts                    # Bootstrap + graceful shutdown

frontend/src/
├── api/client.ts                # Axios instance, token refresh interceptor
├── api/<feature>.api.ts         # One file per feature
├── pages/<feature>/             # One folder per page
├── store/slices/authSlice.ts    # User auth + org switching state
├── store/slices/uiSlice.ts      # Toast + color mode
├── types/index.ts               # All shared TypeScript interfaces
├── hooks/                       # Custom React hooks
└── App.tsx                      # Routes + providers
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
- DB migrations: add to `STILL NEEDED` section in memory, apply with `ALTER TABLE IF NOT EXISTS`

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

### BullMQ Jobs

- Define queues in `shared/jobs/queues.ts`
- Implement workers in `shared/jobs/workers/`
- Enqueue from service after state-changing operations (upload, schedule update, etc.)

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
- Server data lives in React Query cache — do not put it in Redux
- Show toasts: `dispatch(pushToast({ severity, message }))`

### CSS / MUI — Chrome 73 Compatibility (Android TV WebView)

The `/player` route runs in Android WebView (Chrome 73). **Avoid these CSS properties on player pages:**

```
// DON'T
inset: 0
gap: 8px  (in Flexbox)

// DO
top: 0; right: 0; bottom: 0; left: 0
margin on children instead of gap
```

This restriction applies **only to player pages** — regular dashboard pages are fine.

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

## Key Files to Read Before Editing

| File | Why |
|---|---|
| `backend/src/config/index.ts` | All config shape and defaults |
| `backend/src/shared/database/db.ts` | DB helpers API |
| `backend/src/shared/middleware/auth.middleware.ts` | JWT payload shape, authorize() |
| `backend/src/shared/socket/socket.server.ts` | All socket events + room naming |
| `frontend/src/api/client.ts` | Axios interceptors, token refresh |
| `frontend/src/types/index.ts` | All shared types |
| `backend/prisma/schema.prisma` | Canonical DB schema |
