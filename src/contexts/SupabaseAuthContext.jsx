import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, avatar_url')
      .eq('id', userId)
      .single();

    // PGRST116 = no rows, lo tratamos como "aún no existe"
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
      toast({
        variant: 'destructive',
        title: 'Error de perfil',
        description: 'No se pudo cargar el perfil de usuario.',
      });
      return null;
    }
    return data ?? null;
  }, [toast]);

  // Plan B: si no existe el perfil (por trigger ausente o delay), lo creamos
  const ensureProfile = useCallback(async (u) => {
    if (!u) return null;
    const existing = await fetchProfile(u.id);
    if (existing) return existing;

    // Crea un perfil mínimo como 'reader'
    const fallback = {
      id: u.id,
      name: u.user_metadata?.full_name || u.user_metadata?.name || '',
      role: 'reader',
      avatar_url: u.user_metadata?.avatar_url || null,
    };
    const { error } = await supabase.from('profiles').upsert(fallback, { onConflict: 'id' });
    if (error) {
      console.warn('ensureProfile upsert error:', error);
      return null;
    }
    return fallback;
  }, [fetchProfile]);

  const handleSession = useCallback(async (sess) => {
    setSession(sess);
    const currentUser = sess?.user ?? null;
    setUser(currentUser);

    if (currentUser) {
      // Intento 1: leer perfil
      let userProfile = await fetchProfile(currentUser.id);
      // Intento 2: si no está, lo aseguramos (crea si falta)
      if (!userProfile) userProfile = await ensureProfile(currentUser);
      setProfile(userProfile);
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, [fetchProfile, ensureProfile]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        await handleSession(sess);
      }
    );
    return () => subscription.unsubscribe();
  }, [handleSession]);

  const signUp = useCallback(async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: 'reader', // <- default
          avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || email)}`,
        }
      }
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error al registrarse',
        description: error.message || 'Algo salió mal',
      });
      return { error };
    }

    // Si ya existía:
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Usuario existente',
        description: 'Ya existe un usuario con este correo electrónico.',
      });
      return { error: { message: 'User already exists' } };
    }

    toast({
      title: 'Registro exitoso',
      description: 'Revisa tu correo para confirmar tu cuenta.',
    });

    // Intentamos asegurar perfil por si el trigger no corrió aún
    if (data.user) await ensureProfile(data.user);

    return { user: data.user, error: null };
  }, [toast, ensureProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error al iniciar sesión',
        description: 'Credenciales inválidas o correo no confirmado',
      });
      return { error };
    }

    // Después de loguear, aseguremos/recarguemos el perfil
    if (data?.user) {
      const p = await fetchProfile(data.user.id) || await ensureProfile(data.user);
      setProfile(p);
    }

    return { error: null };
  }, [toast, fetchProfile, ensureProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    setProfile(null);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cerrar sesión',
        description: error.message || 'Algo salió mal',
      });
    }
    return { error };
  }, [toast]);

  const isAdmin  = profile?.role === 'ADMIN_GENERAL';
  const isReader = !isAdmin; // cualquier cosa que no sea admin la tratamos como reader

  const value = useMemo(() => ({
    user,
    profile,
    session,
    loading,
    isAdmin,
    isReader,
    signUp,
    signIn,
    signOut,
  }), [user, profile, session, loading, isAdmin, isReader, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};