// src/hooks/useRole.jsx
import React, { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/customSupabaseClient";

const PermCtx = createContext({ canWrite: false, role: null, loading: true });

export function PermissionsProvider({ children }) {
  const [state, setState] = useState({ canWrite: false, role: null, loading: true });

  async function resolveRole() {
    try {
      // 1) user directo (más confiable)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ canWrite: false, role: null, loading: false });
        return;
      }

      // 2) profiles.role
      let roleRaw = null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)          // columna id (uuid) como en tu screenshot
        .single();

      if (!error) roleRaw = profile?.role;

      // 3) fallback a user_metadata.role
      if (!roleRaw) roleRaw = user.user_metadata?.role ?? null;

      // 4) normaliza (acepta MAYÚSCULAS/MINÚSCULAS)
      const roleStr = String(roleRaw ?? "").trim();
      const roleLc  = roleStr.toLowerCase();

      const canWrite = roleLc === "admin_general"; // true para ADMIN_GENERAL/ admin_general

      setState({ canWrite, role: roleStr, loading: false });
    } catch {
      setState({ canWrite: false, role: null, loading: false });
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await resolveRole(); })();

    // refresca cuando cambie la sesión (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      resolveRole();
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return <PermCtx.Provider value={state}>{children}</PermCtx.Provider>;
}

export function useRole() {
  return useContext(PermCtx);
}
