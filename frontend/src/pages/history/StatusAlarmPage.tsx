import { NotificationsActive } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function StatusAlarmPage() {
    return (
        <PlaceholderPage
            icon={<NotificationsActive />}
            title="Status Alarm"
            description="Theo dõi và quản lý các cảnh báo trạng thái thiết bị trong hệ thống."
            features={[
                'Cảnh báo thiết bị offline/lỗi',
                'Lịch sử cảnh báo và sự kiện',
                'Thông báo qua email / SMS',
                'Phân loại mức độ nghiêm trọng',
            ]}
        />
    );
}
