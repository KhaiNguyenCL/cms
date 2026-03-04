import { TouchApp } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function TouchHistoryPage() {
    return (
        <PlaceholderPage
            icon={<TouchApp />}
            title="Touch History"
            description="Lịch sử tương tác cảm ứng của người dùng trên các màn hình interactive."
            features={[
                'Log sự kiện chạm theo thiết bị',
                'Heatmap vị trí chạm trên màn hình',
                'Thống kê nội dung được tương tác nhiều nhất',
                'Phân tích hành vi người dùng',
            ]}
        />
    );
}
