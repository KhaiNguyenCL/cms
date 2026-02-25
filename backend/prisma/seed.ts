/**
 * seed.ts — Tạo dữ liệu mẫu ban đầu cho CMS
 *
 * Chạy: npm run db:seed
 *
 * Tạo:
 *  - 1 Organization "System" (dành cho SUPER_ADMIN)
 *  - 1 SUPER_ADMIN user: superadmin@system.com / Super@123456
 *  - 1 Organization "Demo Organization"
 *  - 1 ADMIN user: admin@demo.com / Admin@123456
 *  - 1 MANAGER user: manager@demo.com / Manager@123456
 *  - 2 device placeholders (OFFLINE)
 *  - 1 device group
 *  - 1 playlist mặc định (rỗng)
 *
 * Idempotent: dùng ON CONFLICT DO NOTHING — chạy nhiều lần an toàn.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function q(sql: string, params: any[] = []) {
    const res = await pool.query(sql, params);
    return res.rows;
}

async function main() {
    console.log('🌱  Starting seed...\n');

    // ─── 1. System org (dành riêng cho SUPER_ADMIN) ─────────────────────────────
    //  ON CONFLICT (slug) để không fail khi org 'system' đã tồn tại (vd: tạo qua Register)
    const SYSTEM_ORG_ID = 'org-system-001';
    await q(
        `INSERT INTO organizations (id, name, slug, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, NOW(), NOW())
         ON CONFLICT (slug) DO NOTHING`,
        [SYSTEM_ORG_ID, 'System', 'system']
    );
    // Lấy id thực của org 'system' (có thể khác SYSTEM_ORG_ID nếu đã tồn tại)
    const systemOrgs = await q(`SELECT id FROM organizations WHERE slug = 'system' LIMIT 1`);
    const actualSystemOrgId: string = systemOrgs[0]?.id ?? SYSTEM_ORG_ID;
    console.log(`✅  Organization: System (id: ${actualSystemOrgId})`);

    // ─── 2. SUPER_ADMIN user ─────────────────────────────────────────────────────
    //  ON CONFLICT (email) DO UPDATE → nếu user đã tồn tại (tạo qua Register với role ADMIN),
    //  sẽ cập nhật role thành SUPER_ADMIN thay vì bỏ qua.
    const SUPER_EMAIL = 'superadmin@system.com';
    const SUPER_PASSWORD = 'Super@123456';
    const SUPER_ID = 'user-superadmin-001';
    const superHash = await bcrypt.hash(SUPER_PASSWORD, 10);

    await q(
        `INSERT INTO users (id, "organizationId", email, "passwordHash", role, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET role = 'SUPER_ADMIN', "updatedAt" = NOW()`,
        [SUPER_ID, actualSystemOrgId, SUPER_EMAIL, superHash]
    );
    console.log(`✅  Super Admin: ${SUPER_EMAIL} / ${SUPER_PASSWORD}`);

    // ─── 3. Demo Organization ────────────────────────────────────────────────────
    const ORG_ID = 'org-demo-001';
    await q(
        `INSERT INTO organizations (id, name, slug, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [ORG_ID, 'Demo Organization', 'demo']
    );
    console.log('✅  Organization: Demo Organization (id: org-demo-001)');

    // ─── 4. Admin user ───────────────────────────────────────────────────────────
    const ADMIN_EMAIL = 'admin@demo.com';
    const ADMIN_PASSWORD = 'Admin@123456';
    const ADMIN_ID = 'user-admin-001';

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await q(
        `INSERT INTO users (id, "organizationId", email, "passwordHash", role, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [ADMIN_ID, ORG_ID, ADMIN_EMAIL, passwordHash]
    );
    console.log(`✅  Admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

    // ─── 5. Manager user ─────────────────────────────────────────────────────────
    const MANAGER_EMAIL = 'manager@demo.com';
    const MANAGER_PASSWORD = 'Manager@123456';
    const MANAGER_ID = 'user-manager-001';
    const managerHash = await bcrypt.hash(MANAGER_PASSWORD, 10);

    await q(
        `INSERT INTO users (id, "organizationId", email, "passwordHash", role, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'MANAGER', 'ACTIVE', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [MANAGER_ID, ORG_ID, MANAGER_EMAIL, managerHash]
    );
    console.log(`✅  Manager user: ${MANAGER_EMAIL} / ${MANAGER_PASSWORD}`);

    // ─── 4. Device group ─────────────────────────────────────────────────────────
    const GROUP_ID = 'group-lobby-001';
    await q(
        `INSERT INTO device_groups (id, "organizationId", name, description, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [GROUP_ID, ORG_ID, 'Lobby Screens', 'Màn hình khu vực sảnh chính']
    );
    console.log('✅  Device group: Lobby Screens');

    // ─── 5. Sample devices ───────────────────────────────────────────────────────
    const devices = [
        { id: 'device-tv-001', name: 'TV Sảnh Chính', location: 'Tầng 1 - Sảnh' },
        { id: 'device-tv-002', name: 'TV Phòng Họp A', location: 'Tầng 2 - Phòng họp A' },
    ];
    for (const dev of devices) {
        await q(
            `INSERT INTO devices (id, "organizationId", name, location, timezone, status, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'Asia/Ho_Chi_Minh', 'OFFLINE', NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [dev.id, ORG_ID, dev.name, dev.location]
        );
        // Thêm vào group
        await q(
            `INSERT INTO device_group_members ("deviceId", "groupId")
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [dev.id, GROUP_ID]
        );
    }
    console.log('✅  Devices: TV Sảnh Chính, TV Phòng Họp A (status: OFFLINE)');

    // ─── 6. Default playlist ─────────────────────────────────────────────────────
    const PLAYLIST_ID = 'playlist-default-001';
    await q(
        `INSERT INTO playlists (id, "organizationId", name, description, "isDefault", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [PLAYLIST_ID, ORG_ID, 'Default Playlist', 'Playlist mặc định — thêm media để bắt đầu']
    );
    console.log('✅  Playlist: Default Playlist (isDefault: true)');

    // ─── Summary ─────────────────────────────────────────────────────────────────
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉  Seed hoàn thành!

📋  Thông tin đăng nhập:

  Super Admin (toàn hệ thống):
    Email   : superadmin@system.com
    Password: Super@123456
    Role    : SUPER_ADMIN

  Admin (Demo Org):
    Email   : admin@demo.com
    Password: Admin@123456
    Role    : ADMIN

  Manager (Demo Org):
    Email   : manager@demo.com
    Password: Manager@123456
    Role    : MANAGER

  Frontend: http://localhost:5173
  Backend : http://localhost:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main()
    .catch((err) => {
        console.error('❌  Seed thất bại:', err.message);
        process.exit(1);
    })
    .finally(() => pool.end());
