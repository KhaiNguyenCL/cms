import { Slideshow } from '@mui/icons-material';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function SlidePage() {
    return (
        <PlaceholderPage
            icon={<Slideshow />}
            title="Slide"
            description="Tạo các slide nội dung phong phú với văn bản, hình ảnh và hiệu ứng."
            features={[
                'Editor slide kéo-thả trực quan',
                'Hỗ trợ văn bản, hình ảnh, video, widget',
                'Hiệu ứng chuyển tiếp đa dạng',
                'Xuất slide sang playlist',
            ]}
        />
    );
}
