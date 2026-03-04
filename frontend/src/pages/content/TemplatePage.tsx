import { DashboardCustomize } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function TemplatePage() {
    return (
        <PlaceholderPage
            icon={<DashboardCustomize />}
            title="Template"
            description="Tạo và quản lý các template bố cục màn hình cho nội dung."
            features={[
                'Thiết kế layout với nhiều vùng hiển thị',
                'Template cho ticker, video wall, split screen',
                'Thư viện template có sẵn',
                'Preview trực tiếp trên thiết bị',
            ]}
        />
    );
}
