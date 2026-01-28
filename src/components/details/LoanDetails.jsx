// src/components/details/LoanDetails.jsx
import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { addDaysISO } from '@/lib/loanUtils';

// ---------- helpers ----------
const num = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const money = (v) =>
  num(v).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Muestra fechas ISO (YYYY-MM-DD) sin perder un día por huso horario */
const safeDate = (v) => {
  if (!v) return '—';
  const s = String(v);
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX');
};

/** Para <input type="date"> desde ISO/local */
const toDateInput = (v) => {
  if (!v) return '';
  const s = String(v);
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getStatusInfo = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return { text: 'Activo', color: 'bg-green-100 text-green-800' };
    case 'completed':
      return { text: 'Completado', color: 'bg-blue-100 text-blue-800' };
    case 'overdue':
      return { text: 'Vencido', color: 'bg-red-100 text-red-800' };
    default:
      return { text: 'Desconocido', color: 'bg-gray-100 text-gray-800' };
  }
};
// --------------------------------

const LoanDetails = ({ loan }) => {
  const { refreshData } = useData();

  // ✅ Hooks siempre arriba (aunque loan venga null al principio)
  const [liveClientName, setLiveClientName] = useState(null);
  const [newStart, setNewStart] = useState('');
  const [saving, setSaving] = useState(false);

  // Memo del ISO inicial (si no hay loan, queda '')
  const initialStartISO = useMemo(() => {
    if (!loan) return '';
    return toDateInput(loan.start_date ?? loan.startDate ?? loan.date);
  }, [loan]);

  // Mantener el input sincronizado cuando cambie el préstamo
  useEffect(() => {
    setNewStart(initialStartISO);
  }, [initialStartISO]);

  // 🔹 Nombre vivo del cliente (prioriza tabla clients)
  useEffect(() => {
    let cancelled = false;

    const fetchName = async () => {
      if (!loan) {
        setLiveClientName(null);
        return;
      }

      const cid = loan?.client_id ?? loan?.clientId ?? loan?.cliente_id;
      if (!cid) {
        setLiveClientName(null);
        return;
      }

      const { data, error } = await supabase
        .from('clients')
        .select('name')
        .eq('id', cid)
        .single();

      if (cancelled) return;

      if (!error && data?.name) setLiveClientName(data.name);
      else setLiveClientName(null);
    };

    fetchName();

    return () => {
      cancelled = true;
    };
  }, [loan]);

  // ✅ Ahora sí: si no hay loan, ya podemos cortar render sin romper hooks
  if (!loan) return null;

  const statusInfo = getStatusInfo(loan.status);

  // 🔹 Si existe nombre vivo, úsalo; si no, usa el que venga en loan
  const displayClientName = liveClientName ?? loan.client_name ?? '—';

  // Reglas por defecto
  const interestRate = num(loan.interest_rate ?? 40);
  const termWeeks = num(loan.term_weeks ?? loan.term ?? loan.weeks ?? 14);

  // Total del ciclo (lo que debe pagar en total)
  const totalCycle =
    loan.total_amount !== undefined && loan.total_amount !== null
      ? num(loan.total_amount)
      : num(loan.amount ?? loan.principal) * (1 + interestRate / 100);

  // Neto entregado (lo que recibió en mano)
  const inferredNet =
    interestRate >= 0 ? Math.round(totalCycle / (1 + interestRate / 100)) : totalCycle;

  const netDisbursed = num(
    loan.net_disbursed ?? loan.monto_entregado ?? loan.entregado ?? inferredNet
  );

  // Arrastre (saldo anterior descontado al crear el préstamo nuevo)
  const carried = num(loan.carried_balance ?? loan.arrastre ?? 0);

  // Total pagado (fuente flexible)
  const paid = (() => {
    const v1 = num(loan.paid_amount);
    if (v1 > 0) return v1;

    const v2 = num(loan.total_paid);
    if (v2 > 0) return v2;

    const hasRemaining =
      loan.remaining_balance !== undefined && loan.remaining_balance !== null;

    if (hasRemaining) {
      const rem = num(loan.remaining_balance);
      return Math.max(totalCycle - rem, 0);
    }

    return 0;
  })();

  // Pendiente
  const remaining = Math.max(totalCycle - paid, 0);

  // Pago semanal (si no viene, se deriva del total / semanas)
  const weeklyPayment =
    num(loan.weekly_payment) || (termWeeks > 0 ? Math.ceil(totalCycle / termWeeks) : 0);

  // Progreso
  const progress = totalCycle > 0 ? Math.min((paid / totalCycle) * 100, 100) : 0;

  // === Semanas pagadas / restantes — SOLO por MONTO (floor) ===
  const weeksPaid =
    weeklyPayment > 0 ? Math.min(termWeeks, Math.floor(paid / weeklyPayment)) : 0;

  const weeksRemaining = Math.max(0, termWeeks - weeksPaid);

  // Crédito acumulado (sobrante que se aplicará al siguiente pago)
  const rolloverCredit = weeklyPayment > 0 ? paid % weeklyPayment : 0;

  // Fechas (mostrar exactamente lo guardado)
  const startDateText = safeDate(loan.start_date ?? loan.startDate ?? loan.date);
  const nextPaymentDateText = safeDate(
    loan.next_payment_date ?? loan.nextDueDate ?? loan.due_date_next
  );

  const canSave = Boolean(newStart) && newStart !== initialStartISO;

  const handleSaveStartDate = async () => {
    if (!canSave) return;

    try {
      setSaving(true);

      const startISO = newStart; // YYYY-MM-DD
      const nextISO = addDaysISO(startISO, 7);
      const dueISO = addDaysISO(startISO, termWeeks * 7);

      const { error } = await supabase
        .from('loans')
        .update({
          start_date: startISO,
          next_payment_date: nextISO,
          due_date: dueISO,
        })
        .eq('id', loan.id);

      if (error) throw error;

      toast({
        title: 'Fecha de inicio actualizada',
        description: `Inicio: ${safeDate(startISO)} · Próx. pago: ${safeDate(
          nextISO
        )} · Vence: ${safeDate(dueISO)}`,
      });

      await refreshData?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Actualizar fecha de inicio', err);
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar',
        description: err?.message || 'Inténtalo nuevamente.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">ID del Préstamo</Label>
          <p className="text-gray-900">#{loan.id}</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Estado</Label>
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
          >
            {statusInfo.text}
          </span>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Cliente</Label>
        <p className="text-gray-900">{displayClientName}</p>
      </div>

      {/* Monto entregado vs Total del ciclo */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Monto entregado</Label>
          <p className="text-gray-900 font-semibold">${money(netDisbursed)}</p>
          {carried > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Incluye arrastre descontado: ${money(carried)}
            </p>
          )}
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Total con intereses</Label>
          <p className="text-gray-900 font-semibold">${money(totalCycle)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Saldo Pendiente</Label>
          <p className="text-orange-600 font-semibold">${money(remaining)}</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Total Pagado</Label>
          <p className="text-green-600 font-semibold">${money(paid)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Tasa de Interés</Label>
          <p className="text-gray-900">{interestRate}% anual</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Plazo</Label>
          <p className="text-gray-900">{termWeeks} semanas</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Pago Semanal</Label>
          <p className="text-gray-900 font-semibold">${money(weeklyPayment)}</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Semanas pagadas</Label>
          <p className="text-gray-900">
            {weeksPaid} de {termWeeks}
          </p>
        </div>
      </div>

      {/* Crédito acumulado y semanas restantes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">
            Crédito aplicado a próxima semana
          </Label>
          <p className="text-gray-900 font-semibold">${money(rolloverCredit)}</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Semanas restantes</Label>
          <p className="text-gray-900 font-semibold">{weeksRemaining}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Próximo Pago</Label>
          <p className="text-gray-900">{nextPaymentDateText}</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Fecha de Inicio (actual)</Label>
          <p className="text-gray-900">{startDateText}</p>
        </div>
      </div>

      {/* ===== Editor: cambiar fecha de inicio ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end p-3 border rounded-lg">
        <div className="md:col-span-2 space-y-2">
          <Label className="text-sm font-medium text-gray-600">
            Cambiar fecha de inicio del préstamo
          </Label>
          <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Al guardar se recalcularán el <b>próximo pago (+7 días)</b> y la{' '}
            <b>fecha de vencimiento (+{termWeeks} semanas)</b>. No se modifican saldos ni
            pagos.
          </p>
        </div>
        <div className="flex gap-2 md:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewStart(initialStartISO)}
            disabled={!canSave || saving}
          >
            Deshacer
          </Button>
          <Button type="button" onClick={handleSaveStartDate} disabled={!canSave || saving}>
            {saving ? 'Guardando…' : 'Guardar cambio'}
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Progreso del Préstamo</Label>
        <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
          <div
            className="bg-gradient-to-r from-green-400 to-blue-500 h-3 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-1">{Math.round(progress)}% completado</p>
      </div>
    </div>
  );
};

LoanDetails.propTypes = {
  loan: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,

    // cliente
    client_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    clientId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    cliente_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    client_name: PropTypes.string,

    // fechas
    start_date: PropTypes.string,
    startDate: PropTypes.string,
    date: PropTypes.string,
    next_payment_date: PropTypes.string,
    nextDueDate: PropTypes.string,
    due_date_next: PropTypes.string,
    due_date: PropTypes.string,

    // montos
    interest_rate: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    term_weeks: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    term: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    weeks: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    total_amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    principal: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    weekly_payment: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    net_disbursed: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    monto_entregado: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    entregado: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    carried_balance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    arrastre: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paid_amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    total_paid: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    remaining_balance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
};

LoanDetails.defaultProps = {
  loan: null,
};

export default LoanDetails;
