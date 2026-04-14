// Platform login has been removed — all admin accounts use the regular /login flow.
import { Navigate } from 'react-router-dom';

export default function PlatformLoginPage() {
    return <Navigate to="/login" replace />;
}
