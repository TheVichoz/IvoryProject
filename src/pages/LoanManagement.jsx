// src/pages/LoanManagement.jsx
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import {
  Plus, Search, Eye, MoreVertical, Edit, Trash2, DollarSign,
  CheckCircle, Clock, AlertTriangle, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import LoanForm from '@/components/forms/LoanForm';
import LoanDetails from '@/components/details/LoanDetails';
import PaymentForm from '@/components/forms/PaymentForm';
import PageHeader from '@/components/PageHeader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import BulkPaymentDialog from '@/components/forms/BulkPaymentDialog';
import { useRole } from '@/hooks/useRole';

/* =============== helpers =============== */
const OK_PAYMENT_STATUS = new Set(['paid', 'pagado', 'completed', 'success', 'confirmed']);

const num = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toMoney = (v) => num(v).toLocaleString('es-MX');

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).includes('T') ? v : `${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const addDaysISO = (isoDate, days) => {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const shapeLoan = (loan) => {
  const total = num(loan.total_amount ?? loan.amount);
  let paid = num(loan.paid_amount);
  if (!paid && loan.remaining_balance !== undefined && loan.remaining_balance !== null) {
    paid = Math.max(total - num(loan.remaining_balance), 0);
  }
  const remaining = Math.max(total - paid, 0);
  const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;

  return {
    ...loan,
    _total: total,
    _paid: paid,
    _remaining: remaining,
    _progress: progress,
  };
};

const getStatusInfo = (status) => {
  switch (status) {
    case 'active': return { text: 'Activo', color: 'bg-green-100 text-green-800' };
    case 'completed': return { text: 'Completado', color: 'bg-blue-100 text-blue-800' };
    case 'overdue': return { text: 'Vencido', color: 'bg-red-100 text-red-800' };
    default: return { text: 'Desconocido', color: 'bg-gray-100 text-gray-800' };
  }
};

/** Derivar estado si viene vacío */
const deriveStatus = (loan) => {
  const raw = String(loan?.status || '').toLowerCase();
  if (['active', 'completed', 'overdue'].includes(raw)) return raw;

  const remaining = num(loan._remaining ?? loan.remaining_balance
    ?? (num(loan.total_amount ?? loan.amount) - num(loan._paid ?? loan.paid_amount)));

  if (remaining <= 0) return 'completed';

  const termWeeks = num(loan.term_weeks ?? loan.term ?? loan.weeks);
  const weeksPaid = num(loan.weeks_paid ?? loan.paid_weeks);
  if (termWeeks > 0 && weeksPaid >= termWeeks) return 'completed';

  return 'active';
};

// semanas pagadas por monto
const weeksPaidForLoan = (loan, payments) => {
  if (!loan) return 0;
  const loanId = String(loan.id);
  const term = num(loan.term_weeks ?? loan.term ?? loan.weeks ?? 14) || 14;

  // weekly: si no viene, derivarlo con total/term
  let weekly = num(loan.weekly_payment);
  if (weekly <= 0) {
    const total = num(loan.total_amount ?? (loan.amount * 1.4));
    weekly = term > 0 ? total / term : 0;
  }
  if (weekly <= 0) return 0;

  let totalPaid = 0;
  (payments || []).forEach((p) => {
    const sameLoan = String(p.loan_id ?? p.prestamo_id ?? p.loanId) === loanId;
    const st = String(p.status || '').toLowerCase();
    if (sameLoan && (!p.status || OK_PAYMENT_STATUS.has(st))) {
      totalPaid += num(p.amount ?? p.monto ?? p.payment_amount ?? p.importe);
    }
  });

  const byAmount = Math.floor(totalPaid / weekly);
  return Math.min(term, byAmount);
};

/** Deriva la siguiente fecha de pago */
const deriveNextPaymentDate = (loan, payments) => {
  const start = loan.start_date;
  if (!start) return null;
  const paidWeeks = weeksPaidForLoan(loan, payments);
  return addDaysISO(start, (paidWeeks + 1) * 7);
};

// Semáforo por proximidad de pago
const getTrafficStatus = (loan) => {
  const next = parseDate(loan.next_payment_date ?? loan.nextDueDate ?? loan.due_date_next);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (num(loan._remaining ?? loan.remaining_balance) <= 0) {
    return { text: 'Liquidado', dot: 'bg-emerald-500', textColor: 'text-emerald-700' };
  }
  if (!next) return { text: '—', dot: 'bg-gray-300', textColor: 'text-gray-500' };

  const days = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: 'Pago atrasado', dot: 'bg-red-500', textColor: 'text-red-700' };
  if (days <= 3) return { text: 'Pago acercándose', dot: 'bg-yellow-400', textColor: 'text-yellow-700' };
  return { text: 'Al corriente', dot: 'bg-green-500', textColor: 'text-green-700' };
};

// ¿préstamo liquidado?
const isLoanLiquidated = (loan) => {
  if (!loan) return false;
  const status = String(loan.status || '').toLowerCase();
  if (status === 'completed') return true;

  const remaining = num(loan._remaining ?? loan.remaining_balance);
  if (remaining <= 0) return true;

  const termWeeks = num(loan.term_weeks ?? loan.term ?? loan.weeks);
  const weeksPaid = num(loan.weeks_paid ?? loan.paid_weeks);
  if (termWeeks > 0 && weeksPaid >= termWeeks) return true;

  return false;
};

// ✅ FIX: ¿se puede renovar desde semana 10?
// - usa el estado derivado (igual que el badge), no el status "crudo"
const canRenewLoan = (loan, payments) => {
  return deriveStatus(shapeLoan(loan)) === 'active'
    && weeksPaidForLoan(loan, payments) >= 10;
};

/* ======= edición: helpers y preview ======= */
const DEFAULT_WEEKS = 14;
const DEFAULT_RATE = 40; // %

const parseWeeks = (loan) => {
  const t = loan?.term_weeks ?? loan?.term ?? DEFAULT_WEEKS;
  if (typeof t === 'number') return t || DEFAULT_WEEKS;
  if (typeof t === 'string') {
    const m = t.match(/\d+/)?.[0];
    return m ? Number(m) : DEFAULT_WEEKS;
  }
  return DEFAULT_WEEKS;
};

const normalizeRate = (loan) => {
  const r = loan?.interest_rate ?? DEFAULT_RATE;
  return num(r);
};

const PreviewEditedTotals = ({ amount, rate, weeks, alreadyPaid }) => {
  const base = num(amount);
  if (!base || base <= 0) return null;
  const interest = Math.round(base * (rate / 100));
  const total = base + interest;
  const weekly = weeks > 0 ? Math.ceil(total / weeks) : 0;
  const remaining = Math.max(total - num(alreadyPaid), 0);
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
      {willComplete && (
        <div className="mt-2 text-emerald-700 font-medium">
          Con este cambio, el préstamo quedará liquidado (completed).
        </div>
      )}
    </div>
  );
};

/* ===== UI subcomponentes ===== */
const getPaymentBadge = (status) => {
  switch (status) {
    case 'paid':
      return { text: 'Pagado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-5 w-5 text-secondary" /> };
    case 'pending':
      return { text: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-5 w-5 text-yellow-600" /> };
    case 'overdue':
      return { text: 'Vencido', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-5 w-5 text-destructive" /> };
    default:
      return { text: 'Desconocido', color: 'bg-gray-100 text-gray-800', icon: <Clock className="h-5 w-5 text-muted-foreground" /> };
  }
};

/**
 * ✅ FIX HISTORIAL: no usar new Date("YYYY-MM-DD") directo
 * - evita desfase por timezone (se ve un día antes)
 * - evita crash si payment_date viene null/undefined
 */
const PaymentCardRow = ({ payment, onEdit, onDelete, canWrite, isAdmin }) => {
  const st = getPaymentBadge(payment.status);
  const d = parseDate(payment?.payment_date);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="flex items-center justify-between p-3 bg-card rounded-lg border hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${st.color}`}>{st.icon}</div>
        <div>
          <p className="font-medium text-foreground">
            Préstamo #{payment.loan_id} {payment.week ? `· Semana ${payment.week}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {d ? d.toLocaleDateString('es-MX') : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-base font-semibold text-foreground">
            ${Number(payment.amount ?? 0).toLocaleString('es-MX')}
          </p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
            {st.text}
          </span>
        </div>

        {(canWrite || isAdmin) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onEdit(payment)}>
                <Edit className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(payment)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.div>
  );
};

