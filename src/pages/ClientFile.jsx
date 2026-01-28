// src/pages/ClientFile.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, User, Shield, Loader2, FileText, Landmark, MapPin, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ClientForm from '@/components/forms/ClientForm';
import LoanForm from '@/components/forms/LoanForm';
import ClientDetails from '@/components/details/ClientDetails';
import { supabase } from '@/lib/customSupabaseClient';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/* ==========================
   Config
========================== */
const DEFAULT_WEEKS = 14;
const DEFAULT_RATE = 40;

/* ==========================
   Helpers
========================== */
const OK_PAYMENT_STATUS = new Set(['paid', 'pagado', 'completed', 'success', 'confirmed']);

const num = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toMoney = (v) => num(v).toLocaleString('es-MX');

const fmtMoney = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : new Date(d);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-MX');
  } catch {
    return '—';
  }
};

const addDaysISO = (isoDate, days) => {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const addDays = (isoDate, days) => {
  if (!isoDate) return null;
  const base = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + Number(days || 0));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(
    base.getDate()
  ).padStart(2, '0')}`;
};

const calcFlat = ({ amount, ratePercent, weeks }) => {
  const base = Number(amount || 0);
  const rate = Number(ratePercent || 0);
  const w = Number(weeks || 1);
  const interest = Math.round(base * (rate / 100));
  const total = base + interest;
  const weekly = Math.ceil(total / w);
  return { base, interest, total, weekly };
};

const weeksPaidForLoan = (loan, payments) => {
  if (!loan) return 0;
  const loanId = String(loan.id);

  const weeks = num(loan.term_weeks ?? loan.term ?? loan.weeks ?? DEFAULT_WEEKS) || DEFAULT_WEEKS;
  const ratePct = num(loan.interest_rate ?? DEFAULT_RATE);
  const total_amount = num(loan.total_amount) || num(loan.amount) * (1 + ratePct / 100);
  const weekly_payment = num(loan.weekly_payment) || (weeks > 0 ? Math.ceil(total_amount / weeks) : 0);
  if (weekly_payment <= 0) return 0;

  let totalPaid = 0;
  (payments || []).forEach((p) => {
    const pid = p.loan_id ?? p.prestamo_id ?? p.loanId;
    const sameLoan = String(pid) === loanId;
    const st = String(p.status || '').toLowerCase();
    if (sameLoan && (!p.status || OK_PAYMENT_STATUS.has(st))) {
      totalPaid += num(p.amount ?? p.monto ?? p.payment_amount ?? p.importe);
    }
  });

  const byAmount = Math.floor(totalPaid / weekly_payment);
  return Math.min(weeks, byAmount);
};

const canRenewLoan = (loan, payments) => {
  if (String(loan?.status || '').toLowerCase() !== 'active') return false;
  return weeksPaidForLoan(loan, payments) >= 10;
};

function getClientDerivedStatus(client, loans) {
  if (!client) return 'inactive';
  const hasActive = loans?.some((l) => {
    const same = String(l.client_id) === String(client.id);
    const isActive = (l.status || '').toLowerCase() === 'active';
    const rb = Number(l.remaining_balance);
    const hasBalance = Number.isFinite(rb) ? rb > 0 : true;
    return same && isActive && hasBalance;
  });
  return hasActive ? 'active' : 'inactive';
}

/* ==========================
   Backfill de grupos históricos
========================== */
async function backfillHistoricLoanGroups({ clientId, oldGrupo, loans, updateLoan }) {
  if (!oldGrupo) return;
  const tasks = (loans || [])
    .filter((l) => String(l.client_id) === String(clientId))
    .filter((l) => String(l.status || l.estado_prestamo || '').toLowerCase() !== 'active')
    .filter((l) => !l.grupo || String(l.grupo).trim() === '')
    .map((l) => updateLoan(l.id, { grupo: oldGrupo }));
  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

/* ==========================
   Card de cada préstamo
========================== */
const LoanItem = ({ loan, clientGrupo, isAdmin, onEdit }) => {
  const amount = Number(loan.amount || 0);
  const startISO = loan.start_date || loan.fecha;
  const startTxt = fmtDate(startISO);

  const weeks =
    loan.term_weeks ??
    (loan.term ? Number(String(loan.term).match(/\d+/)?.[0]) : undefined) ??
    DEFAULT_WEEKS;
  const plazoTxt = loan.term ? loan.term : `${weeks} semanas`;

  // Estado y grupo a mostrar (los completed NUNCA heredan del cliente)
  const st = String(loan.status || loan.estado_prestamo || '').toLowerCase();
  const isActive = st === 'active';
  const loanGrupoStr = loan.grupo != null ? String(loan.grupo).trim() : '';
  const grupo = loanGrupoStr ? loanGrupoStr : (isActive ? (clientGrupo || 'Sin especificar') : 'Sin especificar');

  let rate = loan.interest_rate;
  if ((rate === undefined || rate === null) && loan.interest_amount != null && amount) {
    const pct = (Number(loan.interest_amount) / amount) * 100;
    if (Number.isFinite(pct)) rate = Math.round(pct);
  }
  if (rate === undefined || rate === null) rate = DEFAULT_RATE;
  const interesTxt = `${rate}%`;

  const weekly = loan.weekly_payment ?? calcFlat({ amount, ratePercent: rate, weeks }).weekly;

  const dueISO = loan.due_date ?? (startISO ? addDays(startISO, weeks * 7 - 1) : null);
  const dueTxt = fmtDate(dueISO);

  return (
    <div className="p-4 border rounded-lg flex justify-between items-center bg-slate-50">
      <div>
        <p className="font-semibold text-slate-800">
          {(loan.tipo || 'Préstamo')} - ${fmtMoney(amount)}
        </p>
        <p className="text-sm text-slate-500">
          Registrado: <span className="font-medium">{startTxt}</span> | Plazo:{' '}
          <span className="font-medium">{plazoTxt}</span> | Límite:{' '}
          <span className="font-medium">{dueTxt}</span>
        </p>
        <p className="text-sm text-slate-500">
          Grupo: <span className="font-medium">{grupo}</span> | Interés:{' '}
          <span className="font-medium">{interesTxt}</span> | Semanal:{' '}
          <span className="font-medium">${fmtMoney(weekly)}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={!isActive}
            title={isActive ? 'Editar préstamo' : 'Solo préstamos activos se pueden editar'}
          >
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
        )}
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className={`${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}
        >
          {loan.status || loan.estado_prestamo || '—'}
        </Badge>
      </div>
    </div>
  );
};

