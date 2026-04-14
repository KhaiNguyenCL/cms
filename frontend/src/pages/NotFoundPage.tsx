import { Box, Typography, Paper, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { SentimentDissatisfied } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
            <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 400 }}>
                <SentimentDissatisfied sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h3" fontWeight={700} gutterBottom>404</Typography>
                <Typography color="text.secondary" mb={3}>{t('common.pageNotFound')}</Typography>
                <Button onClick={() => navigate('/')}>{t('common.backHome')}</Button>
            </Paper>
        </Box>
    );
}
