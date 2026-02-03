// src/components/payments/BulkPaymentDialog.jsx
import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";

/* ===================== Utils ===================== */
const toISODate = (value) => {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

const addDaysISO = (yyyyMmDd, days) => {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().split("T")[0];
};

const toNumber = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
};

const computeInitialRemaining = (loan) => {
  if (loan?.remaining_balance !== null && loan?.remaining_balance !== undefined) {
    return toNumber(loan.remaining_balance);
  }
  if (loan?.total_amount !== null && loan?.total_amount !== undefined) {
    return toNumber(loan.total_amount);
  }
  return toNumber(loan?.amount) + toNumber(loan?.interest_amount);
};

// fechas: texto dd/mm/aaaa <-> ISO
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

const toDisplayDDMMYYYY = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${pad2(Number(d))}/${pad2(Number(m))}/${y}`;
};

const toISOFromFlexible = (txt) => {
  if (!txt) return "";
  const s = txt.trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
    return "";
  }

  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m1) {
    const d = Number(m1[1]);
    const m = Number(m1[2]);
    const y = Number(m1[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return "";
};
/* ================================================= */

/* ============== Helpers para Submit (Sonar) ============== */
const groupRowsByLoanId = (rows) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.loan_id)) map.set(r.loan_id, []);
    map.get(r.loan_id).push(r);
  }
  return map;
};

const getLoanTermWeeks = (loan) => {
  const fromTermWeeks = Number(loan?.term_weeks);
  if (Number.isFinite(fromTermWeeks) && fromTermWeeks > 0) return fromTermWeeks;

  const termMatch = String(loan?.term || "").match(/\d+/)?.[0];
  const fromTerm = Number(termMatch);
  if (Number.isFinite(fromTerm) && fromTerm > 0) return fromTerm;

  return 14;
};

const fetchExistingPayments = async (loanIds) => {
  const { data, error } = await supabase
    .from("payments")
    .select("loan_id, week, status")
    .in("loan_id", loanIds);

  if (error) throw error;
  return data || [];
};

const buildOccupiedAndPaidWeeks = (payments, termWeeks) => {
  const occupiedWeeks = new Set();
  const paidWeeks = new Set();

  for (const p of payments) {
    const w = Number(p.week || 0);
    if (w < 1 || w > termWeeks) continue;

    occupiedWeeks.add(w);

    const st = String(p.status || "").toLowerCase();
    if (st === "paid" || st === "pagado") paidWeeks.add(w);
  }

  return { occupiedWeeks, paidWeeks };
};

const findNextFreeWeek = (termWeeks, paidWeeks, occupiedWeeks, batchAssigned) => {
  for (let w = 1; w <= termWeeks; w++) {
    const isFree = !paidWeeks.has(w) && !occupiedWeeks.has(w) && !batchAssigned.has(w);
    if (isFree) return w;
  }
  return null;
};

const assignWeeksForAllLoans = ({ loanIds, byLoan, payData, activeLoans }) => {
  const weekByRow = new Map();
  const noWeeks = [];

  for (const loanId of loanIds) {
    const rowsForLoan = byLoan.get(loanId) || [];
    const loan = activeLoans.find((l) => l.id === loanId);

    const termWeeks = Math.max(1, getLoanTermWeeks(loan));
    const existing = payData.filter((p) => p.loan_id === loanId);
    const { occupiedWeeks, paidWeeks } = buildOccupiedAndPaidWeeks(existing, termWeeks);

    const batchAssigned = new Set();

    for (const r of rowsForLoan) {
      const week = findNextFreeWeek(termWeeks, paidWeeks, occupiedWeeks, batchAssigned);

      if (week == null) {
        noWeeks.push(`Préstamo #${loanId} (${r.client_name || "sin nombre"}) sin semanas libres`);
        continue;
      }

      batchAssigned.add(week);
      weekByRow.set(r, week);
    }
  }

  return { weekByRow, noWeeks };
};

const buildRowsToInsert = (effectiveRows, weekByRow) =>
  effectiveRows.map((r) => ({
    loan_id: r.loan_id,
    client_id: Number(r.client_id),
    client_name: r.client_name || null,
    amount: toNumber(r.amount),
    payment_date: r.date, // ISO
    status: "paid",
    week: weekByRow.get(r),
  }));

