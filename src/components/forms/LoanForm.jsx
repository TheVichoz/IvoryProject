// src/components/forms/LoanForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const DEFAULT_RATE = 40;
const DEFAULT_WEEKS = 14;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// interés plano (igual que en LoanManagement/ClientFile)
const flatTotals = (amount, ratePct, weeks) => {
  const A = num(amount);
  const r = num(ratePct);
  const w = num(weeks) || 1;
  const total = Math.round(A * (1 + r / 100));
  const weekly = Math.ceil(total / w);
  return { total, weekly };
};

const LoanForm = ({ loan, clients, loans = [], onSubmit, onCancel, defaultClientId }) => {
  const [formData, setFormData] = useState({
    client_id: '',
    client_name: '',
    amount: '',
    interest_rate: String(DEFAULT_RATE),
    term_weeks: String(DEFAULT_WEEKS),
    start_date: new Date().toISOString().split('T')[0],
    status: 'active',
  });

  const [errors, setErrors] = useState({});

  // ---- clientes con préstamo ACTIVO
  const activeLoanByClient = useMemo(() => {
    const map = new Map();
    (loans || []).forEach(l => {
      if ((l.status || '').toLowerCase() === 'active') {
        if (!map.has(l.client_id)) map.set(l.client_id, l);
      }
    });
    return map;
  }, [loans]);

  const hasActiveLoanOtherThanCurrent = (clientId) => {
    const l = activeLoanByClient.get(clientId);
    if (!l) return false;
    if (loan && l.id === loan.id) return false;
    return true;
  };

  // Prefill por defaultClientId
  useEffect(() => {
    const client = clients.find(c => c.id.toString() === defaultClientId?.toString());
    setFormData(prev => ({
      ...prev,
      client_id: defaultClientId?.toString() || '',
      client_name: client ? (client.name ?? client.nombre ?? '') : '',
    }));
  }, [defaultClientId, clients]);

  // Prefill cuando editas un préstamo
  useEffect(() => {
    if (loan) {
      const weeks =
        loan.term_weeks ??
        (loan.term ? Number(String(loan.term).match(/\d+/)?.[0]) : null) ??
        DEFAULT_WEEKS;

      setFormData({
        client_id: loan.client_id?.toString() || '',
        client_name: loan.client_name || '',
        amount: String(loan.amount ?? ''),
        interest_rate: String(loan.interest_rate ?? DEFAULT_RATE),
        term_weeks: String(weeks),
        start_date: loan.start_date
          ? new Date(loan.start_date + 'T00:00:00').toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        status: loan.status || 'active',
      });
    }
  }, [loan]);

  const validate = () => {
    const newErrors = {};
    if (!formData.client_id) newErrors.client_id = 'Debe seleccionar un cliente.';
    if (!formData.amount || parseFloat(formData.amount) <= 0) newErrors.amount = 'El monto debe ser mayor a 0.';
    if (!formData.start_date) newErrors.start_date = 'La fecha de inicio es requerida.';
    if (!formData.term_weeks || parseInt(formData.term_weeks) <= 0) newErrors.term_weeks = 'El plazo debe ser mayor a 0.';

    const cid = parseInt(formData.client_id || '0', 10);
    if (cid && hasActiveLoanOtherThanCurrent(cid)) {
      newErrors.client_id = 'Este cliente ya tiene un préstamo activo.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSelectChange = (value) => {
    const selectedClient = clients.find(c => c.id === parseInt(value, 10));
    setFormData(prev => ({
      ...prev,
      client_id: value,
      client_name: selectedClient ? (selectedClient.name ?? selectedClient.nombre ?? '') : '',
    }));
    if (errors.client_id) setErrors(prev => ({ ...prev, client_id: null }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const { weekly_payment, total_amount } = useMemo(() => {
    const { total, weekly } = flatTotals(formData.amount, formData.interest_rate, formData.term_weeks);
    return { weekly_payment: weekly, total_amount: total };
  }, [formData.amount, formData.interest_rate, formData.term_weeks]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      toast({
        variant: 'destructive',
        title: 'Campos inválidos',
        description: 'Por favor, corrige los errores.',
      });
      return;
    }

    const cid = parseInt(formData.client_id, 10);
    if (hasActiveLoanOtherThanCurrent(cid)) {
      toast({
        variant: 'destructive',
        title: 'Cliente con préstamo activo',
        description: 'No puedes crear otro préstamo para este cliente hasta que finalice el actual.',
      });
      return;
    }

    const selected = clients.find(c => c.id === parseInt(formData.client_id, 10));
    const safeClientName = formData.client_name || selected?.name || selected?.nombre || '';

    // próximo pago = start_date + 7 días
    const nextPaymentDate = new Date(formData.start_date);
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);

    // ⚠️ Enviamos solo columnas que existen en la tabla
    const submissionData = {
      client_id: cid,
      client_name: safeClientName,
      amount: num(formData.amount),
      interest_rate: num(formData.interest_rate),
      term_weeks: parseInt(formData.term_weeks, 10),
      weekly_payment,
      total_amount,
      start_date: formData.start_date,
      next_payment_date: nextPaymentDate.toISOString().split('T')[0],
      status: formData.status || 'active',
    };

    onSubmit(submissionData);
  };

  const isBlocked = (() => {
    const cid = parseInt(formData.client_id || '0', 10);
    return Boolean(cid && hasActiveLoanOtherThanCurrent(cid));
  })();

  const isFormValid =
    formData.client_id &&
    num(formData.amount) > 0 &&
    formData.start_date &&
    parseInt(formData.term_weeks || '0', 10) > 0 &&
    !isBlocked;

  return (
    <form onSubmit={handleSubmit} className="text-sm md:text-base">
      <DialogHeader className="space-y-1">
        <DialogTitle className="text-lg md:text-xl">
          {loan ? 'Editar Préstamo' : 'Crear Nuevo Préstamo'}
        </DialogTitle>
        <DialogDescription className="text-xs md:text-sm">
          {loan
            ? 'Modifica la información del préstamo.'
            : 'Completa la información para registrar un nuevo préstamo.'}
        </DialogDescription>
      </DialogHeader>

      {/* GRID RESPONSIVO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-4">
        {/* Cliente */}
        <div className="space-y-2">
          <Label htmlFor="client_id">Cliente *</Label>
          <Select
            name="client_id"
            value={formData.client_id}
            onValueChange={handleSelectChange}
            required
            disabled={!!defaultClientId}
          >
            <SelectTrigger className={`w-full ${(errors.client_id || isBlocked) ? 'border-destructive' : ''}`}>
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent className="w-full">
              {clients.map(client => {
                const blocked = hasActiveLoanOtherThanCurrent(client.id);
                return (
                  <SelectItem
                    key={client.id}
                    value={client.id.toString()}
                    disabled={blocked}
                  >
                    {(client.name ?? client.nombre) + (blocked ? ' — ya tiene préstamo activo' : '')}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {Boolean(errors.client_id || isBlocked) && (
            <p className="text-xs md:text-sm text-destructive">
              {errors.client_id || 'Este cliente ya tiene un préstamo activo.'}
            </p>
          )}
        </div>

        {/* Fecha de inicio */}
        <div className="space-y-2">
          <Label htmlFor="start_date">Fecha de Inicio *</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            value={formData.start_date}
            onChange={handleChange}
            required
            className={`w-full ${errors.start_date ? 'border-destructive' : ''}`}
          />
          {errors.start_date && <p className="text-xs md:text-sm text-destructive">{errors.start_date}</p>}
        </div>

        {/* Monto */}
        <div className="space-y-2">
          <Label htmlFor="amount">Monto del Préstamo (MXN) *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            value={formData.amount}
            onChange={handleChange}
            required
            placeholder="Ej. 10,000"
            className={`w-full ${errors.amount ? 'border-destructive' : ''}`}
            inputMode="decimal"
          />
          {errors.amount && <p className="text-xs md:text-sm text-destructive">{errors.amount}</p>}
        </div>

        {/* Tasa plana (solo lectura para mantener 40%) */}
        <div className="space-y-2">
          <Label htmlFor="interest_rate">Tasa de Interés (%)</Label>
          <Input id="interest_rate" name="interest_rate" type="number" value={formData.interest_rate} readOnly disabled className="w-full" />
        </div>

        {/* Plazo en semanas (solo lectura para mantener 14) */}
        <div className="space-y-2">
          <Label htmlFor="term_weeks">Plazo (semanas)</Label>
          <Input id="term_weeks" name="term_weeks" type="number" value={formData.term_weeks} readOnly disabled className="w-full" />
        </div>

        {/* Card de resumen (full width) */}
        {Number(weekly_payment) > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg text-blue-800 md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <p className="text-sm">
                <strong>Pago semanal:</strong>{' '}
                ${Number(weekly_payment).toLocaleString('es-MX')}
              </p>
              <p className="text-sm">
                <strong>Total a pagar:</strong>{' '}
                ${Number(total_amount).toLocaleString('es-MX')}
              </p>
              <p className="text-sm sm:col-span-2">
                <strong>Próximo pago (estimado):</strong>{' '}
                {(() => {
                  const d = new Date(formData.start_date || new Date());
                  d.setDate(d.getDate() + 7);
                  return d.toISOString().split('T')[0];
                })()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer responsivo */}
      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
          Cancelar
        </Button>
        <Button type="submit" disabled={!isFormValid} className="w-full sm:w-auto">
          {loan ? 'Guardar Cambios' : 'Crear Préstamo'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default LoanForm;
