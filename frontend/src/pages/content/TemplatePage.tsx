import { DashboardCustomize } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import PlaceholderPage from '@pages/shared/PlaceholderPage';

export default function TemplatePage() {
    const { t } = useTranslation();
    return (
        <PlaceholderPage
            icon={<DashboardCustomize />}
            title="Template"
            description={t('templates.description')}
            features={[
                t('templates.feature1'),
                t('templates.feature2'),
                t('templates.feature3'),
                t('templates.feature4'),
            ]}
        />
    );
}
