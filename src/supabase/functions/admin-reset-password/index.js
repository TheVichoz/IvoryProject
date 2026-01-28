// supabase/functions/admin-reset-password/index.js
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    // 1) Leer secrets con nombres estándar
    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Faltan variables de entorno PROJECT_URL o SERVICE_ROLE_KEY",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 2) Cliente admin (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3) Validar quién llama: debe ser ADMIN_GENERAL
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Falta Authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: userInfo, error: getUserErr } = await admin.auth.getUser(jwt);
    if (getUserErr || !userInfo?.user?.id) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const callerId = userInfo.user.id;
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();

    if (profErr || prof?.role !== "ADMIN_GENERAL") {
      return new Response(
        JSON.stringify({ error: "Solo ADMIN_GENERAL puede ejecutar esto" }),
        { status: 403, headers: corsHeaders }
      );
    }

    // 4) Body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { user_id, new_password } = body;
    if (!user_id || !new_password || String(new_password).length < 6) {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 5) Reset de contraseña
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (updErr) {
      // Log opcional
      console.error("updateUserById error:", updErr);
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("Edge error:", e);
    return new Response(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
