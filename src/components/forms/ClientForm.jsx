// src/components/clients/ClientForm.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Camera, Trash2 } from 'lucide-react';

/* ============================
   Helpers de fecha
============================ */
const toISODate = (value) => {
  if (!value) return '';
  const d = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

/* ============================
   Helpers de imagen / storage
============================ */
/** Convierte una public URL de Supabase en el path relativo del bucket */
const publicUrlToPath = (publicUrl, bucket = 'client_photos') => {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.substring(idx + marker.length);
};

/** Compresión sencilla a WebP con preview (sin dependencias externas) */
async function compressImage(
  file,
  { maxWidth = 1024, maxHeight = 1024, quality = 0.72, type = 'image/webp' } = {}
) {
  const bitmap = await (async () => {
    try {
      if (window.createImageBitmap) return await createImageBitmap(file);
    } catch {}
    // Fallback con <img>
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    return img;
  })();

  const { width, height } = bitmap;
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

  // DataURL para preview
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

  // Reintento si pesa > 500KB
  if (blob.size > 500 * 1024) {
    return await compressImage(file, { maxWidth, maxHeight, quality: 0.6, type });
  }

  // Crear File webp con nombre único
  const fileName = `${crypto.randomUUID?.() || Date.now()}.webp`;
  const webpFile = new File([blob], fileName, { type });

  return { file: webpFile, dataUrl };
}

/** Sube un File al bucket y devuelve la public URL */
async function uploadToBucket(file, bucket = 'client_photos') {
  const fileName = file?.name ?? `${crypto.randomUUID?.() || Date.now()}.webp`;
  const filePath = fileName; // raíz del bucket
  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/webp'
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/** Elimina del bucket la foto vieja (si existe) */
async function removeFromBucket(publicUrl, bucket = 'client_photos') {
  const path = publicUrlToPath(publicUrl, bucket);
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/* ============================
   Picker de foto (inline)
============================ */
const PhotoPicker = ({ valueUrl, onChange, onClear, disabled }) => {
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Archivo demasiado grande',
        description: 'Máximo 12MB.'
      });
      inputRef.current && (inputRef.current.value = '');
      return;
    }
    try {
      const { file: compressed, dataUrl } = await compressImage(file);
      onChange?.({ file: compressed, previewUrl: dataUrl });
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error con la imagen',
        description: 'No se pudo procesar la foto.'
      });
    } finally {
      inputRef.current && (inputRef.current.value = '');
    }
  };

  return (
    <div className="space-y-2 flex flex-col items-center">
      <Label>Foto del Cliente</Label>
      <div className="relative w-28 h-28 rounded-full border-2 border-dashed flex items-center justify-center bg-muted overflow-hidden">
        {valueUrl ? (
          <img src={valueUrl} alt="Vista previa" className="w-full h-full object-cover rounded-full" />
        ) : (
          <Camera className="h-7 w-7 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleFile}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={disabled}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {valueUrl ? 'Reemplazar foto' : 'Añadir foto'}
        </Button>
        {valueUrl && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
};

/* ============================
   Form principal
============================ */
const ClientForm = ({ client, onSubmit, onCancel }) => {
  // ---------------------------
  // Estado: Cliente
  // ---------------------------
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    poblacion: '',
    numero_ine: '',
    ruta: '',
    grupo: '',
    maps_url: '',
    fecha_visita: '',
    // NUEVO: foto actual (public URL)
    foto_url: '',
  });

  // NUEVO: archivo nuevo (comprimido) y preview al editar
  const [newPhotoFile, setNewPhotoFile] = useState(null);

  // ---------------------------
  // Estado: Aval (edición en la misma ficha)
  // ---------------------------
  const [avalData, setAvalData] = useState({
    id: null,
    nombre: '',
    numero_ine: '',
    phone: '',        // se mapea a columna "telefono"
    address: '',      // se mapea a columna "direccion"
    email: ''         // columna "email"
  });

  const [loadingAval, setLoadingAval] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Cargar valores de cliente
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        poblacion: client.poblacion || '',
        numero_ine: client.numero_ine || '',
        ruta: client.ruta || '',
        grupo: client.grupo || '',
        maps_url: client.maps_url || '',
        fecha_visita: toISODate(client.fecha_visita),
        foto_url: client.foto_url || '', // 👈 foto actual (si existe)
      });
      setNewPhotoFile(null);
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        poblacion: '',
        numero_ine: '',
        ruta: '',
        grupo: '',
        maps_url: '',
        fecha_visita: toISODate(new Date()),
        foto_url: '',
      });
      setNewPhotoFile(null);
    }
  }, [client]);

  // Si es edición, cargar el aval ligado al client.id
  useEffect(() => {
    const fetchAval = async () => {
      if (!client?.id) {
        setAvalData({ id: null, nombre: '', numero_ine: '', phone: '', address: '', email: '' });
        return;
      }
      setLoadingAval(true);
      const { data, error } = await supabase
        .from('avales')
        .select('id, nombre, numero_ine, telefono, direccion, email')
        .eq('client_id', client.id)
        .maybeSingle();

      if (error) {
        console.error('Error cargando aval:', error);
        toast({ variant: 'destructive', title: 'No se pudo cargar el aval', description: 'Intenta nuevamente.' });
      }

      if (data) {
        setAvalData({
          id: data.id,
          nombre: data.nombre ?? '',
          numero_ine: data.numero_ine ?? '',
          phone: data.telefono ?? '',
          address: data.direccion ?? '',
          email: data.email ?? '',
        });
      } else {
        setAvalData({ id: null, nombre: '', numero_ine: '', phone: '', address: '', email: '' });
      }
      setLoadingAval(false);
    };

    if (client?.id) fetchAval();
  }, [client?.id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvalChange = (e) => {
    const { name, value } = e.target;
    setAvalData((prev) => ({ ...prev, [name]: value }));
  };

  const mapsPreviewHref = useMemo(() => {
    const url = (formData.maps_url || '').trim();
    if (!url) return '';
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.toString();
    } catch {
      return '';
    }
  }, [formData.maps_url]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Validaciones mínimas (cliente)
    if (formData.phone && formData.phone.replace(/\D/g, '').length !== 10) {
      toast({ variant: 'destructive', title: 'Teléfono inválido', description: 'El teléfono debe tener 10 dígitos.' });
      return;
    }
    if (formData.numero_ine && String(formData.numero_ine).trim().length < 13) {
      toast({ variant: 'destructive', title: 'INE inválido', description: 'El número de INE debe tener al menos 13 caracteres.' });
      return;
    }

    // Validación de INE del AVAL (no duplicado en otro cliente ACTIVO)
    const ineAval = (avalData.numero_ine || '').trim();
    if (ineAval) {
      setSubmitting(true);
      const { data: avalConConflicto, error: errAvalDup } = await supabase
        .from('avales')
        .select('id, client_id, nombre, clients!inner(status)')
        .eq('numero_ine', ineAval)
        .eq('clients.status', 'active')
        .neq('client_id', client?.id ?? -1)
        .limit(1)
        .maybeSingle();

      if (errAvalDup) {
        setSubmitting(false);
        console.error('Error validando INE de aval:', errAvalDup);
        toast({ variant: 'destructive', title: 'Error al validar aval', description: 'No se pudo validar el INE del aval.' });
        return;
      }

      if (avalConConflicto) {
        setSubmitting(false);
        toast({
          variant: 'destructive',
          title: 'INE de aval en uso',
          description: `Ese INE ya está asignado como aval del cliente #${avalConConflicto.client_id} (ACTIVO).`,
        });
        return;
      }
    }

    try {
      setSubmitting(true);

      // === 1) Manejo de foto (añadir/reemplazar/eliminar) ===
      let newFotoUrl = formData.foto_url || null;

      // Caso A: el usuario quitó la foto en UI (botón "Quitar")
      const userClearedPhoto = !formData.foto_url && client?.foto_url;
      if (userClearedPhoto) {
        // Eliminar del bucket la anterior
        try {
          await removeFromBucket(client.foto_url);
        } catch (err) {
          console.warn('No se pudo eliminar la foto anterior del bucket:', err);
        }
        newFotoUrl = null;
      }

      // Caso B: el usuario seleccionó una nueva foto
      if (newPhotoFile) {
        // Subir nueva
        const uploadedUrl = await uploadToBucket(newPhotoFile, 'client_photos');
        // Borrar anterior si existía y es distinta
        if (client?.foto_url) {
          try {
            await removeFromBucket(client.foto_url, 'client_photos');
          } catch (err) {
            console.warn('No se pudo eliminar la foto anterior del bucket:', err);
          }
        }
        newFotoUrl = uploadedUrl;
      }

      // === 2) Guardar cliente (tu flujo actual) ===
      // IMPORTANTE: pasamos foto_url; tu onSubmit debería persistirlo.
      await onSubmit({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone,
        address: formData.address,
        poblacion: formData.poblacion.trim(),
        numero_ine: formData.numero_ine,
        ruta: formData.ruta,
        grupo: formData.grupo.trim(),
        maps_url: formData.maps_url.trim() || null,
        fecha_visita: toISODate(formData.fecha_visita),
        foto_url: newFotoUrl, // 👈 NUEVO
      });

      /* 
      // Si tu onSubmit NO guarda foto_url, descomenta este "Plan B":
      if (client?.id) {
        await supabase.from('clients').update({ foto_url: newFotoUrl }).eq('id', client.id);
      }
      */

      // === 3) Upsert del aval (con RLS fix) ===
      if (client?.id) {
        const anyAvalInfo =
          avalData.nombre?.trim() ||
          avalData.numero_ine?.trim() ||
          avalData.phone?.trim() ||
          avalData.address?.trim() ||
          avalData.email?.trim();

        if (anyAvalInfo) {
          // 🔐 Necesitamos created_by = auth.uid() para INSERT por políticas RLS
          const { data: authData } = await supabase.auth.getSession();
          const createdBy = authData?.session?.user?.id || null;

          const payloadAval = {
            client_id: client.id,
            nombre: avalData.nombre?.trim() || null,
            numero_ine: avalData.numero_ine?.trim() || null,
            telefono: avalData.phone?.trim() || null,
            direccion: avalData.address?.trim() || null,
            email: avalData.email?.trim() || null,
          };

          if (avalData.id) {
            // UPDATE (no tocamos created_by para evitar choques con RLS)
            const { error: upErr } = await supabase
              .from('avales')
              .update(payloadAval)
              .eq('id', avalData.id);

            if (upErr) {
              console.error('Error actualizando aval:', upErr);
              toast({ variant: 'destructive', title: 'No se pudo actualizar el aval', description: 'Intenta nuevamente.' });
              return;
            }
          } else {
            // INSERT con created_by obligatorio
            const { error: insErr } = await supabase
              .from('avales')
              .insert({ ...payloadAval, created_by: createdBy });

            if (insErr) {
              console.error('Error insertando aval:', insErr);
              toast({ variant: 'destructive', title: 'No se pudo crear el aval', description: 'Intenta nuevamente.' });
              return;
            }
          }
        }
      }

      toast({ title: client ? 'Cambios guardados' : 'Cliente creado', description: 'La ficha se actualizó correctamente.' });
      onCancel?.();
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error al guardar', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="text-sm md:text-base">
      <DialogHeader className="space-y-1">
        <DialogTitle className="text-lg md:text-xl">
          {client ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}
        </DialogTitle>
        <DialogDescription className="text-xs md:text-sm">
          {client
            ? 'Modifica la información del cliente y su aval (si aplica). Los datos del préstamo no se editan aquí.'
            : 'Este formulario es para capturar cliente; si vas a dar de alta con aval/garantías/préstamo usa "Alta Unificada".'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
        {/* -------- Foto del cliente (nuevo bloque) -------- */}
        <div className="md:col-span-2">
          <PhotoPicker
            valueUrl={formData.foto_url}
            onChange={({ file, previewUrl }) => {
              setNewPhotoFile(file); // archivo comprimido (webp)
              setFormData((p) => ({ ...p, foto_url: previewUrl })); // preview inmediata
            }}
            onClear={() => {
              setNewPhotoFile(null);
              setFormData((p) => ({ ...p, foto_url: '' }));
            }}
            disabled={submitting}
          />
        </div>

        {/* -------- Cliente -------- */}
        <div className="md:col-span-2 pt-2">
          <p className="font-medium text-muted-foreground">Datos del Cliente</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre Completo *</Label>
          <Input id="name" name="name" value={formData.name} onChange={handleChange} required className="w-full" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Correo Electrónico</Label>
          <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="w-full" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono *</Label>
          <Input
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            inputMode="numeric"
            pattern="\d{10}"
            title="Debe contener 10 dígitos"
            maxLength={10}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="numero_ine">Número de INE (Trasera) *</Label>
          <Input
            id="numero_ine"
            name="numero_ine"
            value={formData.numero_ine}
            onChange={handleChange}
            required
            minLength={13}
            title="Mínimo 13 caracteres"
            className="w-full"
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="address">Dirección *</Label>
          <Textarea id="address" name="address" value={formData.address} onChange={handleChange} required className="w-full min-h-24" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="poblacion">Población *</Label>
          <Input id="poblacion" name="poblacion" value={formData.poblacion} onChange={handleChange} required maxLength={80} className="w-full" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ruta">Ruta *</Label>
          <Input id="ruta" name="ruta" value={formData.ruta} onChange={handleChange} required className="w-full" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="grupo">Grupo</Label>
          <Input id="grupo" name="grupo" value={formData.grupo} onChange={handleChange} placeholder="Ej. 1A" className="w-full" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="maps_url">Link en Maps (opcional)</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="maps_url"
              name="maps_url"
              value={formData.maps_url}
              onChange={handleChange}
              placeholder="https://maps.app.goo.gl/XXXX o https://www.google.com/maps?q=..."
              className="w-full"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!mapsPreviewHref}
              onClick={() => window.open(mapsPreviewHref, '_blank')}
              className="w-full sm:w-auto"
            >
              Ver en Maps
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fecha_visita">Fecha de Visita *</Label>
          <Input
            id="fecha_visita"
            name="fecha_visita"
            type="date"
            value={toISODate(formData.fecha_visita)}
            onChange={handleChange}
            required
            className="w-full"
          />
        </div>

        {/* -------- Aval en la misma ficha -------- */}
        {client && (
          <>
            <div className="md:col-span-2 pt-4 border-t">
              <p className="font-medium text-muted-foreground">Aval (edición en la misma ficha)</p>
              <p className="text-xs text-muted-foreground">
                Si el préstamo se renueva y el aval cambia, actualízalo aquí. Si dejas todo vacío, no se modifica.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aval_nombre">Nombre del Aval</Label>
              <Input
                id="aval_nombre"
                name="nombre"
                value={avalData.nombre}
                onChange={handleAvalChange}
                disabled={loadingAval}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aval_numero_ine">INE del Aval</Label>
              <Input
                id="aval_numero_ine"
                name="numero_ine"
                value={avalData.numero_ine}
                onChange={handleAvalChange}
                minLength={13}
                title="Mínimo 13 caracteres"
                disabled={loadingAval}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aval_phone">Teléfono del Aval</Label>
              <Input
                id="aval_phone"
                name="phone"
                value={avalData.phone}
                onChange={handleAvalChange}
                inputMode="numeric"
                maxLength={10}
                disabled={loadingAval}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aval_email">Correo del Aval</Label>
              <Input
                id="aval_email"
                name="email"
                type="email"
                value={avalData.email}
                onChange={handleAvalChange}
                disabled={loadingAval}
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="aval_address">Dirección del Aval</Label>
              <Textarea
                id="aval_address"
                name="address"
                value={avalData.address}
                onChange={handleAvalChange}
                className="min-h-20"
                disabled={loadingAval}
              />
            </div>
          </>
        )}
      </div>

      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto" disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
          {client ? 'Guardar Cambios' : 'Agregar Cliente'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default ClientForm;
