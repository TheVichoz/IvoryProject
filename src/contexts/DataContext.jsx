// src/contexts/DataContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from './SupabaseAuthContext';
import { calcFlatCycle, addDaysISO } from '@/lib/loanUtils';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData debe ser usado dentro de DataProvider');
  return context;
};

// Reglas fijas
const FIXED_WEEKS = 14;
const FIXED_RATE_PERCENT = 40;

// ------- Utils base -------
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const lower = (v) => String(v || '').toLowerCase();

const computeNextPaymentDate = (startDate, nextWeekNumber) =>
  addDaysISO(startDate, nextWeekNumber * 7);

// Siguiente semana libre (1..14) a partir de un set de semanas pagadas
function firstFreeWeekFrom(paidSet) {
  for (let w = 1; w <= FIXED_WEEKS; w++) if (!paidSet.has(w)) return w;
  return FIXED_WEEKS;
}

const paidStatuses = () =>
  new Set(['paid', 'pagado', 'completed', 'success', 'confirmed']);

// ------- Helpers Supabase -------
const selectLoansQuery = () =>
  supabase
    .from('loans')
    .select(`
      id,
      client_id,
      client_name,
      amount,
      interest_rate,
      term,
      term_weeks,
      weekly_payment,
      interest_amount,
      total_amount,
      start_date,
      due_date,
      status,
      next_payment_date,
      total_paid,
      remaining_balance,
      frecuencia_pago,
      metodo_calculo,
      grupo,
      created_at
    `)
    .order('created_at', { ascending: false });

/**
 * ✅ IMPORTANTE:
 * NO usar selectPaymentsQuery() directo para llenar contexto si hay muchos pagos,
 * porque PostgREST/Supabase puede cortar el resultado (p. ej. ~1000 filas).
 * Por eso paginamos.
 */
const selectPaymentsQuery = () =>
  supabase.from('payments').select('*').order('created_at', { ascending: false });

const selectClientsQuery = () =>
  supabase.from('clients').select('*').order('created_at', { ascending: false });

const selectGuaranteesQuery = () =>
  supabase.from('guarantees').select('*, clients ( name )').order('created_at', { ascending: false });

const selectNotificationsQuery = () =>
  supabase.from('notifications').select('*').order('created_at', { ascending: false });

// ------- Data transforms -------
const mapGuaranteesWithClientName = (guaranteesRows) =>
  (guaranteesRows || []).map((g) => ({
    ...g,
    client_name: g.clients?.name || 'Cliente no encontrado',
  }));

// ------- Loan business rules helpers -------
const getLoanStartDate = (loan) =>
  loan.start_date || loan.fecha || new Date().toISOString().slice(0, 10);

const calcLoanCycle = (amount) =>
  calcFlatCycle({
    amount,
    ratePercent: FIXED_RATE_PERCENT,
    weeks: FIXED_WEEKS,
    round: 'peso',
  });

const buildLoanWithBusinessRules = ({
  baseLoan,
  amount,
  start_date,
  client_name,
  includeNextPaymentDate = true,
}) => {
  const { interest, total, weekly } = calcLoanCycle(amount);
  const due_date = addDaysISO(start_date, FIXED_WEEKS * 7);

  const next_payment_date = includeNextPaymentDate
    ? computeNextPaymentDate(start_date, 1)
    : undefined;

  const payload = {
    ...baseLoan,
    client_name,
    amount,
    interest_rate: FIXED_RATE_PERCENT,
    term: `${FIXED_WEEKS} semanas`,
    term_weeks: FIXED_WEEKS,
    interest_amount: Math.round(interest),
    total_amount: total,
    weekly_payment: weekly,
    start_date,
    due_date,
  };

  if (includeNextPaymentDate) {
    payload.next_payment_date = next_payment_date;
    payload.remaining_balance = total;
    payload.status = baseLoan.status || 'active';
  }

  return payload;
};

// Resolver nombre del cliente desde clients.name | clients.nombre
const resolveClientName = async (client_id) => {
  if (!client_id) return null;
  const { data: cRow, error } = await supabase
    .from('clients')
    .select('name, nombre')
    .eq('id', client_id)
    .single();

  if (error) {
    console.warn('No se pudo resolver client_name:', error.message);
    return null;
  }
  return cRow?.name || cRow?.nombre || null;
};

