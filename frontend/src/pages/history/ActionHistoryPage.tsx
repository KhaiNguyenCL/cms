import { Assignment } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function ActionHistoryPage() {
    return (
        <PlaceholderPage
            icon={<Assignment />}
            title="Action History"
            description="Nhật ký hành động của người dùng quản trị trong hệ thống."
            features={[
                'Audit log đầy đủ mọi thao tác',
                'Lọc theo người dùng, thời gian, loại hành động',
                'Phát hiện hoạt động bất thường',
                'Xuất báo cáo kiểm toán',
            ]}
        />
    );
}