/* ==========================
   Previsualización en el modal de edición
========================== */
const PreviewEditedTotals = ({ amount, rate, weeks, alreadyPaid }) => {
  if (!amount || amount <= 0) return null;
  const interest = Math.round(amount * (rate / 100));
  const total = amount + interest;
  const weekly = weeks > 0 ? Math.ceil(total / weeks) : 0;
  const remaining = Math.max(total - (alreadyPaid || 0), 0);
  const willComplete = remaining <= 0;

  return (
    <div className="rounded-md border p-3 bg-slate-50 text-sm">
      <div className="flex flex-wrap gap-4">
        <div><span className="text-muted-foreground">Interés:</span> <b>${toMoney(interest)}</b></div>
        <div><span className="text-muted-foreground">Total con interés:</span> <b>${toMoney(total)}</b></div>
        <div><span className="text-muted-foreground">Semanal:</span> <b>${toMoney(weekly)}</b></div>
        <div><span className="text-muted-foreground">Pagado:</span> <b>${toMoney(alreadyPaid || 0)}</b></div>
        <div><span className="text-muted-foreground">Saldo:</span> <b className={willComplete ? 'text-emerald-600' : ''}>${toMoney(remaining)}</b></div>
      </div>
      {willComplete && <div className="mt-2 text-emerald-700 font-medium">Con este cambio, el préstamo quedará liquidado (completed).</div>}
    </div>
  );
};