const resolveClientNameFromCacheOrDb = async ({ client_id, clientsCache }) => {
  if (!client_id) return null;
  const local = (clientsCache || []).find((c) => c.id === client_id);
  const fromCache = local?.name || local?.nombre || null;
  if (fromCache) return fromCache;
  return await resolveClientName(client_id);
};

// ------- Payments helpers -------
const getTermWeeksFromLoanRow = (loanRow) => toNum(loanRow?.term_weeks) || FIXED_WEEKS;

const buildWeekSetsFromPayments = (rows, termWeeks) => {
  const occupiedPaidWeeks = new Set();
  const paidSet = new Set();

  for (const p of rows || []) {
    const w = Number(p.week || 0);
    const st = lower(p.status);
    if (w >= 1 && w <= termWeeks) {
      if (st === 'paid' || st === 'pagado') {
        occupiedPaidWeeks.add(w);
        paidSet.add(w);
      }
    }
  }

  return { occupiedPaidWeeks, paidSet };
};

const enrichPaymentWithLoanClient = async (payment) => {
  const enriched = { ...payment };

  try {
    const { data: loanRow } = await supabase
      .from('loans')
      .select('client_name, client_id')
      .eq('id', payment.loan_id)
      .single();

    if (loanRow?.client_id && enriched.client_id == null) enriched.client_id = loanRow.client_id;

    if (!enriched.client_name) {
      if (loanRow?.client_name) {
        enriched.client_name = loanRow.client_name;
      } else if (loanRow?.client_id) {
        const name = await resolveClientName(loanRow.client_id);
        if (name) enriched.client_name = name;
      }
    }
  } catch (e) {
    console.warn('No se pudo enriquecer payment con client_name:', e?.message);
  }

  return enriched;
};

const validateAndPickWeekForNewPayment = ({ payment, existingPayments }) => {
  const termWeeks = FIXED_WEEKS;
  const { occupiedPaidWeeks, paidSet } = buildWeekSetsFromPayments(existingPayments, termWeeks);
  const nextFree = firstFreeWeekFrom(paidSet);

  const wk = Number(payment.week || 0) || nextFree;

  if (occupiedPaidWeeks.has(wk)) {
    throw new Error(`La semana ${wk} ya está cerrada (pagada).`);
  }

  return wk;
};

const validateAndPickWeekForUpdate = ({ targetWeek, existingPayments, excludePaymentId }) => {
  const termWeeks = FIXED_WEEKS;

  const filtered = (existingPayments || []).filter((p) => p.id !== excludePaymentId);
  const { occupiedPaidWeeks, paidSet } = buildWeekSetsFromPayments(filtered, termWeeks);

  const nextFree = firstFreeWeekFrom(paidSet);
  const wk = Number(targetWeek || 0) || nextFree;

  if (occupiedPaidWeeks.has(wk)) {
    throw new Error(`La semana ${wk} ya está cerrada (pagada).`);
  }

  return wk;
};

// --------- helpers para pagos (por monto) ----------
const recomputeNextDateAndBalance = async (loanId) => {
  const { data: loanRow } = await supabase
    .from('loans')
    .select('start_date, term_weeks, weekly_payment, total_amount')
    .eq('id', loanId)
    .single();

  if (!loanRow) return;

  const termWeeks = getTermWeeksFromLoanRow(loanRow);
  const weekly = toNum(loanRow.weekly_payment);
  const totalCycle = toNum(loanRow.total_amount);

  const ok = paidStatuses();
  const { data: allPays } = await supabase
    .from('payments')
    .select('amount, status')
    .eq('loan_id', loanId);

  let totalPaid = 0;
  (allPays || []).forEach((p) => {
    const st = lower(p.status);
    if (!p.status || ok.has(st)) totalPaid += toNum(p.amount);
  });

  const weeksCovered = weekly > 0 ? Math.floor(totalPaid / weekly) : 0;

  let nextDate = null;
  if (weeksCovered < termWeeks) {
    const nextWeekNum = weeksCovered + 1;
    nextDate = computeNextPaymentDate(loanRow.start_date, nextWeekNum);
  }

  const remaining = Math.max(totalCycle - totalPaid, 0);

  await supabase
    .from('loans')
    .update({ next_payment_date: nextDate, remaining_balance: remaining })
    .eq('id', loanId);
};
// ---------------------------------------------------

