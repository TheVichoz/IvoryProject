// src/pages/DailyCollections.jsx
import React, { useEffect, useMemo, useState } from "react";
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
    const setCat = new Set();
    for (const c of clients) {
      const p = toStr(c.poblacion);
      if (p) setCat.add(p);
    }
    setPoblaciones(Array.from(setCat).sort((a, b) => a.localeCompare(b)));
  }, [clients]);

  // 2) Catálogos de rutas y grupos dependientes de la población seleccionada
  useEffect(() => {
    // Base: solo por población (igual que antes), pero ahora
    // "grupos" incluye también los grupos históricos de loans de esos clientes.
    const source = poblacion
      ? clients.filter((c) => toStr(c.poblacion) === poblacion)
      : [];

    // Rutas desde clientes
    const setR = new Set();
    for (const c of source) {
      const r = toStr(c.ruta);
      if (r) setR.add(r);
    }
    const rutasArr = Array.from(setR).sort((a, b) => a.localeCompare(b));
    setRutas(rutasArr);

    if (ruta && !rutasArr.includes(ruta)) setRuta("");

    // Grupos = unión de grupos actuales (clientes) + grupos históricos de loans
    const setG = new Set();
    for (const c of source) {
      const g = toStr(c.grupo);
      if (g) setG.add(g);
    }
    const sourceIds = new Set(source.map((c) => c.id));
    for (const l of loans || []) {
      if (sourceIds.has(l.client_id)) {
        const lg = toStr(l.grupo);
        if (lg) setG.add(lg);
      }
    }
    const gruposArr = Array.from(setG).sort((a, b) => a.localeCompare(b));
    setGrupos(gruposArr);

    if (grupo && !gruposArr.includes(grupo)) setGrupo("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poblacion, ruta, clients, loans]);

  // 3) Recalcular al cambiar filtros
  useEffect(() => {
    if (!poblacion || !fecha) {
      setRows([]);
      setTotalDia(0);
      return;
    }
    buildReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poblacion, ruta, grupo, fecha, clients, loans, payments]);

  async function buildReport() {
    setLoading(true);
    try {
      // 1) Clientes de esa población (y opcionalmente ruta)
      let clientsInTown = clients.filter((c) => toStr(c.poblacion) === poblacion);
      if (ruta) {
        clientsInTown = clientsInTown.filter((c) => toStr(c.ruta) === ruta);
      }
      const clientIds = clientsInTown.map((c) => c.id);
      if (!clientIds.length) {
        setRows([]);
        setTotalDia(0);
        setLoading(false);
        return;
      }

      // 2) Loans de esos clientes
      let loansInTown = loans.filter((l) => clientIds.includes(l.client_id));
      if (!loansInTown.length) {
        const { data: supLoans } = await supabase
          .from("loans")
          .select("*")
          .in("client_id", clientIds);
        loansInTown = supLoans || [];
      }

      // *** Cambio clave:
      // Si hay filtro de "grupo", filtrar por el grupo del PRÉSTAMO (loan.grupo),
      // no por el grupo actual del cliente.
      if (grupo) {
        loansInTown = loansInTown.filter((l) => toStr(l.grupo) === toStr(grupo));
      }

      const loanIds = loansInTown.map((l) => l.id);
      if (!loanIds.length) {
        setRows([]);
        setTotalDia(0);
        setLoading(false);
        return;
      }

      // 3) Pagos "paid" de ese día para esos loans
      const pagosLocal = (payments || []).filter((p) => {
        if (!loanIds.includes(p.loan_id)) return false;
        const st = (p.status || "").toLowerCase();
        if (!(st === "paid" || st === "pagado")) return false;
        // comparar por día (YYYY-MM-DD)
        const d = (p.payment_date || "").slice(0, 10);
        return d === fecha;
      });

      let pagos = pagosLocal;
      if (!pagos.length) {
        const { data: supPays } = await supabase
          .from("payments")
          .select("id, loan_id, amount, payment_date, status, week, created_at")
          .in("loan_id", loanIds)
          .gte("payment_date", startOfDayISO(fecha))
          .lt("payment_date", nextDayISO(fecha));
        pagos = (supPays || []).filter((p) => {
          const st = (p.status || "").toLowerCase();
          return st === "paid" || st === "pagado";
        });
      }

      if (!pagos.length) {
        setRows([]);
        setTotalDia(0);
        setLoading(false);
        return;
      }

      // 4) Índices de apoyo
      const loanById = new Map(loansInTown.map((l) => [l.id, l]));
      const clientById = new Map(clientsInTown.map((c) => [c.id, c]));

      // 5) Agrupar por cliente (suma por día)
      const byClient = new Map();
      for (const p of pagos) {
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
            pagos: [], // detalle de pagos del día
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

      setRows(groupedRows);
      setTotalDia(grandTotal);
    } catch (e) {
      console.error("DailyCollections error:", e);
      setRows([]);
      setTotalDia(0);
    } finally {
      setLoading(false);
    }
  }

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
        {ruta ? `, ruta ${ruta}` : ""}{grupo ? `, grupo ${grupo}` : ""}.
      </p>
    </div>
  );
}
