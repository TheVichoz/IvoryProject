// src/components/forms/PaymentForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

/* ==================== Utils ==================== */
// Parsear fechas ISO (YYYY-MM-DD) como LOCAL (T00:00:00) para evitar -1 día
const parseLocalISO = (v) => {
  if (!v) return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toYmdLocal = (v) => {
  const d = parseLocalISO(v) || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtDateMX = (v) => {
  const d = parseLocalISO(v);
  return d ? d.toLocaleDateString('es-MX') : '—';
};

function toNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function computeInitialRemaining(loan) {
  const rb = loan?.remaining_balance;
  if (rb !== null && rb !== undefined) return toNumber(rb);
  if (loan?.total_amount !== null && loan?.total_amount !== undefined)
    return toNumber(loan.total_amount);
  return toNumber(loan?.amount) + toNumber(loan?.interest_amount);
}

// Obtener term_weeks real del préstamo (fallback a 14)
const getTermWeeks = (loan) => {
  if (!loan) return 14;
  const t =
    loan.term_weeks ??
    (loan.term ? Number(String(loan.term).match(/\d+/)?.[0]) : null) ??
    14;
  return Math.max(1, Number(t) || 14);
};

// primera semana libre en 1..maxWeeks a partir de semanas PAGADAS
const firstFreeWeekFrom = (paidWeeksSet, maxWeeks) => {
  const lim = Math.max(1, Number(maxWeeks) || 14);
  for (let w = 1; w <= lim; w++) {
    if (!paidWeeksSet.has(w)) return w;
  }
  return null;
};

/* ======= Helpers para reducir complejidad (Sonar) ======= */
const toastRequiredLoan = () =>
  toast({
    variant: 'destructive',
    title: 'Campos requeridos',
    description: 'Selecciona un préstamo.',
  });

const toastLiquidated = () =>
  toast({
    variant: 'destructive',
    title: 'Préstamo liquidado',
    description: 'Este préstamo ya está liquidado y no admite más pagos.',
  });

const toastRequiredFields = () =>
  toast({
    variant: 'destructive',
    title: 'Campos requeridos',
    description: 'Por favor, completa todos los campos obligatorios.',
  });

const toastInvalidAmount = () =>
  toast({
    variant: 'destructive',
    title: 'Monto inválido',
    description: 'El monto debe ser mayor a 0.',
  });

const toastNoWeeks = () =>
  toast({
    variant: 'destructive',
    title: 'No hay semanas disponibles',
    description: 'Este préstamo ya tiene todas las semanas registradas.',
  });

const toastWeekOccupied = (week) =>
  toast({
    variant: 'destructive',
    title: 'Semana ocupada',
    description: `La semana ${week} ya tiene un registro para este préstamo.`,
  });

const isPromiseLike = (x) => x && typeof x.then === 'function';

const computeWeekToSave = ({ payment, firstFreeWeek }) => {
  // en edición conserva week original, en alta usa la primera libre
  return payment?.week ?? firstFreeWeek;
};

const shouldBlockNewPaymentByWeek = ({ payment, weekToSave, occupiedWeeks }) => {
  // solo aplica para nuevos pagos
  if (payment?.week) return { block: false };
  if (weekToSave == null) return { block: true, reason: 'no_weeks' };
  if (occupiedWeeks.has(weekToSave)) return { block: true, reason: 'occupied' };
  return { block: false };
};
/* ======================================================= */

const PaymentForm = ({ payment, loans, payments, onSubmit, onCancel, successMessage }) => {
  const safeLoans = useMemo(() => (Array.isArray(loans) ? loans : []), [loans]);
  const safePayments = useMemo(() => (Array.isArray(payments) ? payments : []), [payments]);

  const [formData, setFormData] = useState({
    loan_id: '',
    client_name: '',
    amount: '',
    payment_date: toYmdLocal(new Date()),
    status: 'paid',
  });

  const loanId = useMemo(() => parseInt(formData.loan_id || '0', 10), [formData.loan_id]);

  const selectedLoan = useMemo(
    () => safeLoans.find((l) => l.id === loanId) || null,
    [safeLoans, loanId]
  );

  // term_weeks dinámico del préstamo seleccionado
  const termWeeks = useMemo(() => getTermWeeks(selectedLoan), [selectedLoan]);

  // pagos del préstamo seleccionado
  const loanPays = useMemo(
    () => safePayments.filter((p) => p.loan_id === loanId),
    [safePayments, loanId]
  );

  // semanas ocupadas (cualquier estado), respetando termWeeks
  const occupiedWeeks = useMemo(() => {
    const set = new Set();
    for (const p of loanPays) {
      const w = Number(p.week || 0);
      if (w >= 1 && w <= termWeeks) set.add(w);
    }
    return set;
  }, [loanPays, termWeeks]);

  // semanas pagadas (status = paid/Pagado), respetando termWeeks
  const paidWeeks = useMemo(() => {
    const set = new Set();
    for (const p of loanPays) {
      const st = (p.status || '').toLowerCase();
      if (st === 'paid' || st === 'pagado') {
        const w = Number(p.week || 0);
        if (w >= 1 && w <= termWeeks) set.add(w);
      }
    }
    return set;
  }, [loanPays, termWeeks]);

  const allWeeksPaid = useMemo(() => paidWeeks.size >= termWeeks, [paidWeeks, termWeeks]);

  const firstFreeWeek = useMemo(
    () => firstFreeWeekFrom(paidWeeks, termWeeks),
    [paidWeeks, termWeeks]
  );

  // préstamo liquidado: saldo <= 0 o todas las semanas pagadas o estado != active
  const isLiquidated = useMemo(() => {
    if (!selectedLoan) return false;
    const rb = computeInitialRemaining(selectedLoan);
    const zeroOrLess = rb <= 0;
    const inactive = (selectedLoan.status || '').toLowerCase() !== 'active';
    return zeroOrLess || allWeeksPaid || inactive;
  }, [selectedLoan, allWeeksPaid]);

  // Cargar datos en modo edición o reset en modo alta
  useEffect(() => {
    if (payment) {
      setFormData({
        loan_id: payment.loan_id?.toString() || '',
        client_name: payment.client_name || '',
        amount: String(payment.amount ?? ''),
        payment_date: payment.payment_date ? toYmdLocal(payment.payment_date) : toYmdLocal(new Date()),
        status: payment.status || 'paid',
      });
      return;
    }

    setFormData({
      loan_id: '',
      client_name: '',
      amount: '',
      payment_date: toYmdLocal(new Date()),
      status: 'paid',
    });
  }, [payment]);

  const handleSelectChange = (name, value) => {
    let updated = { ...formData, [name]: value };

    if (name !== 'loan_id') {
      if (name === 'status') updated.status = value;
      setFormData(updated);
      return;
    }

    const loan = safeLoans.find((l) => l.id === parseInt(value, 10));
    if (!loan) {
      setFormData({
        ...updated,
        client_name: '',
        amount: '',
        payment_date: toYmdLocal(new Date()),
      });
      return;
    }

    const rb = computeInitialRemaining(loan);
    const inactive = (loan.status || '').toLowerCase() !== 'active';
    const done = rb <= 0 || inactive || paidWeeks.size >= getTermWeeks(loan);

    setFormData({
      ...updated,
      client_name: loan.client_name || '',
      amount: done ? '' : (loan.weekly_payment ?? ''),
      payment_date: loan.next_payment_date ? toYmdLocal(loan.next_payment_date) : toYmdLocal(new Date()),
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Permitir coma como separador decimal y evitar NaN por formato local
    if (name === 'amount') {
      const normalized = String(value).replace(',', '.'); // 19,98 -> 19.98
      setFormData((prev) => ({ ...prev, [name]: normalized }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateBeforeSubmit = () => {
    if (!formData.loan_id) {
      toastRequiredLoan();
      return { ok: false };
    }

    if (isLiquidated) {
      toastLiquidated();
      return { ok: false };
    }

    if (formData.amount === '' || formData.amount === null) {
      toastRequiredFields();
      return { ok: false };
    }

    const payAmount = toNumber(formData.amount);
    if (payAmount <= 0) {
      toastInvalidAmount();
      return { ok: false };
    }

    return { ok: true, payAmount };
  };

  const buildPayload = ({ payAmount, weekToSave }) => ({
    loan_id: parseInt(formData.loan_id, 10),
    client_name: formData.client_name || null, // quítala si tu tabla no la tiene
    amount: payAmount,
    payment_date: formData.payment_date, // YYYY-MM-DD (local)
    status: formData.status,
    week: weekToSave,
  });

  const tryShowSuccessOverlay = (meta) => {
    if (typeof window === 'undefined') return;
    if (typeof window.showSuccess !== 'function') return;

    const msg =
      successMessage ||
      (meta.isEdit ? 'Pago actualizado' : 'Pago registrado');

    window.showSuccess(msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validation = validateBeforeSubmit();
    if (!validation.ok) return;

    const weekToSave = computeWeekToSave({ payment, firstFreeWeek });

    const weekCheck = shouldBlockNewPaymentByWeek({
      payment,
      weekToSave,
      occupiedWeeks,
    });

    if (weekCheck.block) {
      if (weekCheck.reason === 'no_weeks') toastNoWeeks();
      if (weekCheck.reason === 'occupied') toastWeekOccupied(weekToSave);
      return;
    }

    const payload = buildPayload({ payAmount: validation.payAmount, weekToSave });
    const meta = { isEdit: !!payment?.id, id: payment?.id ?? null };

    try {
      const result = onSubmit(payload, meta);
      if (!isPromiseLike(result)) return;

      const ok = await result;
      if (ok !== false) tryShowSuccessOverlay(meta);
    } catch (err) {
      // el padre debería manejar el toast; aquí solo evitamos overlay
    }
  };

  return (
    <form onSubmit={handleSubmit} className="text-sm md:text-base">
      {/* Header (NO depende de Dialog) */}
      <div className="space-y-1">
        <h2 className="text-lg md:text-xl font-semibold">
          {payment ? 'Editar Pago' : 'Registrar Nuevo Pago'}
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground">
          {payment
            ? 'Modifica la información del pago.'
            : 'Completa la información del nuevo pago.'}
        </p>
      </div>

      {/* Aviso de liquidación */}
      {selectedLoan && isLiquidated && (
        <div className="p-3 bg-green-50 rounded-lg text-sm text-green-800 my-3">
          <strong>Préstamo liquidado.</strong> Ya no se pueden registrar más pagos para este préstamo.
        </div>
      )}

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-4">
        {/* Préstamo */}
        <div className="space-y-2">
          <Label htmlFor="loan_id">Préstamo *</Label>
          <Select
            name="loan_id"
            value={formData.loan_id}
            onValueChange={(value) => handleSelectChange('loan_id', value)}
            required
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar préstamo" />
            </SelectTrigger>
            <SelectContent className="w-full">
              {safeLoans
                .filter((l) => l.status === 'active' || l.id === loanId)
                .map((loan) => (
                  <SelectItem key={loan.id} value={loan.id.toString()}>
                    #{loan.id} - {loan.client_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado del pago */}
        <div className="space-y-2">
          <Label htmlFor="status">Estado del Pago *</Label>
          <Select
            name="status"
            value={formData.status}
            onValueChange={(value) => handleSelectChange('status', value)}
            required
            disabled={isLiquidated}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent className="w-full">
              <SelectItem value="paid">Pagado</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="overdue">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tarjeta info préstamo */}
        {selectedLoan && (
          <div className="p-3 bg-blue-50 rounded-lg text-blue-800 md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <p>
                <strong>Pago semanal:</strong>{' '}
                ${toNumber(selectedLoan.weekly_payment).toLocaleString('es-MX')}
              </p>
              <p>
                <strong>Saldo pendiente:</strong>{' '}
                ${computeInitialRemaining(selectedLoan).toLocaleString('es-MX')}
              </p>
              <p>
                <strong>Próximo pago (sugerido):</strong>{' '}
                {fmtDateMX(selectedLoan?.next_payment_date)}
              </p>
            </div>
          </div>
        )}

        {/* Monto */}
        <div className="space-y-2">
          <Label htmlFor="amount">Monto del Pago *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            value={formData.amount}
            onChange={handleChange}
            required
            disabled={isLiquidated}
            className="w-full"
            inputMode="decimal"
            min="0"
            step="any"
          />
        </div>

        {/* Fecha */}
        <div className="space-y-2">
          <Label htmlFor="payment_date">Fecha de Pago *</Label>
          <Input
            id="payment_date"
            name="payment_date"
            type="date"
            value={formData.payment_date}
            onChange={handleChange}
            required
            disabled={isLiquidated}
            className="w-full"
          />
        </div>

        <div className="md:col-span-2 text-xs text-muted-foreground">
          {payment
            ? 'Este pago conservará la información registrada originalmente.'
            : 'Revisa el monto y la fecha antes de guardar.'}
        </div>
      </div>

      {/* Footer (NO depende de Dialog) */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="w-full sm:w-auto"
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isLiquidated} className="w-full sm:w-auto">
          {payment ? 'Guardar Cambios' : 'Registrar Pago'}
        </Button>
      </div>
    </form>
  );
};

export default PaymentForm;