/**
 * ✅ FIX: traer TODOS los pagos paginando
 * (evita que Supabase “corte” el resultado cuando hay muchos registros)
 */
const fetchAllPayments = async () => {
  const PAGE = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error;

    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;

    from += PAGE;
  }

  return all;
};

export const DataProvider = ({ children }) => {
  const { session } = useAuth();
  const [clients, setClients] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [guarantees, setGuarantees] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const applyFetchedState = ({ clientsData, loansData, paymentsData, guaranteesData, notificationsData }) => {
    setClients(clientsData);
    setLoans(loansData);
    setPayments(paymentsData);
    setGuarantees(mapGuaranteesWithClientName(guaranteesData));
    setNotifications(notificationsData);
  };

  const fetchData = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // ✅ Pagos con paginación para no perder historial
      const [clientsRes, loansRes, guaranteesRes, notificationsRes, paymentsData] =
        await Promise.all([
          selectClientsQuery(),
          selectLoansQuery(),
          selectGuaranteesQuery(),
          selectNotificationsQuery(),
          fetchAllPayments(),
        ]);

      if (clientsRes.error) throw clientsRes.error;
      if (loansRes.error) throw loansRes.error;
      if (guaranteesRes.error) throw guaranteesRes.error;
      if (notificationsRes.error) throw notificationsRes.error;

      applyFetchedState({
        clientsData: clientsRes.data,
        loansData: loansRes.data,
        paymentsData, // ✅ ya viene completo
        guaranteesData: guaranteesRes.data,
        notificationsData: notificationsRes.data,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ------- Clients
  const addClient = async (client) => {
    const { data, error } = await supabase.from('clients').insert([client]).select().single();
    if (error) throw error;
    setClients((prev) => [data, ...prev]);
    return data;
  };

  const updateClient = async (id, updates) => {
    const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === id ? data : c)));
  };

  const deleteClient = async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  // ------- Loans
  const addLoan = async (loan) => {
    const amount = Number(loan.amount ?? loan.monto ?? 0);
    const start_date = getLoanStartDate(loan);

    // client_name: payload -> cache -> query
    let client_name = loan.client_name || null;
    if (!client_name && loan.client_id) {
      client_name = await resolveClientNameFromCacheOrDb({
        client_id: loan.client_id,
        clientsCache: clients,
      });
    }

    const loanWithBusinessRules = buildLoanWithBusinessRules({
      baseLoan: loan,
      amount,
      start_date,
      client_name,
      includeNextPaymentDate: true,
    });

    const { data, error } = await supabase
      .from('loans')
      .insert([loanWithBusinessRules])
      .select()
      .single();

    if (error) {
      const msg = lower(error.message);
      if (error.code === '23505' || msg.includes('uniq_active_loan_per_client')) {
        throw new Error('Este cliente ya tiene un préstamo activo.');
      }
      throw error;
    }

    setLoans((prev) => [data, ...prev]);
    return data;
  };

  const updateLoan = async (id, updates) => {
    const { data: current, error: curErr } = await supabase
      .from('loans')
      .select('amount, start_date, client_id, client_name, total_amount')
      .eq('id', id)
      .single();
    if (curErr) throw curErr;

    const amount = Number(updates.amount ?? updates.monto ?? current?.amount ?? 0);
    const start_date =
      updates.start_date || updates.fecha || current?.start_date || new Date().toISOString().slice(0, 10);

    let client_name = updates.client_name ?? current?.client_name ?? null;
    const client_id = updates.client_id ?? current?.client_id ?? null;

    if (!client_name && client_id) {
      client_name = await resolveClientNameFromCacheOrDb({
        client_id,
        clientsCache: clients,
      });
    }

    const loanWithBusinessRules = buildLoanWithBusinessRules({
      baseLoan: updates,
      amount,
      start_date,
      client_name,
      includeNextPaymentDate: false,
    });

    const { data, error } = await supabase
      .from('loans')
      .update(loanWithBusinessRules)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setLoans((prev) => prev.map((l) => (l.id === id ? data : l)));
  };

  const deleteLoan = async (id) => {
    const { error } = await supabase.from('loans').delete().eq('id', id);
    if (error) throw error;
    setLoans((prev) => prev.filter((l) => l.id !== id));
  };

  // ------- Payments
  const addPayment = async (payment) => {
    // Validar duplicado SOLO si ya hay una semana cerrada (paid)
    const { data: existing, error: qErr } = await supabase
      .from('payments')
      .select('week,status')
      .eq('loan_id', payment.loan_id);
    if (qErr) throw qErr;

    const wk = validateAndPickWeekForNewPayment({ payment, existingPayments: existing });

    // Enriquecer client_name/id
    const enrichedPayload = await enrichPaymentWithLoanClient({ ...payment, week: wk });

    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .insert([enrichedPayload])
      .select()
      .single();
    if (paymentError) throw paymentError;

    try {
      await recomputeNextDateAndBalance(payment.loan_id);
    } catch (e) {
      console.warn('No se pudo recalcular next_payment_date/remaining_balance:', e?.message);
    }

    setPayments((prev) => [paymentData, ...prev]);
    await fetchData();
    return paymentData;
  };

  const updatePayment = async (id, updates) => {
    let resolvedUpdates = { ...updates };

    // Validaciones de semana/duplicado: sólo bloquea si la semana ya está cerrada por otro pago
    if (resolvedUpdates.week || resolvedUpdates.loan_id) {
      const targetLoanId = resolvedUpdates.loan_id ?? payments.find((p) => p.id === id)?.loan_id;
      if (!targetLoanId) throw new Error('No se pudo determinar el préstamo del pago.');

      const { data: existing, error: qErr } = await supabase
        .from('payments')
        .select('id, week, status')
        .eq('loan_id', targetLoanId);
      if (qErr) throw qErr;

      const wk = validateAndPickWeekForUpdate({
        targetWeek: resolvedUpdates.week,
        existingPayments: existing,
        excludePaymentId: id,
      });

      resolvedUpdates = { ...resolvedUpdates, week: wk, loan_id: targetLoanId };
    }

    // Completar client_name si falta
    if (resolvedUpdates.loan_id && resolvedUpdates.client_name == null) {
      const enriched = await enrichPaymentWithLoanClient(resolvedUpdates);
      resolvedUpdates = { ...resolvedUpdates, ...enriched };
    }

    const { data, error } = await supabase
      .from('payments')
      .update(resolvedUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    try {
      await recomputeNextDateAndBalance(data.loan_id);
    } catch (e) {
      console.warn('No se pudo recalcular next_payment_date/remaining_balance (update):', e?.message);
    }

    setPayments((prev) => prev.map((p) => (p.id === id ? data : p)));
    await fetchData();
  };

  const deletePayment = async (id) => {
    const row = payments.find((p) => p.id === id);
    const loanId = row?.loan_id;

    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) throw error;

    setPayments((prev) => prev.filter((p) => p.id !== id));

    if (loanId) {
      try {
        await recomputeNextDateAndBalance(loanId);
      } catch (e) {
        console.warn('No se pudo recalcular tras eliminar pago:', e?.message);
      }
    }

    await fetchData();
  };

  // ------- Guarantees
  const addGuarantee = async (guarantee) => {
    const { data, error } = await supabase
      .from('guarantees')
      .insert([guarantee])
      .select('*, clients ( name )')
      .single();
    if (error) throw error;

    const newGuarantee = { ...data, client_name: data.clients?.name };
    delete newGuarantee.clients;

    setGuarantees((prev) => [newGuarantee, ...prev]);
    return newGuarantee;
  };

  const updateGuarantee = async (id, updates) => {
    const { data, error } = await supabase
      .from('guarantees')
      .update(updates)
      .eq('id', id)
      .select('*, clients ( name )')
      .single();
    if (error) throw error;

    const updatedGuarantee = { ...data, client_name: data.clients?.name };
    delete updatedGuarantee.clients;

    setGuarantees((prev) => prev.map((g) => (g.id === id ? updatedGuarantee : g)));
  };

  const deleteGuarantee = async (id) => {
    const { error } = await supabase.from('guarantees').delete().eq('id', id);
    if (error) throw error;
    setGuarantees((prev) => prev.filter((g) => g.id !== id));
  };

  const value = {
    clients,
    loans,
    payments,
    guarantees,
    notifications,
    loading,
    addClient,
    updateClient,
    deleteClient,
    addLoan,
    updateLoan,
    deleteLoan,
    addPayment,
    updatePayment,
    deletePayment,
    addGuarantee,
    updateGuarantee,
    deleteGuarantee,
    refreshData: fetchData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