const LoanCard = ({ loan, onSelect, onEdit, onDelete, onQuickPay, onRenew, canWrite, isAdmin, payments }) => {
  const L = shapeLoan(loan);
  const statusInfo = getStatusInfo(deriveStatus(L));
  const traffic = getTrafficStatus(L);
  const locked = isLoanLiquidated(L);
  const renewable = canRenewLoan(L, payments);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">Préstamo #{L.id}</CardTitle>
            <div className="flex flex-col items-end">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.text}
              </span>
              <div className="flex items-center gap-2 mt-1 text-xs font-medium">
                <span className={`inline-block w-2 h-2 rounded-full ${traffic.dot}`} />
                <span className={`${traffic.textColor}`}>{traffic.text}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 gap-2">
            <p className="text-sm text-muted-foreground">
              {L.client_name_live ?? L.client_name}
            </p>

            {(canWrite || isAdmin) && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => !locked && onQuickPay(L)}
                  disabled={locked}
                  className="gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                  title={locked ? 'Préstamo liquidado: no se pueden registrar más pagos' : 'Registrar pago'}
                >
                  <DollarSign className="h-4 w-4" />
                  Pago
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(L)}
                  className="gap-1"
                  title="Editar préstamo"
                >
                  <Edit className="h-4 w-4" />
                  Editar
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => renewable && onRenew(L)}
                  disabled={!renewable}
                  className="gap-1 disabled:opacity-50"
                  title={
                    renewable
                      ? 'Renovar: se liquida el saldo pendiente y se crea un préstamo nuevo'
                      : 'Renovación disponible a partir de la semana 10'
                  }
                >
                  <RefreshCw className="h-4 w-4" />
                  Renovar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-grow flex flex-col justify-between">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Pagado</span>
              <span className="font-medium text-secondary">${toMoney(L._paid)}</span>
            </div>

            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-secondary to-primary h-2 rounded-full"
                style={{ width: `${L._progress}%` }}
              />
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Pendiente</span>
              <span className="font-medium text-orange-600">${toMoney(L._remaining)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onSelect(L)}>
              <Eye className="h-4 w-4 mr-1" /> Ver Detalles
            </Button>

            {(canWrite || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onEdit(L)}>
                    <Edit className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(L)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

/* =============== página principal =============== */
const LoanManagement = () => {
  const { profile, isAdmin } = useAuth();
  const { canWrite } = useRole();
  const role = profile?.role;
  const isStaff = role === 'ADMIN_GENERAL' || role === 'ADMIN_RUTA';

  const {
    clients, loans, payments,
    addLoan, updateLoan, deleteLoan,
    addPayment, updatePayment, deletePayment,
    loading
  } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [loanToDelete, setLoanToDelete] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // pagos
  const [editingPayment, setEditingPayment] = useState(null);
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);

  // pago masivo
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  // historial (sidebar) búsqueda
  const [searchPayments, setSearchPayments] = useState('');

  // renovación
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewLoan, setRenewLoan] = useState(null);
  const [newPrincipal, setNewPrincipal] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newRate, setNewRate] = useState(40);
  const [newWeeks, setNewWeeks] = useState(14);

  // ===== edición rápida (solo monto) =====
  const [isEditLoanOpen, setIsEditLoanOpen] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState(null);
  const [editAmount, setEditAmount] = useState('');

  // 🔹 Mapa de nombre vivo por client_id
  const nameById = useMemo(() => {
    const m = new Map();
    (clients ?? []).forEach(c => {
      if (c?.id) m.set(String(c.id), c.name || c.nombre || c.full_name || null);
    });
    return m;
  }, [clients]);

  // 🔹 Helper para mostrar siempre el nombre vivo si existe
  const getDisplayName = (obj) => {
    const cid = obj?.client_id ?? obj?.cliente_id ?? obj?.clientId;
    const live = cid != null ? nameById.get(String(cid)) : null;
    return live || obj?.client_name || '—';
  };

  // pagos agregados para tarjetas
