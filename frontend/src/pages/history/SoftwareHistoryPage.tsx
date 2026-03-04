import { SystemUpdate } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function SoftwareHistoryPage() {
    return (
        <PlaceholderPage
            icon={<SystemUpdate />}
            title="Software History"
            description="Lịch sử cập nhật phần mềm và firmware trên các thiết bị."
            features={[
                'Log phiên bản ứng dụng trên từng thiết bị',
                'Lịch sử cập nhật OTA',
                'Rollback về phiên bản trước',
                'Báo cáo thiết bị chưa cập nhật',
            ]}
        />
    );
}
