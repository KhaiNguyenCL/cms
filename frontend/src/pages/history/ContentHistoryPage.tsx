import { PlayCircleOutline } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function ContentHistoryPage() {
    return (
        <PlaceholderPage
            icon={<PlayCircleOutline />}
            title="Content History"
            description="Lịch sử phát nội dung trên tất cả các thiết bị trong hệ thống."
            features={[
                'Log chi tiết nội dung đã phát',
                'Thống kê thời lượng phát theo media',
                'Lọc theo thiết bị, ngày, nội dung',
                'Xuất báo cáo CSV/Excel',
            ]}
        />
    );
}