const insertPayments = async (rowsToInsert) => {
  const { error } = await supabase.from("payments").insert(rowsToInsert);
  if (error) throw error;
};

const computeNextPaymentDate = (loan, paymentISO) => {
  const scheduledBase =
    loan?.next_payment_date ||
    (loan?.start_date ? addDaysISO(loan.start_date, 7) : null) ||
    paymentISO;

  return addDaysISO(scheduledBase, 7);
};

const updateLoanCompleted = async (loanId, dueDateISO) => {
  const { error } = await supabase
    .from("loans")
    .update({
      status: "completed",
      remaining_balance: 0,
      next_payment_date: null,
      due_date: dueDateISO,
    })
    .eq("id", loanId);

  if (error) throw error;
};

const updateLoanActive = async (loanId, nextPaymentISO, newRemaining) => {
  const { error } = await supabase
    .from("loans")
    .update({
      next_payment_date: nextPaymentISO,
      remaining_balance: newRemaining,
    })
    .eq("id", loanId);

  if (error) throw error;
};

const updateLoansAfterPayments = async ({ effectiveRows, activeLoans }) => {
  for (const r of effectiveRows) {
    const loan = activeLoans.find((l) => l.id === r.loan_id);
    if (!loan) continue;

    const prevRemaining = toNumber(computeInitialRemaining(loan));
    const paid = toNumber(r.amount);
    const newRemaining = Math.max(0, prevRemaining - paid);

    if (newRemaining === 0) {
      await updateLoanCompleted(r.loan_id, r.date);
      continue;
    }

    const nextPaymentISO = computeNextPaymentDate(loan, r.date);
    await updateLoanActive(r.loan_id, nextPaymentISO, newRemaining);
  }
};
/* ========================================================= */

