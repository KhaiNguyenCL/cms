import { Today } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function DailySchedulePage() {
    return (
        <PlaceholderPage
            icon={<Today />}
            title="Daily Schedule"
            description="Lên lịch phát nội dung theo giờ trong ngày với giao diện timeline trực quan."
            features={[
                'Timeline kéo-thả theo khung giờ',
                'Lặp lại theo ngày trong tuần',
                'Override lịch cho ngày đặc biệt',
                'Xem trước lịch phát trên tất cả thiết bị',
            ]}
        />
    );
}
