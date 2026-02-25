import { Box, Typography, Paper, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { SentimentDissatisfied } from '@mui/icons-material';

export default function NotFoundPage() {
    const navigate = useNavigate();
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
            <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 400 }}>
                <SentimentDissatisfied sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h3" fontWeight={700} gutterBottom>404</Typography>
                <Typography color="text.secondary" mb={3}>Trang không tồn tại</Typography>
                <Button variant="contained" onClick={() => navigate('/')}>Về trang chủ</Button>
            </Paper>
        </Box>
    );
}
