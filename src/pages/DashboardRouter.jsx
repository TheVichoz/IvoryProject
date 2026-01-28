// src/pages/DashboardRouter.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import UserDashboard from '@/pages/UserDashboard';

export default function DashboardRouter() {
  const { profile, loading } = useAuth();

  if (loading) return null;

  const role = profile?.role || null;
  const isAdmin = role === 'ADMIN_GENERAL';
  const isCapturista = role === 'ADMIN_RUTA';
  const isStaff = isAdmin || isCapturista;

  // STAFF -> al panel interno (tu home de admin)
  if (isStaff) {
    // cambia la ruta si tu home admin es otra
    return <Navigate to="/admin" replace />;
  }

  // Cliente (o sin rol) -> UserDashboard
  return <UserDashboard />;
}
