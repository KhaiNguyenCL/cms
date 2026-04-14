import { Slideshow } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function SlidePage() {
    const { t } = useTranslation();
    return (
        <PlaceholderPage
            icon={<Slideshow />}
            title="Slide"
            description={t('slides.description')}
            features={[
                t('slides.feature1'),
                t('slides.feature2'),
                t('slides.feature3'),
                t('slides.feature4'),
            ]}
        />
    );
}
