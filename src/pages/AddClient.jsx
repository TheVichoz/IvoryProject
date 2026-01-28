// src/pages/AddClient.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';
import { Loader2, Camera } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { calcFlatCycle, addDaysISO } from '@/lib/loanUtils';

const today = new Date().toISOString().split('T')[0];

// Reglas fijas
const FIXED_WEEKS = 14;
const FIXED_RATE_PERCENT = 40;

// Toggle por si quieres desactivar/activar el primer pago automático
const REGISTER_FIRST_PAYMENT = false;

const normalizeUrl = (u) => {
  if (!u) return '';
  const trimmed = String(u).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

// --- Helpers para normalizar nombres (ignorando acentos y espacios) ---
const normalizeName = (s = '') =>
  String(s)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos

// mostrar fecha ISO sin desfase por huso
const fmtDate = (iso) => {
  if (!iso) return '—';
  const s = String(iso);
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX');
};

/* ===========================
   COMPRESIÓN DE IMAGEN (client-side)
   =========================== */
async function compressImage(
  file,
  { maxWidth = 1024, maxHeight = 1024, quality = 0.72, type = 'image/webp' } = {}
) {
  const bitmap = await (async () => {
    try {
      if (window.createImageBitmap) return await createImageBitmap(file);
    } catch {}
    // Fallback
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    return img;
  })();

  let { width, height } = bitmap;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);

  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise((resolve) => {
    if (canvas.convertToBlob) {
      canvas.convertToBlob({ type, quality }).then(resolve);
    } else {
      canvas.toBlob(resolve, type, quality);
    }
  });

  // Obtener dataURL para preview (si el canvas es offscreen, hacemos uno temporal)
  const dataUrl = await new Promise((resolve) => {
    if (canvas.toDataURL) {
      resolve(canvas.toDataURL(type, quality));
    } else {
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      c2.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      resolve(c2.toDataURL(type, quality));
    }
  });

  return { blob, dataUrl, width: w, height: h };
}