/* =================== Componente =================== */
export default function BulkPaymentDialog({ open, onOpenChange }) {
  const { loans = [], clients = [], refreshData } = useData();

  // Sólo préstamos activos
  const activeLoans = useMemo(
    () => (loans || []).filter((l) => String(l.status || "").toLowerCase() === "active"),
    [loans]
  );

  // 10 filas por defecto
  const defaultISO = toISODate(new Date());
  const makeEmptyRow = () => ({
    // 👇 ahora este campo será donde el usuario escribe el ID del préstamo
    loan_input: "",
    client_id: "",
    loan_id: null,
    client_name: "",
    weekly_suggested: "",
    amount: "",
    date: defaultISO, // ISO para backend
    dateInput: toDisplayDDMMYYYY(defaultISO), // dd/mm/aaaa visible
    remaining_balance: null,
    valid: false,
    touched: false,
  });

  const [rows, setRows] = useState(Array.from({ length: 10 }, () => makeEmptyRow()));
  const [globalDateISO, setGlobalDateISO] = useState(defaultISO);
  const [globalDateInput, setGlobalDateInput] = useState(toDisplayDDMMYYYY(defaultISO));
  const [submitting, setSubmitting] = useState(false);

  const setRow = (idx, patch) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Autocarga usando ID de PRÉSTAMO en lugar de ID de cliente
  const handleClientIdBlur = (idx) => {
    setRows((prev) => {
      const r = { ...prev[idx] };

      // 👉 ahora se toma lo que el usuario escribe como ID de préstamo
      const typed = String(r.loan_input || "").trim();
      if (!typed) return prev;

      // Buscar el préstamo activo por ID
      const loan = activeLoans.find((l) => String(l.id) === typed);
      const client = loan ? clients.find((c) => String(c.id) === String(loan.client_id)) : null;

      if (!loan || !client) {
        Object.assign(r, {
          loan_id: null,
          client_id: "",
          client_name: "",
          weekly_suggested: "",
          remaining_balance: null,
          valid: false,
        });
      } else {
        r.loan_id = loan.id;
        r.client_id = client.id; // se guarda el ID real del cliente para el insert
        r.client_name = loan.client_name || client.name || `(Cliente #${client.id})`;

        const suggested = toNumber(loan.weekly_payment || 0);
        r.weekly_suggested = suggested || "";
        if (!r.amount && suggested) r.amount = suggested;
        r.remaining_balance = computeInitialRemaining(loan);

        if (!r.date) {
          r.date = globalDateISO;
          r.dateInput = toDisplayDDMMYYYY(globalDateISO);
        }
        r.valid = true;
      }

      r.touched = true;
      const nx = [...prev];
      nx[idx] = r;
      return nx;
    });
  };

  const handleAmountChange = (idx, val) => setRow(idx, { amount: val });

  // Fecha por texto
  const handleDateTextChange = (idx, val) => setRow(idx, { dateInput: val });

  const handleDateBlur = (idx) =>
    setRows((prev) => {
      const r = { ...prev[idx] };
      const iso = toISOFromFlexible(r.dateInput);
      if (iso) {
        r.date = iso;
        r.dateInput = toDisplayDDMMYYYY(iso);
      }
      const nx = [...prev];
      nx[idx] = r;
      return nx;
    });

  // Fecha por selector nativo
  const handleRowNativeDate = (idx, isoVal) =>
    setRows((prev) => {
      const r = { ...prev[idx] };
      const iso = toISOFromFlexible(isoVal);
      if (iso) {
        r.date = iso;
        r.dateInput = toDisplayDDMMYYYY(iso);
      }
      const nx = [...prev];
      nx[idx] = r;
      return nx;
    });

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow()]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const effectiveRows = rows.filter((r) => r.valid && r.loan_id && toNumber(r.amount) > 0 && r.date);
  const totalAmount = effectiveRows.reduce((s, r) => s + toNumber(r.amount), 0);

  // Aplica fecha global a TODAS las filas
  const handleApplyGlobalDate = () =>
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        date: globalDateISO,
        dateInput: toDisplayDDMMYYYY(globalDateISO),
      }))
    );

  // Global por texto / selector
  const handleGlobalDateChange = (val) => setGlobalDateInput(val);

  const handleGlobalDateBlur = () => {
    const iso = toISOFromFlexible(globalDateInput);
    if (iso) {
      setGlobalDateISO(iso);
      setGlobalDateInput(toDisplayDDMMYYYY(iso));
    }
  };

  const handleGlobalNativeDate = (isoVal) => {
    const iso = toISOFromFlexible(isoVal);
    if (iso) {
      setGlobalDateISO(iso);
      setGlobalDateInput(toDisplayDDMMYYYY(iso));
    }
  };

  /* ================= Submit con SEMANAS (Refactor) ================= */
  const handleSubmit = async () => {
    if (effectiveRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Nada para registrar",
        description: "Captura al menos un pago válido (ID cliente, monto y fecha).",
      });
      return;
    }

    setSubmitting(true);

    try {
      const byLoan = groupRowsByLoanId(effectiveRows);
      const loanIds = Array.from(byLoan.keys());

      const payData = await fetchExistingPayments(loanIds);

      const { weekByRow, noWeeks } = assignWeeksForAllLoans({
        loanIds,
        byLoan,
        payData,
        activeLoans,
      });

      if (noWeeks.length > 0) {
        throw new Error(`No hay semanas disponibles para:\n• ${noWeeks.join("\n• ")}`);
      }

      const rowsToInsert = buildRowsToInsert(effectiveRows, weekByRow);
      await insertPayments(rowsToInsert);

      await updateLoansAfterPayments({ effectiveRows, activeLoans });

      toast({
        title: "Pagos registrados",
        description: `Se registraron ${effectiveRows.length} pagos por $${Number(
          totalAmount || 0
        ).toLocaleString("es-MX")}.`,
      });

      await refreshData?.();
      setRows((prev) => prev.map(() => makeEmptyRow()));
      onOpenChange?.(false);
    } catch (err) {
      console.error("Bulk grid payment error:", err);
      toast({
        variant: "destructive",
        title: "Error al registrar pagos",
        description: err?.message || "Intenta nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ====================== UI ====================== */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[98vw] h-[92vh] p-0 sm:rounded-xl overflow-y-auto">
        <div className="flex flex-col h-full">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Captura masiva de pagos</DialogTitle>
            <DialogDescription>
              Escribe el <b>ID del cliente</b>, el <b>abono semanal</b> y la{" "}
              <b>fecha de pago</b>. Puedes <b>teclear</b> la fecha (dd/mm/aaaa) o{" "}
              <b>seleccionarla</b> con el calendario.
            </DialogDescription>
          </DialogHeader>

          {/* Barra superior */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Fecha global (dd/mm/aaaa o selector)</Label>
                <div className="relative">
                  <Input
                    placeholder="dd/mm/aaaa"
                    value={globalDateInput}
                    onChange={(e) => handleGlobalDateChange(e.target.value)}
                    onBlur={handleGlobalDateBlur}
                    className="pr-10"
                  />
                  <CalendarIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none opacity-70" />
                  <input
                    type="date"
                    value={globalDateISO}
                    onChange={(e) => handleGlobalNativeDate(e.target.value)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 opacity-0 cursor-pointer"
                    aria-label="Abrir calendario"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={handleApplyGlobalDate}>
                    Aplicar a todas las filas
                  </Button>
                  <Button type="button" variant="outline" onClick={addRow}>
                    <Plus className="h-4 w-4 mr-1" /> Agregar fila
                  </Button>
                </div>
              </div>

              <div className="sm:col-span-2 flex items-end justify-end gap-4">
                <div className="text-sm">
                  <div>
                    <b>Filas válidas:</b> {rows.filter((r) => r.valid && r.loan_id).length} /{" "}
                    {rows.length}
                  </div>
                  <div>
                    <b>Total a cobrar:</b> ${Number(totalAmount || 0).toLocaleString("es-MX")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t">
            <div className="min-w-full">
              <div className="grid grid-cols-12 gap-2 px-5 py-3 text-xs font-semibold uppercase text-muted-foreground">
                <div className="col-span-2">ID cliente</div>
                <div className="col-span-5">Nombre (auto)</div>
                <div className="col-span-2">Abono semanal</div>
                <div className="col-span-2">Fecha de pago (dd/mm/aaaa)</div>
                <div className="col-span-1 text-center">Acciones</div>
              </div>

              {rows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-5 py-2 items-center border-t">
                  {/* ID cliente (pero ahora se captura ID de PRÉSTAMO) */}
                  <div className="col-span-2">
                    <Input
                      placeholder="Ej. 1023"
                      value={r.loan_input}
                      onChange={(e) => setRow(idx, { loan_input: e.target.value })}
                      onBlur={() => handleClientIdBlur(idx)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {r.loan_id
                        ? `Préstamo #${r.loan_id}`
                        : r.touched && !r.client_name
                        ? "Cliente / préstamo no encontrado"
                        : ""}
                    </p>
                  </div>

                  {/* Nombre */}
                  <div className="col-span-5">
                    <Input value={r.client_name} disabled placeholder="Nombre del cliente" />
                    {r.remaining_balance != null && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Saldo: ${toNumber(r.remaining_balance).toLocaleString("es-MX")} · Sugerido: $
                        {toNumber(r.weekly_suggested || 0).toLocaleString("es-MX")}
                      </p>
                    )}
                  </div>

                  {/* Abono semanal */}
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      value={r.amount}
                      onChange={(e) => handleAmountChange(idx, e.target.value)}
                    />
                  </div>

                  {/* Fecha */}
                  <div className="col-span-2">
                    <div className="relative">
                      <Input
                        placeholder="dd/mm/aaaa"
                        value={r.dateInput}
                        onChange={(e) => handleDateTextChange(idx, e.target.value)}
                        onBlur={() => handleDateBlur(idx)}
                        className="pr-10"
                      />
                      <CalendarIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none opacity-70" />
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => handleRowNativeDate(idx, e.target.value)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 opacity-0 cursor-pointer"
                        aria-label="Abrir calendario"
                      />
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="col-span-1 flex justify-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeRow(idx)}
                      title="Eliminar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-5 gap-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || effectiveRows.length === 0}>
              {submitting ? "Registrando…" : "Registrar pagos"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
s