/* ==========================
   Página
========================== */
const ClientFile = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const {
    clients, loans, guarantees, payments,
    loading, updateClient, addLoan, updateLoan, addPayment, refreshData
  } = useData();

  const { isAdmin } = useAuth();

  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [aval, setAval] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Renovación
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewLoan, setRenewLoan] = useState(null);
  const [requestedAmount, setRequestedAmount] = useState('');

  // Edición de préstamo
  const [isEditLoanOpen, setIsEditLoanOpen] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editGrupo, setEditGrupo] = useState('');

  const client = useMemo(
    () => clients.find((c) => c.id.toString() === clientId),
    [clients, clientId]
  );
  const clientLoans = useMemo(
    () => loans.filter((l) => l.client_id?.toString() === clientId),
    [loans, clientId]
  );
  const clientGuarantees = useMemo(
    () => guarantees.filter((g) => g.client_id?.toString() === clientId),
    [guarantees, clientId]
  );

  const derivedStatus = useMemo(
    () => getClientDerivedStatus(client, clientLoans),
    [client, clientLoans]
  );
  const clientWithDerived = useMemo(
    () => (client ? { ...client, status: derivedStatus } : null),
    [client, derivedStatus]
  );

  // regla: un solo préstamo ACTIVO
  const isActiveLoan = (l) => {
    const a = String(l?.status || '').toLowerCase();
    const b = String(l?.estado_prestamo || '').toLowerCase();
    return a === 'active' || b === 'activo';
  };
  const activeLoans = useMemo(() => clientLoans.filter(isActiveLoan), [clientLoans]);
  const activeLoansCount = activeLoans.length;
  const hasActiveLoan = activeLoansCount > 0;
  const activeLoan = hasActiveLoan ? activeLoans[0] : null;

  const renewable = useMemo(() => {
    return activeLoan ? canRenewLoan(activeLoan, payments) : false;
  }, [activeLoan, payments]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!clientId) return;
      setIsDataLoading(true);
      try {
        await refreshData();
      } finally {
        if (mounted) setIsDataLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId, refreshData]);

  useEffect(() => {
    const fetchAval = async () => {
      if (!client) return;
      setIsDataLoading(true);
      const { data } = await supabase
        .from('avales')
        .select('*')
        .eq('client_id', client.id)
        .maybeSingle();
      setAval(data || null);
      setIsDataLoading(false);
    };
    fetchAval();
  }, [client]);

  if (loading || isDataLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientWithDerived) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Cliente no encontrado</h2>
        <p className="text-muted-foreground">El cliente que buscas no existe o fue eliminado.</p>
        <Button onClick={() => navigate('/admin/clients')} className="mt-4">
          Volver a Clientes
        </Button>
      </div>
    );
  }

  const handleUpdateClient = async (data) => {
    try {
      await updateClient(clientWithDerived.id, data);
      toast({ title: 'Cliente actualizado' });
      setIsEditingClient(false);
      refreshData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const openAddLoan = () => {
    if (hasActiveLoan) {
      toast({
        variant: 'destructive',
        title: 'No permitido',
        description: 'Este cliente ya tiene un préstamo activo. Debes liquidarlo o cerrarlo antes de crear otro.',
      });
      return;
    }
    setIsAddingLoan(true);
  };

  const handleAddLoan = async (data) => {
    try {
      if (hasActiveLoan) {
        toast({
          variant: 'destructive',
          title: 'No permitido',
          description: 'Este cliente ya tiene un préstamo activo.',
        });
        return;
      }
      setIsDataLoading(true);

      // snapshot del grupo al crear
      const payload = {
        ...data,
        client_id: data?.client_id ?? clientWithDerived.id,
        grupo: (data?.grupo ?? clientWithDerived.grupo) || null,
      };
      await addLoan(payload);

      await refreshData();
      setIsAddingLoan(false);

      toast({ title: 'Préstamo añadido con éxito' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDataLoading(false);
    }
  };

  /* ==========================
     Renovación
  ========================== */
  const openRenewDialog = () => {
    if (!activeLoan) return;
    if (!renewable) {
      toast({
        variant: 'destructive',
        title: 'Aún no puedes renovar',
        description: 'La renovación está disponible a partir de la semana 10.',
      });
      return;
    }
    const total = num(activeLoan.total_amount ?? activeLoan.amount);
    const paid = num(activeLoan.total_paid ?? activeLoan.paid_amount);
    const remaining = Math.max(total - paid, 0);
    setRenewLoan({ ...activeLoan, _remaining: remaining });
    setRequestedAmount('');
    setIsRenewOpen(true);
  };

  const confirmRenew = async () => {
    try {
      if (!renewLoan) return;
      const requested = num(requestedAmount);
      const remaining = num(renewLoan._remaining ?? renewLoan.remaining_balance);
      const deliver   = Math.max(0, requested - remaining);

      if (requested <= 0) {
        toast({ variant: 'destructive', title: 'Monto inválido', description: 'Ingresa un monto solicitado mayor a 0.' });
        return;
      }
      if (deliver <= 0) {
        toast({ variant: 'destructive', title: 'No hay monto a entregar', description: 'El saldo pendiente es mayor o igual al solicitado.' });
        return;
      }

      // 1) Liquidar préstamo anterior: asegúrate de dejarle su grupo histórico si no lo tenía
      if (remaining > 0) {
        await addPayment({
          loan_id: renewLoan.id,
          client_id: renewLoan.client_id,
          client_name: renewLoan.client_name,
          amount: remaining,
          status: 'paid',
          payment_date: new Date().toISOString().slice(0, 10),
        });
        await updateLoan(renewLoan.id, {
          status: 'completed',
          total_paid: num(renewLoan.total_paid) + remaining,
          remaining_balance: 0,
          grupo: (renewLoan.grupo ?? clientWithDerived.grupo) || null, // snapshot si faltaba
        });
      }

      // 2) Crear nuevo préstamo con snapshot de grupo
      const weeksCount = num(renewLoan.term_weeks ?? renewLoan.term ?? 14) || 14;
      const rate  = num(renewLoan.interest_rate ?? 40);
      const start_date = new Date().toISOString().slice(0, 10);

      const totalOverNet = deliver * (1 + rate / 100);
      const weekly = weeksCount > 0 ? Math.ceil(totalOverNet / weeksCount) : 0;
      const next_payment_date = addDaysISO(start_date, 7);
      const due_date = addDaysISO(start_date, weeksCount * 7 - 1);

      await addLoan({
        client_id: renewLoan.client_id,
        client_name: renewLoan.client_name,
        amount: deliver,
        total_amount: totalOverNet,
        weekly_payment: weekly,
        interest_rate: rate,
        term_weeks: weeksCount,
        start_date,
        next_payment_date,
        due_date,
        status: 'active',
        grupo: (renewLoan.grupo ?? clientWithDerived?.grupo) || null, // snapshot
      });

      setIsRenewOpen(false);
      setRenewLoan(null);
      toast({ title: 'Renovación completada', description: `Se entregan $${toMoney(deliver)}; el saldo anterior fue liquidado.` });
      await refreshData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error en renovación', description: error.message });
    }
  };

  /* ==========================
     Edición de préstamo (monto + grupo, sincroniza y backfill)
  ========================== */
  const openEditLoan = (loan) => {
    const st = String(loan.status || loan.estado_prestamo || '').toLowerCase();
    if (st !== 'active') {
      toast({
        variant: 'destructive',
        title: 'No permitido',
        description: 'Solo puedes editar préstamos activos.',
      });
      return;
    }
    setLoanToEdit(loan);
    setEditAmount(String(loan.amount ?? ''));
    setEditGrupo(String(loan.grupo ?? clientWithDerived.grupo ?? ''));
    setIsEditLoanOpen(true);
  };

  const confirmEditLoan = async () => {
    try {
      if (!loanToEdit) return;
      const base = num(editAmount);
      if (base <= 0) {
        toast({ variant: 'destructive', title: 'Monto inválido', description: 'Ingresa un monto mayor a 0.' });
        return;
      }

      const weeks = num(loanToEdit.term_weeks ?? loanToEdit.term ?? DEFAULT_WEEKS) || DEFAULT_WEEKS;
      const rate  = num(loanToEdit.interest_rate ?? DEFAULT_RATE);
      const newGrupo = (editGrupo || '').trim();

      const interest = Math.round(base * (rate / 100));
      const total    = base + interest;
      const weekly   = weeks > 0 ? Math.ceil(total / weeks) : 0;

      const alreadyPaid = num(loanToEdit.total_paid ?? loanToEdit.paid_amount);
      const remaining   = Math.max(total - alreadyPaid, 0);
      const newStatus   = remaining <= 0 ? 'completed' : 'active';

      const startISO    = loanToEdit.start_date ?? null;
      const due_date    = startISO ? addDaysISO(startISO, weeks * 7 - 1) : loanToEdit.due_date ?? null;

      await updateLoan(loanToEdit.id, {
        amount: base,
        total_amount: total,
        weekly_payment: weekly,
        remaining_balance: remaining,
        interest_rate: rate,
        term_weeks: weeks,
        due_date,
        status: newStatus,
        grupo: newGrupo || null,
      });

      // Si cambió el grupo del ACTIVO, primero backfill a préstamos históricos sin grupo
      if (String(loanToEdit.status || '').toLowerCase() === 'active') {
        const oldGrupo = String(clientWithDerived.grupo ?? '');
        if (newGrupo && newGrupo !== oldGrupo) {
          await backfillHistoricLoanGroups({
            clientId: clientWithDerived.id,
            oldGrupo,
            loans: clientLoans,
            updateLoan,
          });
          await updateClient(clientWithDerived.id, { grupo: newGrupo });
        }
      }

      setIsEditLoanOpen(false);
      setLoanToEdit(null);
      toast({
        title: 'Préstamo actualizado',
        description: `Nuevo total $${toMoney(total)} | Semanal $${toMoney(weekly)} | Saldo $${toMoney(remaining)}.`,
      });
      await refreshData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al actualizar', description: error.message });
    }
  };

  const remainingForActive =
    activeLoan
      ? Math.max(
          num(activeLoan.total_amount ?? activeLoan.amount) -
            num(activeLoan.total_paid ?? activeLoan.paid_amount),
          0
        )
      : 0;

  return (
    <>
      <Helmet>
        <title>Ficha de Cliente: {clientWithDerived.name}</title>
      </Helmet>
      <div className="space-y-6">
        <PageHeader title="Ficha de Cliente" description={`Detalles de ${clientWithDerived.name}`}>
          <div className="flex items-center gap-2">
            {clientWithDerived.maps_url && (
              <Button asChild variant="secondary">
                <a href={clientWithDerived.maps_url} target="_blank" rel="noopener noreferrer">
                  <MapPin className="mr-2 h-4 w-4" />
                  Ver en Maps
                </a>
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setIsEditingClient(true)}>
                <Edit className="mr-2 h-4 w-4" /> Editar Cliente
              </Button>
            )}
          </div>
        </PageHeader>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">
                <User className="mr-2 h-4 w-4" />
                Información
              </TabsTrigger>
              <TabsTrigger value="loans">
                <Landmark className="mr-2 h-4 w-4" />
                Préstamos
              </TabsTrigger>
              <TabsTrigger value="guarantees">
                <Shield className="mr-2 h-4 w-4" />
                Garantías
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Datos del Cliente y Aval</CardTitle>
                </CardHeader>
                <CardContent>
                  <ClientDetails client={clientWithDerived} aval={aval} loans={clientLoans} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="loans" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Préstamos ({clientLoans.length})</CardTitle>
                    <CardDescription>
                      Préstamos asociados a este cliente.
                      {hasActiveLoan && (
                        <span className="ml-2 text-emerald-700 font-medium">
                          Actualmente tiene 1 préstamo activo.
                        </span>
                      )}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openRenewDialog}
                      disabled={!renewable}
                      title={
                        renewable
                          ? 'Renovar préstamo (desde semana 10)'
                          : 'Renovación disponible a partir de la semana 10'
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Renovar
                    </Button>

                    {isAdmin && (
                      <Button
                        size="sm"
                        onClick={openAddLoan}
                        disabled={hasActiveLoan}
                        title={hasActiveLoan ? 'Ya existe un préstamo activo' : 'Añadir Préstamo'}
                        className={hasActiveLoan ? 'cursor-not-allowed opacity-70' : ''}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Añadir Préstamo
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {clientLoans.length > 0 ? (
                    clientLoans.map((loan) => (
                      <LoanItem
                        key={loan.id}
                        loan={loan}
                        clientGrupo={clientWithDerived.grupo}
                        isAdmin={isAdmin}
                        onEdit={() => openEditLoan(loan)}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="mx-auto h-12 w-12 opacity-50" />
                      <p className="mt-4">Este cliente no tiene préstamos registrados.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="guarantees" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Garantías ({clientGuarantees.length})</CardTitle>
                    <CardDescription>Garantías proporcionadas por este cliente.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {clientGuarantees.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {clientGuarantees.map((guarantee) => (
                        <div key={guarantee.id} className="p-4 border rounded-lg bg-slate-50">
                          <p className="font-semibold text-slate-800">
                            {guarantee.marca} {guarantee.modelo}
                          </p>
                          <p className="text-sm text-slate-500">No. Serie: {guarantee.no_serie || 'N/A'}</p>
                          <p className="text-sm text-slate-600 mt-2">{guarantee.descripcion}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="mx-auto h-12 w-12 opacity-50" />
                      <p className="mt-4">Este cliente no tiene garantías registradas.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      {/* Modals */}
      <Dialog open={isEditingClient} onOpenChange={setIsEditingClient}>
        <DialogContent>
          <ClientForm
            client={clientWithDerived}
            onSubmit={handleUpdateClient}
            onCancel={() => setIsEditingClient(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isAddingLoan} onOpenChange={setIsAddingLoan}>
        <DialogContent>
          <LoanForm
            clients={[clientWithDerived]}
            defaultClientId={clientWithDerived.id}
            onSubmit={handleAddLoan}
            onCancel={() => setIsAddingLoan(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal de Renovación */}
      <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
        <DialogContent className="max-w-md">
          <CardTitle className="mb-2">Renovar préstamo</CardTitle>
          <p className="text-sm text-muted-foreground mb-4">
            Disponible a partir de la semana 10. Se descuenta el saldo pendiente del préstamo actual.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Cliente</label>
              <div className="font-medium">{renewLoan?.client_name ?? clientWithDerived.name}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Saldo pendiente actual</label>
                <div className="font-semibold text-orange-600">
                  ${toMoney(renewLoan ? (renewLoan._remaining ?? renewLoan.remaining_balance) : remainingForActive)}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Monto solicitado *</label>
                <Input
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  placeholder="p. ej., 4000"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Monto a entregar</label>
              <div className="font-semibold">
                ${toMoney(Math.max(0, num(requestedAmount) - num(renewLoan?._remaining ?? remainingForActive)))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsRenewOpen(false)}>Cancelar</Button>
              <Button onClick={confirmRenew}>Confirmar renovación</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Préstamo */}
      <Dialog open={isEditLoanOpen} onOpenChange={setIsEditLoanOpen}>
        <DialogContent className="max-w-md">
          <CardTitle className="mb-2">Editar préstamo</CardTitle>
          <p className="text-sm text-muted-foreground mb-4">
            Puedes cambiar el <strong>monto</strong> y el <strong>grupo</strong>. Los importes derivados del monto se recalculan automáticamente.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Cliente</label>
              <div className="font-medium">{loanToEdit?.client_name ?? clientWithDerived.name}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Monto actual</label>
                <div className="font-semibold">${toMoney(loanToEdit?.amount ?? 0)}</div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Nuevo monto *</label>
                <Input
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="p. ej., 3500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Grupo actual</label>
                <div className="font-semibold">{loanToEdit?.grupo ?? clientWithDerived.grupo ?? '—'}</div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Nuevo grupo</label>
                <Input
                  value={editGrupo}
                  onChange={(e) => setEditGrupo(e.target.value)}
                  placeholder="Ej. 5, 5A, etc."
                />
              </div>
            </div>

            {loanToEdit && (
              <PreviewEditedTotals
                amount={num(editAmount)}
                rate={num(loanToEdit.interest_rate ?? DEFAULT_RATE)}
                weeks={num(loanToEdit.term_weeks ?? loanToEdit.term ?? DEFAULT_WEEKS) || DEFAULT_WEEKS}
                alreadyPaid={num(loanToEdit.total_paid ?? loanToEdit.paid_amount)}
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsEditLoanOpen(false)}>Cancelar</Button>
              <Button onClick={confirmEditLoan}>Guardar cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClientFile;
