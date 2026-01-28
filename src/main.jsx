import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// 👇 nuevo: proveedor de permisos (usa profiles.role en Supabase)
import { PermissionsProvider } from '@/hooks/useRole';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PermissionsProvider>
      <App />
    </PermissionsProvider>
  </React.StrictMode>
);
