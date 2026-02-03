// src/components/Layout.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Users,
  CreditCard,
  Bell,
  LogOut,
  Settings as SettingsIcon,
  TrendingUp,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const Layout = ({ children }) => {
  const { profile, signOut } = useAuth();
  const { notifications = [] } = useData() || {};
  const navigate = useNavigate();

  const displayName = profile?.name || 'Usuario';
  const avatarUrl =
    profile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
    toast({
      title: 'Sesión cerrada',
      description: 'Has cerrado sesión exitosamente.',
    });
  };

  const handleNotificationClick = () => {
    toast({
      title: '🚧 Función en desarrollo',
      description: 'Las notificaciones detalladas estarán disponibles pronto. 🚀',
    });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/80 backdrop-blur-lg px-4 md:px-8">
        <Link
          to="/admin"
          className="flex items-center gap-2 h-full hover:opacity-90 transition-opacity"
        >
          <div className="w-8 h-8 bg-gradient-to-r from-secondary to-primary rounded-full flex items-center justify-center shadow-md">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gradient">FINCEN</span>
        </Link>

        <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
          <div className="ml-auto flex-1 sm:flex-initial" />

          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
            onClick={handleNotificationClick}
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={avatarUrl} alt={displayName} />
                  <AvatarFallback>
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => navigate('/admin/settings')}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span>Configuración</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Cerrar Sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

const NavLink = ({ to, children, icon: Icon }) => {
  const location = useLocation();

  const isActive =
    location.pathname === `/admin${to}` ||
    (location.pathname.startsWith(`/admin${to}`) && to !== '/');

  return (
    <Link
      to={`/admin${to}`}
      className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
      {isActive && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-secondary to-primary"
          layoutId="underline"
        />
      )}
    </Link>
  );
};

NavLink.propTypes = {
  to: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  icon: PropTypes.elementType.isRequired,
};

export const AdminNav = () => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/clients', label: 'Clientes', icon: Users },
    { to: '/loans', label: 'Préstamos', icon: CreditCard },
  ];

  return (
    <nav className="mb-8 overflow-x-auto pb-2 border-b">
      <div className="flex items-center gap-4">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} icon={item.icon}>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default Layout;
