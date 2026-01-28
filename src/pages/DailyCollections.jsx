// src/pages/DailyCollections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/lib/customSupabaseClient";

const toStr = (v) => (v == null ? "" : String(v)).trim();
const fmtMoney = (n) =>
  typeof n === "number"
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
    : "$0";

const startOfDayISO = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const nextDayISO = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const isPaidStatus = (status) => {
  const st = String(status || "").toLowerCase();
  return st === "paid" || st === "pagado";
};

const paymentIsOnDate = (p, fecha) => {
  const d = (p.payment_date || "").slice(0, 10);
  return d === fecha;
};

const sortAlpha = (a, b) => a.localeCompare(b);

const getClientsInTown = ({ clients, poblacion, ruta }) => {
  let list = (clients || []).filter((c) => toStr(c.poblacion) === toStr(poblacion));
  if (ruta) list = list.filter((c) => toStr(c.ruta) === toStr(ruta));
  return list;
};

const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort(sortAlpha);

const buildCatalogsFrom = ({ clients, loans, poblacion }) => {
  const source = poblacion
    ? (clients || []).filter((c) => toStr(c.poblacion) === toStr(poblacion))
    : [];

  const rutasArr = uniqSorted(source.map((c) => toStr(c.ruta)));

  // grupos: actuales (clients) + históricos (loans de esos clients)
  const setG = new Set(source.map((c) => toStr(c.grupo)).filter(Boolean));
  const sourceIds = new Set(source.map((c) => c.id));

  for (const l of loans || []) {
    if (sourceIds.has(l.client_id)) {
      const lg = toStr(l.grupo);
      if (lg) setG.add(lg);
    }
  }

  const gruposArr = Array.from(setG).sort(sortAlpha);
  return { source, rutasArr, gruposArr };
};

const getLoansForClientsLocal = ({ loans, clientIds }) =>
  (loans || []).filter((l) => clientIds.includes(l.client_id));

const fetchLoansForClients = async (clientIds) => {
  const { data } = await supabase.from("loans").select("*").in("client_id", clientIds);
  return data || [];
};

const filterLoansByGrupo = ({ loans, grupo }) => {
  if (!grupo) return loans;
  const g = toStr(grupo);
  return (loans || []).filter((l) => toStr(l.grupo) === g);
};

const getPaidPaymentsLocal = ({ payments, loanIds, fecha }) =>
  (payments || []).filter((p) => {
    if (!loanIds.includes(p.loan_id)) return false;
    if (!isPaidStatus(p.status)) return false;
    return paymentIsOnDate(p, fecha);
  });

const fetchPaidPaymentsForDay = async ({ loanIds, fecha }) => {
  const { data } = await supabase
    .from("payments")
    .select("id, loan_id, amount, payment_date, status, week, created_at")
    .in("loan_id", loanIds)
    .gte("payment_date", startOfDayISO(fecha))
    .lt("payment_date", nextDayISO(fecha));

  return (data || []).filter((p) => isPaidStatus(p.status));
};

const groupPaymentsByClient = ({ pagos, loansInTown, clientsInTown }) => {
  const loanById = new Map((loansInTown || []).map((l) => [l.id, l]));
  const clientById = new Map((clientsInTown || []).map((c) => [c.id, c]));

  const byClient = new Map();

  for (const p of pagos || []) {
    const loan = loanById.get(p.loan_id);
    if (!loan) continue;

    const client = clientById.get(loan.client_id);
    if (!client) continue;

    const key = loan.client_id;

    if (!byClient.has(key)) {
      byClient.set(key, {
        client_id: loan.client_id,
        cliente: client.name || client.nombre || "(Sin nombre)",
        poblacion: toStr(client.poblacion),
        telefono: client.phone || client.telefono || "",
        totalCliente: 0,
        pagos: [],
      });
    }

    const bucket = byClient.get(key);
    bucket.totalCliente += Number(p.amount || 0);
    bucket.pagos.push({
      id: p.id,
      loan_id: p.loan_id,
      week: p.week || null,
      amount: Number(p.amount || 0),
    });
  }

  const groupedRows = Array.from(byClient.values()).sort((a, b) =>
    a.cliente.localeCompare(b.cliente)
  );
  const grandTotal = groupedRows.reduce((acc, r) => acc + r.totalCliente, 0);

  return { groupedRows, grandTotal };
};

