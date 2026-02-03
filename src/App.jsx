// src/App.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { DataProvider } from '@/contexts/DataContext';

import GroupSheet from '@/pages/GroupSheet';
import Login from '@/pages/Login';
import AdminDashboard from '@/pages/AdminDashboard';
import ClientManagement from '@/pages/ClientManagement';
import LoanManagement from '@/pages/LoanManagement';
import Calendar from '@/pages/Calendar';
import Reports from '@/pages/Reports';
import ProtectedRoute from '@/components/ProtectedRoute';
import AddClient from '@/pages/AddClient';
import AddGuarantee from '@/pages/AddGuarantee';
import ClientFile from '@/pages/ClientFile';

import ActiveClients from '@/pages/views/ActiveClients';
import ActiveLoans from '@/pages/views/ActiveLoans';
import OverduePayments from '@/pages/views/OverduePayments';
import Layout from '@/components/Layout';

import DailyCollections from '@/pages/DailyCollections';
import Settings from '@/pages/Settings';

// 👇 Overlay global
import SuccessOverlay from '@/components/ui/SuccessOverlay';

/* =======================
   Loader global
======================= */
const FullScreenLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="text-lg">Cargando plataforma...</p>
    </div>
  </div>
);

/* =======================
   Redirect inicial
======================= */
function HomeRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  // No autenticado -> Login
  if (!session) return <Login />;

  // Autenticado pero perfil aún cargando
  if (!profile) return <FullScreenLoader />;

  const role = profile.role;
  const isStaff = role === 'ADMIN_GENERAL' || role === 'ADMIN_RUTA';

  // Solo staff entra a /admin
  return <Navigate to={isStaff ? '/admin' : '/login'} replace />;
}

/* =======================
   Gate solo staff
======================= */
function StaffGate({ children }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;

  const role = profile?.role;
  const allowed = role === 'ADMIN_GENERAL' || role === 'ADMIN_RUTA';

  if (!allowed) return <Navigate to="/login" replace />;

  return children;
}

// ✅ FIX SonarQube: validar children
StaffGate.propTypes = {
  children: PropTypes.node.isRequired,
};

/* =======================
   Rutas admin
======================= */
const AdminRoutes = () => (
  <Layout>
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/clients" element={<ClientManagement />} />
      <Route path="/clients/add" element={<AddClient />} />
      <Route path="/clients/:clientId" element={<ClientFile />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/loans" element={<LoanManagement />} />
      <Route path="/guarantees/new" element={<AddGuarantee />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/views/active-clients" element={<ActiveClients />} />
      <Route path="/views/active-loans" element={<ActiveLoans />} />
      <Route path="/views/overdue-payments" element={<OverduePayments />} />
      <Route path="/group-sheet" element={<GroupSheet />} />
      <Route path="/daily-collections" element={<DailyCollections />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  </Layout>
);

/* =======================
   App principal
======================= */
function App() {
  return (
    <Router>
      {/* Toaster shadcn */}
      <Toaster />

      {/* Overlay global */}
      <SuccessOverlay />

      <AuthProvider>
        <DataProvider>
          <Helmet>
            <title>FinanComunitaria - Plataforma de Préstamos</title>
          </Helmet>

          <Routes>
            {/* Inicio */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Login */}
            <Route path="/login" element={<Login />} />

            {/* Bloquear registros */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="/sign-up" element={<Navigate to="/login" replace />} />
            <Route path="/crear-cuenta" element={<Navigate to="/login" replace />} />

            {/* Área administrativa */}
            <Route
              path="/admin/*"
              element={
                <StaffGate>
                  <AdminRoutes />
                </StaffGate>
              }
            />

            {/* Settings fuera de admin */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
