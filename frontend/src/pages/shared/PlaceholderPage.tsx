import { type ReactNode } from 'react';
import { Box, Typography, Chip, List, ListItem, ListItemIcon, ListItemText, alpha } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';

interface PlaceholderPageProps {
    icon: ReactNode;
    title: string;
    description?: string;
    features?: string[];
}

export default function PlaceholderPage({ icon, title, description, features }: PlaceholderPageProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                textAlign: 'center',
                gap: 2,
                px: 3,
            }}
        >
            <Box
                sx={{
                    width: 80,
                    height: 80,
                    borderRadius: 4,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'primary.main',
                    '& svg': { fontSize: 40 },
                }}
            >
                {icon}
            </Box>

            <Box>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                    {title}
                </Typography>
                <Chip
                    label="Sắp ra mắt"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600, mb: 1.5 }}
                />
                {description && (
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
                        {description}
                    </Typography>
                )}
            </Box>

            {features && features.length > 0 && (
                <Box sx={{ textAlign: 'left', maxWidth: 400, width: '100%' }}>
                    <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
                        Tính năng sẽ có:
                    </Typography>
                    <List dense disablePadding>
                        {features.map((f) => (
                            <ListItem key={f} disableGutters sx={{ py: 0.25 }}>
                                <ListItemIcon sx={{ minWidth: 24 }}>
                                    <FiberManualRecord sx={{ fontSize: 8, color: 'primary.main' }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={f}
                                    primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Box>
            )}
        </Box>
    );
}
