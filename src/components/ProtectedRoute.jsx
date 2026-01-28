import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';

function ScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
    </div>
  );
}

/**
 * Uso:
 *  <ProtectedRoute>...cualquier usuario autenticado...</ProtectedRoute>
 *  <ProtectedRoute requiredRole="admin">...solo admins...</ProtectedRoute>
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  const { session, profile, loading } = useAuth();

  // Mientras carga la sesión/perfil, muestra loader (no null)
  if (loading) return <ScreenLoader />;

  // Si no hay sesión → login
  if (!session) return <Navigate to="/login" replace />;

  // Si se requiere rol y aún no llega el perfil, espera
  if (requiredRole && !profile) return <ScreenLoader />;

  // Chequea rol contra profile.role (no contra user.role)
  if (requiredRole && profile.role !== requiredRole) {
    // Redirige a la vista correspondiente de su rol real
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/user'} replace />;
  }

  return children;
};

export default ProtectedRoute;