export default function DailyCollections() {
  const { clients = [], loans = [], payments = [], loading: dataLoading } = useData() || {};

  // Catálogos
  const [poblaciones, setPoblaciones] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [grupos, setGrupos] = useState([]);

  // Filtros
  const [poblacion, setPoblacion] = useState("");
  const [ruta, setRuta] = useState("");
  const [grupo, setGrupo] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));

  // Estado de tabla
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // agrupado por cliente
  const [totalDia, setTotalDia] = useState(0);

  // 1) Catálogo de poblaciones desde clients
  useEffect(() => {
    const pobArr = uniqSorted((clients || []).map((c) => toStr(c.poblacion)));
    setPoblaciones(pobArr);
  }, [clients]);

  // 2) Catálogos de rutas y grupos dependientes de la población seleccionada
  useEffect(() => {
    const { rutasArr, gruposArr } = buildCatalogsFrom({ clients, loans, poblacion });

    setRutas(rutasArr);
    setGrupos(gruposArr);

    if (ruta && !rutasArr.includes(ruta)) setRuta("");
    if (grupo && !gruposArr.includes(grupo)) setGrupo("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poblacion, clients, loans]);

  const clearReport = useCallback(() => {
    setRows([]);
    setTotalDia(0);
  }, []);

  const buildReport = useCallback(async () => {
    if (!poblacion || !fecha) {
      clearReport();
      return;
    }

    setLoading(true);

    try {
      // 1) clientes
      const clientsInTown = getClientsInTown({ clients, poblacion, ruta });
      const clientIds = clientsInTown.map((c) => c.id);

      if (!clientIds.length) {
        clearReport();
        return;
      }

      // 2) loans (local -> fallback supabase)
      let loansInTown = getLoansForClientsLocal({ loans, clientIds });
      if (!loansInTown.length) loansInTown = await fetchLoansForClients(clientIds);

      loansInTown = filterLoansByGrupo({ loans: loansInTown, grupo });

      const loanIds = (loansInTown || []).map((l) => l.id);
      if (!loanIds.length) {
        clearReport();
        return;
      }

      // 3) pagos (local -> fallback supabase)
      let pagos = getPaidPaymentsLocal({ payments, loanIds, fecha });
      if (!pagos.length) pagos = await fetchPaidPaymentsForDay({ loanIds, fecha });

      if (!pagos.length) {
        clearReport();
        return;
      }

      // 4) agrupar
      const { groupedRows, grandTotal } = groupPaymentsByClient({
        pagos,
        loansInTown,
        clientsInTown,
      });

      setRows(groupedRows);
      setTotalDia(grandTotal);
    } catch (e) {
      console.error("DailyCollections error:", e);
      clearReport();
    } finally {
      setLoading(false);
    }
  }, [poblacion, ruta, grupo, fecha, clients, loans, payments, clearReport]);

  // 3) Recalcular al cambiar filtros
  useEffect(() => {
    buildReport();
  }, [buildReport]);

  const summary = useMemo(
    () => ({
      clientes: rows.length,
      total: totalDia,
    }),
    [rows, totalDia]
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Corte de Cobranza Diario</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="col-span-1">
          <label className="block text-sm mb-1">Población</label>
          <select
            className="w-full border rounded-md px-3 py-2"
            value={poblacion}
            onChange={(e) => setPoblacion(e.target.value)}
            disabled={dataLoading}
          >
            <option value="">Seleccionar…</option>
            {poblaciones.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1">
          <label className="block text-sm mb-1">Ruta</label>
          <select
            className="w-full border rounded-md px-3 py-2"
            value={ruta}
            onChange={(e) => setRuta(e.target.value)}
            disabled={!poblacion || dataLoading || rutas.length === 0}
          >
            <option value="">Todas</option>
            {rutas.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1">
          <label className="block text-sm mb-1">Grupo</label>
          <select
            className="w-full border rounded-md px-3 py-2"
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            disabled={!poblacion || dataLoading || grupos.length === 0}
          >
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1">
          <label className="block text-sm mb-1">Fecha</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      {/* Resumen */}
      <div className="mb-3 text-sm">
        <span className="mr-4">
          <b>Clientes con pago:</b> {summary.clientes}
        </span>
        <span>
          <b>Total del día:</b> {fmtMoney(summary.total)}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-auto border rounded-lg">
        <table className="min-w-[800px] w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">#</th>
              <th className="p-2 border">Cliente</th>
              <th className="p-2 border">Teléfono</th>
              <th className="p-2 border">Población</th>
              <th className="p-2 border">Pagos (detalle)</th>
              <th className="p-2 border text-right">Total Cliente</th>
            </tr>
          </thead>
          <tbody>
            {(loading || dataLoading) && (
              <tr>
                <td className="p-3 border text-center" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            )}

            {!loading && !dataLoading && rows.length === 0 && (
              <tr>
                <td className="p-3 border text-center" colSpan={6}>
                  Sin pagos para los filtros seleccionados.
                </td>
              </tr>
            )}

            {!loading &&
              !dataLoading &&
              rows.map((r, idx) => (
                <tr key={r.client_id}>
                  <td className="p-2 border text-center">{idx + 1}</td>
                  <td className="p-2 border">{r.cliente}</td>
                  <td className="p-2 border">{r.telefono || "—"}</td>
                  <td className="p-2 border">{r.poblacion}</td>
                  <td className="p-2 border">
                    {r.pagos.length ? (
                      <ul className="flex flex-wrap gap-2">
                        {r.pagos.map((p) => (
                          <li
                            key={p.id || `${r.client_id}-${p.loan_id}-${p.week}-${p.amount}`}
                            className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700"
                          >
                            #{p.loan_id}
                            {p.week ? ` · Sem ${p.week}` : ""} · {fmtMoney(p.amount)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 border text-right font-medium">
                    {fmtMoney(r.totalCliente)}
                  </td>
                </tr>
              ))}

            {/* Fila total */}
            {!loading && !dataLoading && rows.length > 0 && (
              <tr className="bg-gray-50">
                <td className="p-2 border text-right" colSpan={5}>
                  <b>Total recaudado:</b>
                </td>
                <td className="p-2 border text-right font-semibold">
                  {fmtMoney(totalDia)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Se muestran pagos con estado <b>Pagado</b> del día seleccionado, para la población elegida
        {ruta ? `, ruta ${ruta}` : ""}
        {grupo ? `, grupo ${grupo}` : ""}.
      </p>
    </div>
  );
}
