import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import MidwifeDashboard from './dashboards/MidwifeDashboard';
import DoctorDashboard from './dashboards/DoctorDashboard';
import ChwDashboard from './dashboards/ChwDashboard';
import FacilityAdminDashboard from './dashboards/FacilityAdminDashboard';
import DhoDashboard from './dashboards/DhoDashboard';
import MohDashboard from './dashboards/MohDashboard';

const DASHBOARDS = {
  midwife: MidwifeDashboard,
  doctor: DoctorDashboard,
  chw: ChwDashboard,
  facility_admin: FacilityAdminDashboard,
  district_officer: DhoDashboard,
  moh: MohDashboard,
};

export default function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const View = DASHBOARDS[user.role] || MidwifeDashboard;
  return <View />;
}