const AddClient = () => {
  const navigate = useNavigate();
  const { refreshData } = useData();
  const { session } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // -------- 1) Cliente --------
  const [clientData, setClientData] = useState({
    nombre: '',
    email: '',
    phone: '',
    direccion: '',
    maps_url: '',
    poblacion: '',
    numero_ine: '',
    ruta: '',
    fecha_visita: today,
    foto_url: '',
    foto_file: null,
    grupo: '',
  });

  // -------- 2) Aval --------
  const [avalData, setAvalData] = useState({
    nombre: '',
    direccion: '',
    telefono: '',
    numero_ine: '',
    email: '',
  });

  // -------- 3) Garantías --------
  const [guarantees, setGuarantees] = useState([
    { marca: '', modelo: '', no_serie: '', descripcion: '' },
    { marca: '', modelo: '', no_serie: '', descripcion: '' },
    { marca: '', modelo: '', no_serie: '', descripcion: '' },
  ]);

  // -------- 4) Préstamo --------
  const [loanData, setLoanData] = useState({
    monto: '',
    fecha: today,
    forma_pago: 'Efectivo',
  });

  const [autoWeekly, setAutoWeekly] = useState(true);
  const [weeklyPayment, setWeeklyPayment] = useState(0);

  useEffect(() => {
    if (!autoWeekly) return;
    const { weekly } = calcFlatCycle({
      amount: loanData.monto,
      ratePercent: FIXED_RATE_PERCENT,
      weeks: FIXED_WEEKS,
      round: 'peso',
    });
    setWeeklyPayment(weekly);
  }, [loanData.monto, loanData.fecha, autoWeekly]);

  // ---------------- Handlers ----------------
  const handleClientChange = (e) => {
    const { name, value } = e.target;
    setClientData((prev) => ({ ...prev, [name]: value.trimStart() }));
  };

  // NUEVO: compresión al seleccionar archivo
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // límite de archivo de entrada para no colgar el navegador
    if (file.size > 12 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, foto_file: 'El archivo es demasiado grande (máx. 12 MB).' }));
      return;
    }

    try {
      // Comprime a WebP
      const { blob, dataUrl } = await compressImage(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.72,
        type: 'image/webp',
      });

      let finalBlob = blob;
      // Si aún pesa > 500 KB, baja la calidad un poco
      if (finalBlob.size > 500 * 1024) {
        const retry = await compressImage(file, {
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 0.6,
          type: 'image/webp',
        });
        finalBlob = retry.blob;
        setClientData((prev) => ({
          ...prev,
          foto_file: new File([finalBlob], `${uuidv4()}.webp`, { type: 'image/webp' }),
          foto_url: retry.dataUrl,
        }));
      } else {
        setClientData((prev) => ({
          ...prev,
          foto_file: new File([finalBlob], `${uuidv4()}.webp`, { type: 'image/webp' }),
          foto_url: dataUrl,
        }));
      }

      setErrors((prev) => ({ ...prev, foto_file: null }));
    } catch (err) {
      console.error('Error comprimiendo imagen:', err);
      setErrors((prev) => ({ ...prev, foto_file: 'No se pudo procesar la imagen.' }));
    }
  };

  const handleAvalChange = (e) =>
    setAvalData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleGuaranteeChange = (index, e) => {
    const { name, value } = e.target;
    setGuarantees((prev) => {
      const arr = [...prev];
      arr[index][name] = value;
      return arr;
    });
  };

  // ⬇️ Normaliza coma como decimal para 'monto'
  const handleLoanChange = (e) => {
    const { name, value } = e.target;
    if (name === 'monto') {
      const normalized = value.replace(',', '.');
      setLoanData((prev) => ({ ...prev, [name]: normalized }));
    } else {
      setLoanData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!clientData.nombre) newErrors.cliente_nombre = 'Requerido';
    if (!/^\d{10}$/.test(clientData.phone)) newErrors.cliente_phone = 'Debe tener 10 dígitos';
    if (!clientData.direccion) newErrors.cliente_direccion = 'Requerido';
    if (!clientData.poblacion) newErrors.cliente_poblacion = 'Requerido';
    if (!clientData.numero_ine || clientData.numero_ine.length < 13)
      newErrors.cliente_numero_ine = 'Mínimo 13 caracteres';
    if (!clientData.ruta) newErrors.cliente_ruta = 'Requerido';
    if (!clientData.grupo) newErrors.cliente_grupo = 'Requerido';

    if (!avalData.nombre) newErrors.aval_nombre = 'Requerido';
    if (!avalData.direccion) newErrors.aval_direccion = 'Requerido';
    if (!/^\d{10}$/.test(avalData.telefono)) newErrors.aval_telefono = 'Debe tener 10 dígitos';
    if (!avalData.numero_ine || avalData.numero_ine.length < 13)
      newErrors.aval_numero_ine = 'Mínimo 13 caracteres';

    guarantees.forEach((g, i) => {
      const isPartiallyFilled = Object.values(g).some((val) => val !== '');
      if (isPartiallyFilled && !g.descripcion) {
        newErrors[`guarantee_${i}_descripcion`] = 'Descripción requerida si la fila está en uso.';
      }
    });

    const amountNum = Number(String(loanData.monto ?? '').replace(/[^\d.-]/g, ''));
    if (!amountNum || amountNum <= 0) newErrors.loan_monto = 'Monto requerido y mayor a 0';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadPhoto = async () => {
    if (!clientData.foto_file) return '';
    // Usamos el nombre con extensión .webp
    const fileName = clientData.foto_file.name || `${uuidv4()}.webp`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('client_photos')
      .upload(filePath, clientData.foto_file, {
        contentType: clientData.foto_file.type || 'image/webp',
        upsert: false,
      });
    if (uploadError) throw new Error(`Error al subir la foto: ${uploadError.message}`);
    const { data } = supabase.storage.from('client_photos').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // 🔎 Validar si el INE del aval ya está usado por un cliente ACTIVO
  const checkAvalIneUsedByActiveClient = async (ine) => {
    const clean = String(ine || '').trim();
    if (!clean) return null;
    const { data, error } = await supabase
      .from('avales')
      .select('id, client_id, numero_ine, clients!inner(id, status)')
      .eq('numero_ine', clean)
      .eq('clients.status', 'active')
      .maybeSingle();
    if (error) {
      console.error('Error validando INE de aval:', error);
      throw error;
    }
    return data;
  };

  // 🔎 Validar si el NOMBRE del aval ya está usado por un cliente ACTIVO
  const checkAvalNameUsedByActiveClient = async (name) => {
    const clean = String(name || '').trim();
    if (!clean) return null;

    // Traemos candidatos por ILIKE y luego comparamos normalizado (ignora acentos)
    const { data, error } = await supabase
      .from('avales')
      .select('id, nombre, client_id, clients!inner(id, status)')
      .ilike('nombre', clean)
      .eq('clients.status', 'active');

    if (error) {
      console.error('Error validando NOMBRE de aval:', error);
      throw error;
    }

    const target = normalizeName(clean);
    const match = (data || []).find((row) => normalizeName(row?.nombre) === target);
    return match || null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast({
        variant: 'destructive',
        title: 'Errores en el formulario',
        description: 'Por favor, corrige los campos marcados.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // ✅ VALIDACIÓN CRÍTICA: bloquear si el INE del aval ya está usado por un CLIENTE ACTIVO
      const existingActiveAval = await checkAvalIneUsedByActiveClient(
        (avalData.numero_ine || '').trim()
      );
      if (existingActiveAval) {
        setIsSubmitting(false);
        toast({
          variant: 'destructive',
          title: 'Aval ya registrado con un cliente ACTIVO',
          description:
            'El número de INE ingresado para el aval ya está asociado a un cliente ACTIVO. Debes usar otro aval o inactivar primero al cliente actual.',
        });
        return; // ⛔️
      }

      // ✅ NUEVA VALIDACIÓN: bloquear si el NOMBRE del aval ya está usado por un CLIENTE ACTIVO
      const existingActiveAvalByName = await checkAvalNameUsedByActiveClient(
        (avalData.nombre || '').trim()
      );
      if (existingActiveAvalByName) {
        setIsSubmitting(false);
        toast({
          variant: 'destructive',
          title: 'Aval ya registrado (por nombre) con un cliente ACTIVO',
          description:
            'El nombre del aval ingresado ya está asociado a un cliente ACTIVO. Debes usar otro aval o inactivar primero al cliente actual.',
        });
        return; // ⛔️
      }

      const photoUrl = await uploadPhoto();

      // Cálculo: 40% plano, 14 semanas
      const amountNum =
        Number(String(loanData.monto ?? '').replace(/[^\d.-]/g, '')) || 0;
      if (!amountNum || amountNum <= 0) {
        throw new Error('El monto del préstamo debe ser mayor a 0');
      }

      const { interest, total, weekly } = calcFlatCycle({
        amount: amountNum,
        ratePercent: FIXED_RATE_PERCENT,
        weeks: FIXED_WEEKS,
        round: 'peso',
      });

      const weekly_fixed = autoWeekly ? weekly : Number(weeklyPayment || 0);

      // 📅 FECHAS CANÓNICAS (semanas exactas)
      const due_date = addDaysISO(loanData.fecha, FIXED_WEEKS * 7); // fin de semana 14
      const next_payment_date = addDaysISO(loanData.fecha, 7);      // primer vencimiento

      const payload = {
        p_client: {
          ...clientData,
          poblacion: clientData.poblacion.trim(),
          foto_url: photoUrl,
          maps_url: normalizeUrl(clientData.maps_url || ''),
        },
        p_aval: {
          ...avalData,
          numero_ine: (avalData.numero_ine || '').trim(),
        },
        p_guarantees: guarantees.filter((g) =>
          Object.values(g).some((val) => val !== '')
        ),
        p_loan: {
          forma_pago: loanData.forma_pago,
          grupo: clientData.grupo,
          fecha: loanData.fecha,

          // canónicos
          monto: amountNum,
          amount: amountNum,
          interest_rate: FIXED_RATE_PERCENT,
          term: `${FIXED_WEEKS} semanas`,
          term_weeks: FIXED_WEEKS,
          interest_amount: Math.round(interest),
          total_amount: total,
          weekly_payment: weekly_fixed,
          start_date: loanData.fecha,
          due_date,
          next_payment_date, // 👈 guardado inicial (semana 1)
          status: 'active',
          estado_prestamo: 'activo',
          metodo_calculo: 'flat',
          frecuencia_pago: 'semanal',
        },
      };

      const { data, error } = await supabase.rpc('create_full_client_package', payload);
      if (error) throw error;

      // ====== ACTUALIZA PRÉSTAMO ======
      const clientName = clientData.nombre || null;

      if (data?.new_loan_id) {
        const { error: updErr } = await supabase
          .from('loans')
          .update({
            term_weeks: FIXED_WEEKS,
            interest_rate: FIXED_RATE_PERCENT,
            interest_amount: Math.round(interest),
            total_amount: total,
            weekly_payment: weekly_fixed,
            start_date: loanData.fecha,
            due_date,
            next_payment_date, // 👈
            status: 'active',
            grupo: clientData.grupo,
            client_name: clientName, // 👈
            remaining_balance: total,
          })
          .eq('id', data.new_loan_id);

        if (updErr) {
          console.error('UPDATE loans error', updErr);
          toast({
            variant: 'destructive',
            title: 'No se pudo actualizar el préstamo',
            description: updErr.message,
          });
        }
      }

      // ====== USER ID PARA created_by (reutilizado para avales/garantías)
      const { data: authData2 } = await supabase.auth.getSession();
      const createdBy = authData2?.session?.user?.id || session?.user?.id || null;

      // clients.grupo
      if (data?.new_client_id && clientData.grupo) {
        await supabase
          .from('clients')
          .update({ grupo: clientData.grupo })
          .eq('id', data.new_client_id);
      }

      // Hotfix AVAL (ahora con created_by)
      if (data?.new_client_id) {
        const avalRow = {
          client_id: data.new_client_id,
          nombre: avalData.nombre || null,
          telefono: avalData.telefono || null,
          direccion: avalData.direccion || null,
          numero_ine: (avalData.numero_ine || '').trim() || null,
          email: avalData.email || null,
          created_by: createdBy, // 👈 importante para RLS
        };

        const { error: avalErr } = await supabase.from('avales').insert([avalRow]);

        if (avalErr) {
          console.error('Error insertando aval:', avalErr);
          toast({
            variant: 'destructive',
            title: 'Guardado parcial',
            description: 'El cliente se creó, pero hubo un problema al guardar el aval.',
          });
        }
      }

      // ✅ PRIMER PAGO (semana 1). El calendario sigue fijo: next_payment_date pasa a +14.
      if (REGISTER_FIRST_PAYMENT && data?.new_loan_id && data?.new_client_id) {
        const firstPayment = {
          loan_id: data.new_loan_id,
          client_id: data.new_client_id,
          client_name: clientData.nombre || null,
          amount: weekly_fixed,
          payment_date: loanData.fecha,
          status: 'paid',
          week: 1,
        };

        const { data: payRow, error: payErr } = await supabase
          .from('payments')
          .insert([firstPayment])
          .select()
          .single();

        if (payErr) {
          console.error('Error insertando primer pago', payErr);
          toast({
            variant: 'destructive',
            title: 'Pago inicial no guardado',
            description: payErr.message,
          });
        } else {
          const newRemaining = Math.max(
            0,
            (Number(total) || Number(payload.p_loan.total_amount) || 0) -
              (Number(payRow.amount) || Number(firstPayment.amount) || 0)
          );
          const nextAfterFirst = addDaysISO(loanData.fecha, 14);

          const { error: rbErr } = await supabase
            .from('loans')
            .update({
              remaining_balance: newRemaining,
              next_payment_date: nextAfterFirst,
            })
            .eq('id', data.new_loan_id);

          if (rbErr) {
            console.error('Error actualizando saldo/fecha tras primer pago', rbErr);
          }
        }
      }

      // Hotfix GARANTÍAS (ya incluía created_by)
      const guaranteesToSave = guarantees
        .filter((g) => Object.values(g).some((v) => v !== ''))
        .map((g) => ({
          marca: g.marca || null,
          modelo: g.modelo || null,
          no_serie: g.no_serie || null,
          descripcion: g.descripcion || null,
          client_id: data?.new_client_id || null,
          loan_id: data?.new_loan_id || null,
          created_by: createdBy,
        }));

      if (guaranteesToSave.length > 0) {
        const { error: gErr } = await supabase.from('guarantees').insert(guaranteesToSave);
        if (gErr) {
          console.error('Error insertando garantías:', gErr);
          toast({
            variant: 'destructive',
            title: 'Guardado parcial',
            description: 'El cliente se creó, pero hubo un problema al guardar las garantías.',
          });
        }
      }

      toast({ title: '¡Éxito!', description: 'Cliente y registros creados correctamente.' });
      await refreshData();
      navigate(`/admin/clients/${data.new_client_id}`);
    } catch (err) {
      console.error('Transaction error:', err);
      toast({
        variant: 'destructive',
        title: 'Error en la transacción',
        description: err.message,
      });
      setIsSubmitting(false);
    }
  };

  // ---------------- UI ----------------
  return (
    <>
      <Helmet>
        <title>Añadir Cliente (Formulario Unificado)</title>
      </Helmet>
      <div className="space-y-6 mb-8">
        <PageHeader
          title="Alta de Cliente Unificada"
          description="Registra un cliente con su aval, garantías y préstamo inicial."
        />
        <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl mx-auto">
          {/* 1. Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>1. Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-2 flex flex-col items-center">
                <Label>Foto del Cliente</Label>
                <div className="relative w-32 h-32 rounded-full border-2 border-dashed flex items-center justify-center bg-muted">
                  {clientData.foto_url ? (
                    <img
                      src={clientData.foto_url}
                      alt="Vista previa"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                  <Input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                {errors.foto_file && (
                  <p className="text-sm text-destructive">{errors.foto_file}</p>
                )}
              </div>

              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cliente_nombre">Nombre *</Label>
                  <Input
                    id="cliente_nombre"
                    name="nombre"
                    value={clientData.nombre}
                    onChange={handleClientChange}
                  />
                  {errors.cliente_nombre && (
                    <p className="text-sm text-destructive">
                      {errors.cliente_nombre}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente_email">Email</Label>
                  <Input
                    id="cliente_email"
                    type="email"
                    name="email"
                    value={clientData.email}
                    onChange={handleClientChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente_phone">Celular *</Label>
                  <Input
                    id="cliente_phone"
                    name="phone"
                    value={clientData.phone}
                    onChange={handleClientChange}
                    maxLength="10"
                  />
                  {errors.cliente_phone && (
                    <p className="text-sm text-destructive">
                      {errors.cliente_phone}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente_numero_ine">Número de INE *</Label>
                  <Input
                    id="cliente_numero_ine"
                    name="numero_ine"
                    value={clientData.numero_ine}
                    onChange={handleClientChange}
                  />
                  {errors.cliente_numero_ine && (
                    <p className="text-sm text-destructive">
                      {errors.cliente_numero_ine}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="cliente_direccion">Dirección *</Label>
                  <Textarea
                    id="cliente_direccion"
                    name="direccion"
                    value={clientData.direccion}
                    onChange={handleClientChange}
                  />
                  {errors.cliente_direccion && (
                    <p className="text-sm text-destructive">
                      {errors.cliente_direccion}
                    </p>
                  )}
                </div>

                {/* Link en Maps (opcional) */}
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="cliente_maps_url">Link en Maps (opcional)</Label>
                  <Input
                    id="cliente_maps_url"
                    name="maps_url"
                    placeholder="https://maps.app.goo.gl/XXXXX o https://www.google.com/maps?q=..."
                    value={clientData.maps_url}
                    onChange={handleClientChange}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pega aquí el enlace directo a la ubicación del cliente (Google Maps).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:col-span-2">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="cliente_poblacion">Población *</Label>
                    <Input
                      id="cliente_poblacion"
                      name="poblacion"
                      value={clientData.poblacion}
                      onChange={handleClientChange}
                      placeholder="Ej. Cadereyta"
                    />
                    {errors.cliente_poblacion && (
                      <p className="text-sm text-destructive">
                        {errors.cliente_poblacion}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="cliente_ruta">Ruta *</Label>
                    <Input
                      id="cliente_ruta"
                      name="ruta"
                      value={clientData.ruta}
                      onChange={handleClientChange}
                    />
                    {errors.cliente_ruta && (
                      <p className="text-sm text-destructive">
                        {errors.cliente_ruta}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="cliente_grupo">Grupo *</Label>
                    <Input
                      id="cliente_grupo"
                      name="grupo"
                      value={clientData.grupo}
                      onChange={handleClientChange}
                    />
                    {errors.cliente_grupo && (
                      <p className="text-sm text-destructive">
                        {errors.cliente_grupo}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cliente_fecha_visita">Fecha de Registro *</Label>
                  <Input
                    id="cliente_fecha_visita"
                    type="date"
                    name="fecha_visita"
                    value={clientData.fecha_visita}
                    onChange={handleClientChange}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Aval */}
          <Card>
            <CardHeader>
              <CardTitle>2. Datos del Aval</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="aval_nombre">Nombre *</Label>
                <Input
                  id="aval_nombre"
                  name="nombre"
                  value={avalData.nombre}
                  onChange={handleAvalChange}
                />
                {errors.aval_nombre && (
                  <p className="text-sm text-destructive">{errors.aval_nombre}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="aval_telefono">Teléfono *</Label>
                <Input
                  id="aval_telefono"
                  name="telefono"
                  value={avalData.telefono}
                  onChange={handleAvalChange}
                  maxLength="10"
                />
                {errors.aval_telefono && (
                  <p className="text-sm text-destructive">{errors.aval_telefono}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="aval_email">Email (Opcional)</Label>
                <Input
                  id="aval_email"
                  name="email"
                  type="email"
                  value={avalData.email}
                  onChange={handleAvalChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aval_numero_ine">Número de INE *</Label>
                <Input
                  id="aval_numero_ine"
                  name="numero_ine"
                  value={avalData.numero_ine}
                  onChange={handleAvalChange}
                />
                {errors.aval_numero_ine && (
                  <p className="text-sm text-destructive">
                    {errors.aval_numero_ine}
                  </p>
                )}
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="aval_direccion">Dirección *</Label>
                <Textarea
                  id="aval_direccion"
                  name="direccion"
                  value={avalData.direccion}
                  onChange={handleAvalChange}
                />
                {errors.aval_direccion && (
                  <p className="text-sm text-destructive">
                    {errors.aval_direccion}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. Garantías */}
          <Card>
            <CardHeader>
              <CardTitle>3. Registro de Garantías</CardTitle>
              <CardDescription>Añade hasta 3 garantías.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {guarantees.map((g, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-4">
                  <p className="font-medium">Garantía {i + 1}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      placeholder="Marca"
                      name="marca"
                      value={g.marca}
                      onChange={(e) => handleGuaranteeChange(i, e)}
                    />
                    <Input
                      placeholder="Modelo"
                      name="modelo"
                      value={g.modelo}
                      onChange={(e) => handleGuaranteeChange(i, e)}
                    />
                    <Input
                      placeholder="No. de serie"
                      name="no_serie"
                      value={g.no_serie}
                      onChange={(e) => handleGuaranteeChange(i, e)}
                    />
                  </div>
                  <Textarea
                    placeholder="Descripción *"
                    name="descripcion"
                    value={g.descripcion}
                    onChange={(e) => handleGuaranteeChange(i, e)}
                  />
                  {errors[`guarantee_${i}_descripcion`] && (
                    <p className="text-sm text-destructive">
                      {errors[`guarantee_${i}_descripcion`]}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 4. Préstamo */}
          <Card>
            <CardHeader>
              <CardTitle>4. Datos del Préstamo</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="loan_monto">Monto del Préstamo (MXN) *</Label>
                <Input
                  id="loan_monto"
                  name="monto"
                  type="number"
                  value={loanData.monto}
                  onChange={handleLoanChange}
                  placeholder="Ej. 10,000"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  onWheel={(e) => e.currentTarget.blur()} // ⛔️ bloquea la ruedita
                />
                {errors.loan_monto && (
                  <p className="text-sm text-destructive">{errors.loan_monto}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  name="fecha"
                  value={loanData.fecha}
                  onChange={handleLoanChange}
                />
              </div>

              <div className="space-y-2">
                <Label>Condiciones de Pago (semanas)</Label>
                <Input value={FIXED_WEEKS} readOnly />
              </div>

              <div className="space-y-2">
                <Label>Tasa de Interés (%)</Label>
                <Input value={FIXED_RATE_PERCENT} readOnly />
              </div>

              <div className="space-y-2">
                <Label>Forma de Pago</Label>
                <Select
                  value={loanData.forma_pago}
                  onValueChange={(v) =>
                    setLoanData((prev) => ({ ...prev, forma_pago: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pago semanal */}
              <div className="sm:col-span-2 md:col-span-3 space-y-2">
                <Label>Pago semanal</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={weeklyPayment}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.');
                      setWeeklyPayment(Number(v) || 0);
                    }}
                    disabled={autoWeekly}
                    inputMode="decimal"
                    step="any"
                    min="0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAutoWeekly((v) => !v)}
                  >
                    {autoWeekly ? 'Automático' : 'Manual'}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Estimado:&nbsp;
                  <b>
                    {calcFlatCycle({
                      amount: loanData.monto,
                      ratePercent: FIXED_RATE_PERCENT,
                      weeks: FIXED_WEEKS,
                      round: 'peso',
                    }).weekly.toLocaleString('es-MX')}
                  </b>
                </p>
              </div>

              {/* Resumen */}
              <div className="sm:col-span-2 md:col-span-3 space-y-2">
                <Label>Resumen del ciclo</Label>
                <div className="p-3 rounded-lg bg-slate-50 border text-sm">
                  {(() => {
                    const { base, interest, total, weekly } = calcFlatCycle({
                      amount: loanData.monto,
                      ratePercent: FIXED_RATE_PERCENT,
                      weeks: FIXED_WEEKS,
                      round: 'peso',
                    });
                    const due = addDaysISO(loanData.fecha, FIXED_WEEKS * 7);
                    return (
                      <div className="grid md:grid-cols-5 gap-3">
                        <div>
                          <b>Base imponible:</b>
                          <br />${Number(base || 0).toLocaleString('es-MX')}
                        </div>
                        <div>
                          <b>Interés (40%):</b>
                          <br />${Math.round(interest || 0).toLocaleString('es-MX')}
                        </div>
                        <div>
                          <b>Total del ciclo:</b>
                          <br />${Number(total || 0).toLocaleString('es-MX')}
                        </div>
                        <div>
                          <b>Pago semanal:</b>
                          <br />${Number(weekly || 0).toLocaleString('es-MX')}
                        </div>
                        <div>
                          <b>Fecha límite:</b>
                          <br />{fmtDate(due)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/admin/clients')}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Guardando...' : 'Guardar Todo'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

export default AddClient;