const paidByLoanId = useMemo(() => {
  const map = new Map();
  (payments ?? []).forEach((p) => {
    if (!p) return;

    const rawLoanId = p.loan_id ?? p.prestamo_id ?? p.loanId;
    if (!rawLoanId) return;

    const loanId = String(rawLoanId); // ✅ normaliza SIEMPRE
    const amt = num(p.amount ?? p.monto ?? p.payment_amount ?? p.importe);

    const st = String(p.status || '').toLowerCase();
    if (!p.status || OK_PAYMENT_STATUS.has(st)) {
      map.set(loanId, (map.get(loanId) ?? 0) + amt);
    }
  });
  return map;
}, [payments]);


  // préstamos enriquecidos
  const enrichedLoans = useMemo(() => {
    const FIXED_WEEKS = 14;
    const FIXED_RATE = 40;
    return (loans || []).map((l) => {
      const amount = num(l.amount ?? l.monto);
      const weeks = num(l.term_weeks ?? l.term ?? l.weeks) || FIXED_WEEKS;
      const ratePct = num(l.interest_rate) || FIXED_RATE;
      const total_amount = num(l.total_amount) || amount * (1 + ratePct / 100);
const paidFromMap = paidByLoanId.has(String(l.id)) ? num(paidByLoanId.get(String(l.id))) : 0;

// ✅ prioridad: pagos reales (map) > campo guardado
const total_paid = paidFromMap > 0 ? paidFromMap : num(l.total_paid ?? l.total_paid_amount ?? l.paid_amount);

// ✅ saldo SIEMPRE derivado del total - pagado (evita inversión)
const remaining_balance = Math.max(total_amount - total_paid, 0);

const weekly_payment =
  num(l.weekly_payment) > 0
    ? num(l.weekly_payment)
    : (weeks > 0 ? Math.ceil(total_amount / weeks) : 0);

      const enriched = {
        ...l,
        weekly_payment,
        total_amount,
        total_paid,
        remaining_balance,
        term_weeks: weeks,
        interest_rate: ratePct,
        client_name_live: getDisplayName(l),
      };

      const next_payment_date = l.next_payment_date || deriveNextPaymentDate(enriched, payments);

      return {
        ...enriched,
        next_payment_date,
      };
    });
  }, [loans, paidByLoanId, payments, nameById]);

  const enrichedById = useMemo(() => {
    const m = new Map();
    enrichedLoans.forEach(l => m.set(l.id, l));
    return m;
  }, [enrichedLoans]);

  // lista de préstamos a mostrar
  const displayLoansRaw = loans || [];
  const displayLoans = useMemo(() => {
    return (displayLoansRaw ?? []).map(l => {
      const total = num(l.total_amount ?? l.amount);
const paidAgg = paidByLoanId.has(String(l.id))
  ? num(paidByLoanId.get(String(l.id)))
  : num(l.paid_amount);

      const remaining = Math.max(total - paidAgg, 0);

      const enriched = enrichedById.get(l.id) || l;
      const next_payment_date = l.next_payment_date || deriveNextPaymentDate(enriched, payments);

      return {
        ...l,
        paid_amount: paidAgg,
        remaining_balance: remaining,
        next_payment_date,
        client_name_live: enriched.client_name_live ?? getDisplayName(l),
      };
    });
  }, [displayLoansRaw, paidByLoanId, enrichedById, payments]);

  const filteredLoans = displayLoans.filter(l =>
    ((l.client_name_live ?? l.client_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())) ||
    String(l.id ?? '').includes(searchTerm)
  );

  // historial de pagos en sidebar (búsqueda por nombre vivo también)
  const displayPayments = payments || [];
  const filteredPayments = (displayPayments || [])
    .filter((p) => {
      const liveName = getDisplayName(p);
      return (
        ((liveName || '').toLowerCase().includes(searchPayments.toLowerCase())) ||
        ((p.client_name || '').toLowerCase().includes(searchPayments.toLowerCase())) ||
        String(p.loan_id || '').includes(searchPayments)
      );
    })
    .sort((a, b) => {
      const tb = parseDate(b?.payment_date)?.getTime() ?? 0;
      const ta = parseDate(a?.payment_date)?.getTime() ?? 0;
      return tb - ta;
    });

  /* CRUD préstamos */
  const handleFormSubmit = async (loanData) => {
    try {
      if (editingLoan) {
        await updateLoan(editingLoan.id, loanData);
        toast({ title: 'Préstamo actualizado' });
      } else {
        await addLoan(loanData);
        toast({ title: 'Préstamo creado' });
      }
      setIsFormOpen(false);
      setEditingLoan(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  /* abrir modales, etc */
  const handleSelectLoan = (loan) => {
    setSelectedLoan(loan);
    setIsDetailsOpen(true);
  };

  const handleDeleteLoan = async () => {
    if (!loanToDelete) return;
    try {
      await deleteLoan(loanToDelete.id);
      toast({ title: 'Préstamo eliminado' });
      setLoanToDelete(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    }
  };

  /* pagos: abrir/cerrar y submit */
  const handleOpenPaymentBlank = () => {
    setEditingPayment(null);
    setIsPaymentFormOpen(true);
  };

  const handleQuickPayFromLoan = (loan) => {
    if (isLoanLiquidated(loan)) {
      toast({
        variant: 'destructive',
        title: 'Acción no permitida',
        description: 'El préstamo está liquidado. No se pueden registrar más pagos.',
      });
      return;
    }
    setEditingPayment({
      loan_id: loan.id,
      client_id: loan.client_id,
      client_name: loan.client_name_live ?? loan.client_name
    });
    setIsPaymentFormOpen(true);
  };

  // helper para persistir la siguiente fecha tras registrar/editar pago
  const persistNextDateAfter = async (loanId, updatedPaymentsArray) => {
    const enriched = enrichedById.get(loanId) || loans.find(l => l.id === loanId);
    if (!enriched) return;
    const next = deriveNextPaymentDate(enriched, updatedPaymentsArray);
    if (next && next !== enriched.next_payment_date) {
      await updateLoan(loanId, { next_payment_date: next });
    }
  };

  const handlePaymentSubmit = async (paymentData) => {
    try {
      let finalPayment = { ...paymentData };
      if (!finalPayment.loan_id && editingPayment?.loan_id) {
        finalPayment.loan_id = editingPayment.loan_id;
      }

      if (editingPayment && editingPayment.id) {
        await updatePayment(editingPayment.id, finalPayment);
        const updated = (payments || []).map(p =>
          p.id === editingPayment.id ? { ...p, ...finalPayment } : p
        );
        await persistNextDateAfter(finalPayment.loan_id, updated);
        toast({ title: 'Pago actualizado' });
      } else {
        const newPayment = { ...finalPayment };
        await addPayment(newPayment);
        const updated = [...(payments || []), newPayment];
        await persistNextDateAfter(newPayment.loan_id, updated);
        toast({ title: 'Pago registrado' });
      }

      setIsPaymentFormOpen(false);
      setEditingPayment(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    try {
      await deletePayment(paymentToDelete.id);
      const remaining = (payments || []).filter(p => p.id !== paymentToDelete.id);
      await persistNextDateAfter(paymentToDelete.loan_id, remaining);
      toast({ title: 'Pago eliminado' });
      setPaymentToDelete(null);
    } catch (error) {
      const raw = String(error?.message || '').toLowerCase();
      const isConstraint =
        raw.includes('uniq_active_loan_per_client') ||
        raw.includes('duplicate key value') ||
        raw.includes('unique constraint');

      const description = isConstraint
        ? 'No se puede eliminar este pago porque está asociado a un préstamo liquidado y el cliente ya tiene un nuevo préstamo activo.'
        : (error?.message || 'Ocurrió un error al eliminar el pago.');

      toast({
        variant: 'destructive',
        title: 'Error al borrar el pago',
        description,
      });
    }
  };

  /* Renovación */
  const openRenewDialog = (loan) => {
    if (!canRenewLoan(loan, payments)) {
      toast({
        variant: 'destructive',
        title: 'Aún no puedes renovar',
        description: 'La renovación está disponible a partir de la semana 10.',
      });
      return;
    }
    setRenewLoan(loan);
    setNewPrincipal('');
    setNewRate(num(loan.interest_rate ?? 40) || 40);
    setNewWeeks(num(loan.term_weeks ?? loan.term ?? 14) || 14);
    setNewStartDate(new Date().toISOString().slice(0, 10));
    setIsRenewOpen(true);
  };

  const confirmRenew = async () => {
    try {
      if (!renewLoan) return;

      const remaining = num(renewLoan._remaining ?? renewLoan.remaining_balance);
      const principal = num(newPrincipal);
      const rate = num(newRate);
      const weeks = num(newWeeks);
      const startISO = newStartDate || new Date().toISOString().slice(0, 10);

      if (principal <= 0) {
        toast({ variant: 'destructive', title: 'Monto inválido', description: 'Ingrese el monto solicitado del nuevo préstamo.' });
        return;
      }
      if (!startISO) {
        toast({ variant: 'destructive', title: 'Fecha inválida', description: 'Ingrese la fecha de inicio del nuevo préstamo.' });
        return;
      }

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
        });
      }

      const totalOver = principal * (1 + rate / 100);
      const weekly = weeks > 0 ? Math.ceil(totalOver / weeks) : 0;

      await addLoan({
        client_id: renewLoan.client_id,
        client_name: renewLoan.client_name,
        amount: principal,
        total_amount: totalOver,
        weekly_payment: weekly,
        interest_rate: rate,
        term_weeks: weeks,
        start_date: startISO,
        status: 'active',
      });

      setIsRenewOpen(false);
      setRenewLoan(null);
      toast({
        title: 'Renovación completada',
        description: `Se liquidó el saldo anterior${remaining > 0 ? ` ($${toMoney(remaining)})` : ''} y se creó un nuevo préstamo por $${toMoney(principal)} (total $${toMoney(totalOver)}).`
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error en renovación', description: error.message });
    }
  };

  /* ===== Edición rápida: abrir y confirmar ===== */
  const openEditAmount = (loan) => {
    const st = String(loan?.status || '').toLowerCase();
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

      const weeks = parseWeeks(loanToEdit);
      const rate = normalizeRate(loanToEdit);

      const interest = Math.round(base * (rate / 100));
      const total = base + interest;
      const weekly = weeks > 0 ? Math.ceil(total / weeks) : 0;

      const alreadyPaid = num(loanToEdit.total_paid ?? loanToEdit.paid_amount);
      const remaining = Math.max(total - alreadyPaid, 0);
      const newStatus = remaining <= 0 ? 'completed' : 'active';

      const startISO = loanToEdit.start_date ?? null;
      const due_date = startISO ? addDaysISO(startISO, weeks * 7 - 1) : (loanToEdit.due_date ?? null);

      await updateLoan(loanToEdit.id, {
        amount: base,
        total_amount: total,
        weekly_payment: weekly,
        remaining_balance: remaining,
        interest_rate: rate,
        term_weeks: weeks,
        due_date,
        status: newStatus,
      });

      setIsEditLoanOpen(false);
      setLoanToEdit(null);
      toast({
        title: 'Préstamo actualizado',
        description: `Nuevo total $${toMoney(total)} | Semanal $${toMoney(weekly)} | Saldo $${toMoney(remaining)}.`,
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al actualizar', description: error.message });
    }
  };

  // ===== contador de pagos para el modal de eliminación de préstamo =====
  const paymentsCountForLoanToDelete = loanToDelete
    ? (payments || []).filter(p => String(p.loan_id) === String(loanToDelete.id)).length
    : 0;

  return (
    <>
      <Helmet>
        <title>Gestión de Préstamos - FinanComunitaria</title>
      </Helmet>

      <div className="space-y-6">
        <PageHeader
          title="Gestión de Préstamos"
          description="Administra y registra pagos de los préstamos"
        >
          {(canWrite || isAdmin) && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => { setEditingLoan(null); setIsFormOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-2" /> Nuevo Préstamo
              </Button>

              <Button type="button" variant="secondary" onClick={handleOpenPaymentBlank}>
                <DollarSign className="h-4 w-4 mr-2" /> Registrar Pago
              </Button>

              <Button type="button" variant="outline" onClick={() => setIsBulkOpen(true)}>
                <DollarSign className="h-4 w-4 mr-2" /> Registrar pago masivo
              </Button>
            </div>
          )}
        </PageHeader>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Izquierda: préstamos */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative"
            >
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente o ID de préstamo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </motion.div>

            {loading ? (
              <div className="text-center py-12">Cargando préstamos...</div>
            ) : (
              <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredLoans.map(loan => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    // ✅ FIX: antes era setSelectedLoan (solo setea y NO abre modal)
                    onSelect={handleSelectLoan}
                    onEdit={openEditAmount}
                    onDelete={() => setLoanToDelete(loan)}
                    onQuickPay={handleQuickPayFromLoan}
                    onRenew={openRenewDialog}
                    canWrite={canWrite}
                    isAdmin={isAdmin}
                    payments={payments}
                  />
                ))}
              </motion.div>
            )}

            {filteredLoans.length === 0 && !loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                <Search className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No se encontraron préstamos</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Intenta con otra búsqueda' : 'No hay préstamos para mostrar.'}
                </p>
              </motion.div>
            )}
          </div>

          {/* Derecha: historial de pagos */}
          <aside className="lg:col-span-1 lg:sticky lg:top-24 self-start">
            <Card className="h-auto">
              <CardHeader className="space-y-2">
                <CardTitle>Historial de Pagos</CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente o ID de préstamo..."
                    value={searchPayments}
                    onChange={(e) => setSearchPayments(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-center py-8">Cargando pagos...</div>
                ) : (
                  <div className="space-y-3">
                    {filteredPayments.length > 0 ? (
                      filteredPayments.map((payment) => (
                        <PaymentCardRow
                          key={payment.id}
                          payment={payment}
                          onEdit={(p) => { setEditingPayment(p); setIsPaymentFormOpen(true); }}
                          onDelete={(p) => setPaymentToDelete(p)}
                          canWrite={canWrite}
                          isAdmin={isAdmin}
                        />
                      ))
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        No hay pagos para mostrar.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* ===================== DIALOGS QUE FALTABAN (FIX) ===================== */}

      {/* Crear / Editar préstamo */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <LoanForm
            loan={editingLoan}
            clients={clients}
            onSubmit={handleFormSubmit}
            onCancel={() => { setIsFormOpen(false); setEditingLoan(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Ver detalles del préstamo */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <LoanDetails
            loan={selectedLoan}
            payments={(payments || []).filter(
              (p) => String(p.loan_id) === String(selectedLoan?.id)
            )}
            onClose={() => setIsDetailsOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal: Editar préstamo (edición rápida por monto) */}
      <Dialog open={isEditLoanOpen} onOpenChange={setIsEditLoanOpen}>
        <DialogContent className="max-w-md">
          <CardTitle className="mb-2">Editar préstamo</CardTitle>
          <p className="text-sm text-muted-foreground mb-4">
            Cambia el <strong>monto</strong>. Se recalcula el total, semanal y saldo.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Cliente</label>
              <div className="font-medium">
                {loanToEdit?.client_name_live ?? loanToEdit?.client_name ?? '—'}
              </div>
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

            {loanToEdit && (
              <PreviewEditedTotals
                amount={num(editAmount)}
                rate={normalizeRate(loanToEdit)}
                weeks={parseWeeks(loanToEdit)}
                alreadyPaid={num(loanToEdit.total_paid ?? loanToEdit.paid_amount)}
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditLoanOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmEditLoan}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renovación */}
      <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
        <DialogContent className="max-w-md">
          <CardTitle className="mb-2">Renovar préstamo</CardTitle>
          <p className="text-sm text-muted-foreground mb-4">
            Se liquida el saldo pendiente del préstamo actual y se crea uno nuevo.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Cliente</label>
              <div className="font-medium">
                {renewLoan?.client_name_live ?? renewLoan?.client_name ?? '—'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Saldo actual</label>
                <div className="font-semibold text-orange-600">
                  ${toMoney(num(renewLoan?._remaining ?? renewLoan?.remaining_balance))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Monto nuevo *</label>
                <Input
                  value={newPrincipal}
                  onChange={(e) => setNewPrincipal(e.target.value)}
                  placeholder="p. ej., 3000"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Interés (%)</label>
                <Input
                  value={String(newRate)}
                  onChange={(e) => setNewRate(num(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Semanas</label>
                <Input
                  value={String(newWeeks)}
                  onChange={(e) => setNewWeeks(num(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Inicio</label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setIsRenewOpen(false); setRenewLoan(null); }}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={confirmRenew}>
                Confirmar renovación
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registrar/Editar pago */}
      <Dialog open={isPaymentFormOpen} onOpenChange={setIsPaymentFormOpen}>
        <DialogContent>
          <PaymentForm
            payment={editingPayment}
            loans={enrichedLoans}
            payments={payments}
            onSubmit={handlePaymentSubmit}
            onCancel={() => setIsPaymentFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Pago masivo */}
      <BulkPaymentDialog open={isBulkOpen} onOpenChange={setIsBulkOpen} />

      {/* Eliminar pago */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmas la eliminación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. El pago será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePayment}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar préstamo */}
      <AlertDialog open={!!loanToDelete} onOpenChange={() => setLoanToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar préstamo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible.
              {paymentsCountForLoanToDelete > 0 && (
                <>
                  <br />
                  <span className="font-medium">
                    Nota: Este préstamo tiene {paymentsCountForLoanToDelete} pagos registrados.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLoan}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LoanManagement;
