import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import AppLayout, { ProtectedRoute, ClinicalRoute } from './components/Layout';
import Login from './pages/Login';
import RoleHome from './pages/RoleHome';
import MotherSearch from './pages/MotherSearch';
import RegisterPregnancy from './pages/RegisterPregnancy';
import PregnancyRecord from './pages/PregnancyRecord';
import AncVisit from './pages/AncVisit';
import LabResults from './pages/LabResults';
import UltrasoundResults from './pages/UltrasoundResults';
import LaborAdmit from './pages/LaborAdmit';
import Partograph from './pages/Partograph';
import ActivateEmergency from './pages/ActivateEmergency';
import EmergencyChecklist from './pages/EmergencyChecklist';
import Delivery from './pages/Delivery';
import Postpartum from './pages/Postpartum';
import Community from './pages/Community';
import Analytics from './pages/Analytics';
import AmbulanceCenter from './pages/AmbulanceCenter';

function Clinical({ children }) {
  return <ClinicalRoute>{children}</ClinicalRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<RoleHome />} />
              <Route path="mothers" element={<Clinical><MotherSearch /></Clinical>} />
              <Route path="pregnancies/new" element={<Clinical><RegisterPregnancy /></Clinical>} />
              <Route path="pregnancies/:id" element={<Clinical><PregnancyRecord /></Clinical>} />
              <Route path="pregnancies/:id/anc" element={<Clinical><AncVisit /></Clinical>} />
              <Route path="pregnancies/:id/labs" element={<Clinical><LabResults /></Clinical>} />
              <Route path="pregnancies/:id/ultrasound" element={<Clinical><UltrasoundResults /></Clinical>} />
              <Route path="pregnancies/:id/labor" element={<Clinical><LaborAdmit /></Clinical>} />
              <Route path="pregnancies/:id/partograph" element={<Clinical><Partograph /></Clinical>} />
              <Route path="pregnancies/:id/emergency" element={<Clinical><ActivateEmergency /></Clinical>} />
              <Route path="pregnancies/:id/delivery" element={<Clinical><Delivery /></Clinical>} />
              <Route path="pregnancies/:id/postpartum" element={<Clinical><Postpartum /></Clinical>} />
              <Route path="emergencies/:id" element={<Clinical><EmergencyChecklist /></Clinical>} />
              <Route path="community" element={<Clinical><Community /></Clinical>} />
              <Route path="ambulance" element={<AmbulanceCenter />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
