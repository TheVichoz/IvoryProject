// src/pages/Settings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { Mail, Shield, UserCog, KeyRound, Users } from "lucide-react";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from "@/lib/customSupabaseClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

const Settings = () => {
  const { session, profile, loading: authLoading } = useAuth();

  const userEmail = session?.user?.email ?? "";
  const userRole = profile?.role ?? "user";
  const userName = profile?.name || profile?.full_name || "";

  const [displayName, setDisplayName] = useState(userName);

  // Contraseña propia (solo admin)
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // Admin: resetear contraseña
  const [capturistas, setCapturistas] = useState([]);
  const [loadingCapturistas, setLoadingCapturistas] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [cPwd1, setCPwd1] = useState("");
  const [cPwd2, setCPwd2] = useState("");
  const [resetting, setResetting] = useState(false);

  const disabled = authLoading;

  useEffect(() => {
    setDisplayName(userName);
  }, [userName]);

  const initials = useMemo(() => {
    const base = (userName || userEmail || "U").trim();
    const parts = base.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [userName, userEmail]);

  // Cargar capturistas (ADMIN_RUTA)
  useEffect(() => {
    async function loadCapturistas() {
      if (userRole !== "ADMIN_GENERAL") return;
      try {
        setLoadingCapturistas(true);
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name, role, email")
          .eq("role", "ADMIN_RUTA")
          .order("name", { ascending: true });

        if (error) throw error;
        setCapturistas(data || []);
      } catch (error) {
        toast({
          title: "No se pudieron cargar capturistas",
          description: error.message || "Inténtalo de nuevo.",
          variant: "destructive",
        });
      } finally {
        setLoadingCapturistas(false);
      }
    }
    loadCapturistas();
  }, [userRole]);

  async function handleSaveName(e) {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({
        title: "Nombre vacío",
        description: "Escribe un nombre para continuar.",
      });
      return;
    }
    if (!session?.user?.id) return;

    try {
      setSavingName(true);
      const { error } = await supabase
        .from("profiles")
        .update({ name: displayName.trim() })
        .eq("id", session.user.id);

      if (error) throw error;
      toast({
        title: "Nombre actualizado",
        description: "Se guardaron tus cambios.",
      });
    } catch (err) {
      toast({
        title: "No se pudo actualizar el nombre",
        description: err?.message || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!pwd1 || !pwd2) {
      toast({
        title: "Faltan campos",
        description: "Completa ambos campos de contraseña.",
      });
      return;
    }
    if (pwd1 !== pwd2) {
      toast({
        title: "Contraseñas no coinciden",
        description: "Verifica y vuelve a intentar.",
        variant: "destructive",
      });
      return;
    }
    if (pwd1.length < 6) {
      toast({
        title: "Contraseña insegura",
        description: "Debe tener al menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingPwd(true);
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      setPwd1("");
      setPwd2("");
      toast({
        title: "Contraseña actualizada",
        description: "Tu contraseña se cambió correctamente.",
      });
      if (typeof window?.showSuccess === "function")
        window.showSuccess("Contraseña actualizada");
    } catch (err) {
      toast({
        title: "No se pudo cambiar la contraseña",
        description:
          err?.message || "Vuelve a iniciar sesión e inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingPwd(false);
    }
  }

  // Admin: restablecer contraseña de un capturista vía Edge Function
  async function handleAdminResetPassword(e) {
    e.preventDefault();
    if (!targetUserId) {
      toast({
        title: "Selecciona capturista",
        description: "Elige a quién deseas restablecer.",
      });
      return;
    }
    if (!cPwd1 || !cPwd2) {
      toast({
        title: "Faltan campos",
        description: "Completa ambos campos de contraseña.",
      });
      return;
    }
    if (cPwd1 !== cPwd2) {
      toast({
        title: "Contraseñas no coinciden",
        description: "Verifica y vuelve a intentar.",
        variant: "destructive",
      });
      return;
    }
    if (cPwd1.length < 6) {
      toast({
        title: "Contraseña insegura",
        description: "Debe tener al menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      setResetting(true);

      // Asegurar envío explícito del access token del ADMIN_GENERAL
      const { data: ses } = await supabase.auth.getSession();
      const token = ses?.session?.access_token;
      if (!token) {
        throw new Error("Sesión inválida. Inicia sesión nuevamente.");
      }

      const { data, error } = await supabase.functions.invoke(
        "admin-reset-password",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: { user_id: targetUserId, new_password: cPwd1 },
        }
      );

      console.log("Respuesta Edge Function:", { data, error });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCPwd1("");
      setCPwd2("");
      setTargetUserId("");

      toast({
        title: "Contraseña restablecida",
        description: "El capturista ya tiene nueva contraseña.",
      });

      if (typeof window?.showSuccess === "function") {
        window.showSuccess("Contraseña de capturista restablecida");
      }
    } catch (err) {
      toast({
        title: "Error al restablecer",
        description: err?.message || "Revisa tu Edge Function y permisos.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Configuración de cuenta – FINCEN</title>
      </Helmet>

      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-1">Configuración</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Gestiona tu información básica, rol y seguridad de tu cuenta.
        </p>

        {/* Resumen de cuenta */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 md:grid-cols-2"
        >
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Mi cuenta
              </CardTitle>
              <CardDescription>
                Información visible de tu usuario.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">Correo</div>
                  <div className="font-medium truncate flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {userEmail || "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Rol activo</div>
                <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                  <Shield className="h-4 w-4" />
                  {userRole}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seguridad (SOLO ADMIN) */}
          {userRole === "ADMIN_GENERAL" && (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Seguridad
                </CardTitle>
                <CardDescription>
                  Cambia tu contraseña de administrador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <Label htmlFor="pwd1">Nueva contraseña</Label>
                    <Input
                      id="pwd1"
                      type="password"
                      value={pwd1}
                      onChange={(e) => setPwd1(e.target.value)}
                      minLength={6}
                      disabled={disabled || savingPwd}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pwd2">Confirmar nueva contraseña</Label>
                    <Input
                      id="pwd2"
                      type="password"
                      value={pwd2}
                      onChange={(e) => setPwd2(e.target.value)}
                      minLength={6}
                      disabled={disabled || savingPwd}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={disabled || savingPwd}
                    className="w-full"
                  >
                    {savingPwd ? "Guardando..." : "Actualizar contraseña"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Admin: restablecer contraseña de capturista */}
        {userRole === "ADMIN_GENERAL" && (
          <div className="mt-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Restablecer contraseña de capturista
                </CardTitle>
                <CardDescription>
                  Selecciona un capturista y define su nueva contraseña. (Edge
                  Function <code>admin-reset-password</code>).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleAdminResetPassword}
                  className="space-y-3"
                >
                  <div>
                    <Label htmlFor="capturista">Capturista</Label>
                    <select
                      id="capturista"
                      className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      disabled={resetting || loadingCapturistas}
                    >
                      <option value="">
                        {loadingCapturistas ? "Cargando…" : "— Seleccionar —"}
                      </option>
                      {capturistas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.email || c.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cpwd1">Nueva contraseña</Label>
                      <Input
                        id="cpwd1"
                        type="password"
                        value={cPwd1}
                        onChange={(e) => setCPwd1(e.target.value)}
                        minLength={6}
                        disabled={resetting}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cpwd2">Confirmar nueva contraseña</Label>
                      <Input
                        id="cpwd2"
                        type="password"
                        value={cPwd2}
                        onChange={(e) => setCPwd2(e.target.value)}
                        minLength={6}
                        disabled={resetting}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={resetting || !capturistas.length}
                    className="w-full"
                  >
                    {resetting ? "Restableciendo..." : "Restablecer contraseña"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Editar nombre mostrado */}
        <div className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Nombre mostrado</CardTitle>
              <CardDescription>
                Este nombre aparece en el sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveName} className="flex gap-2 max-w-md">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={disabled || savingName}
                  placeholder="Tu nombre"
                />
                <Button type="submit" disabled={disabled || savingName}>
                  {savingName ? "Guardando..." : "Guardar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Settings;
