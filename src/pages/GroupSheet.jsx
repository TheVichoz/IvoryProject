// src/pages/GroupSheet.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/lib/customSupabaseClient";
import { parseTermWeeks, calcWeeklyPayment } from "@/lib/loanUtils";
import { TrendingUp } from "lucide-react";
import fincenLogoUrl from "@/assets/Logo-Azul-CIelo.png?url";

const TOTAL_WEEKS = 15;

const toStr = (v) => (v == null ? "" : String(v)).trim();

/* =========================
   FIX fechas: parser local
   (Sonar: usar RegExp.exec() en vez de String.match)
========================= */
const parseLocalDate = (v) => {
  if (!v) return null;

  if (typeof v === "string") {
    const re = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = re.exec(v); // ✅ exec()
    if (m) {
      const [, Y, M, D] = m;
      return new Date(Number(Y), Number(M) - 1, Number(D), 12, 0, 0, 0);
    }
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(12, 0, 0, 0);
  return d;
};

const addDays = (dateLike, days) => {
  const d = parseLocalDate(dateLike);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d;
};

const fmt = (dLike) => {
  const x = parseLocalDate(dLike);
  if (!x) return "";
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yyyy = x.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const toDateInput = (dLike) => {
  const x = parseLocalDate(dLike);
  if (!x) return "";
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* ===== Normalización de texto multilínea para evitar huecos =====
   (ESLint: prefer replaceAll cuando aplica)
*/
const normalizeMultiline = (s) =>
  toStr(s)
    .replaceAll("\r\n", "\n") // ✅ replaceAll
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

const joinLines = (...parts) =>
  parts
    .map((p) => (typeof p === "string" ? p : toStr(p)))
    .map(normalizeMultiline)
    .filter(Boolean)
    .join("\n");

function normalizeLoanRow(l) {
  const weeks = parseTermWeeks(l?.term, 14);
  let weekly = Number(l?.weekly_payment || 0);

  if (!weekly) {
    weekly = calcWeeklyPayment({
      amount: l?.amount,
      interest_rate: l?.interest_rate,
      term_weeks: weeks,
      mode: "flat",
      round: "peso",
    }).weekly;
  }

  return {
    id: l?.id,
    client_id: l?.client_id,
    amount: Number(l?.amount || 0),
    interest_rate: Number(l?.interest_rate || 0),
    weeks,
    weekly_payment: weekly,
    start: l?.start_date || l?.created_at || null,
    created: l?.created_at || null,
    status: l?.status || "active",
  };
}

const formatGuarantee = (g) => [g.marca, g.modelo].filter(Boolean).join(" ").trim();

/* ==============================
   Logo FINCEN desde assets
============================== */
function FincenLogo() {
  return <img src={fincenLogoUrl} alt="Fincen" className="brand-logo" draggable={false} />;
}

/* ==============================
   Helpers de catálogos
============================== */
const uniqSorted = (arr) =>
  Array.from(new Set((arr || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const getPoblacionesFromClients = (clients) => uniqSorted((clients || []).map((c) => toStr(c.poblacion)));

const getSourceClientsByPoblacion = (clients, poblacion) =>
  poblacion ? (clients || []).filter((c) => toStr(c.poblacion) === toStr(poblacion)) : [];

const getRutasFromSource = (source) => uniqSorted(source.map((c) => toStr(c.ruta)));

const getGruposFromSourceClientsOnly = (source) => uniqSorted(source.map((c) => toStr(c.grupo)));

/* ==============================
   Helpers de datos (loans/avales/guarantees)
============================== */
const filterClientsForSheet = (clients, poblacion, ruta) => {
  let list = (clients || []).filter((c) => toStr(c.poblacion) === toStr(poblacion));
  if (ruta) list = list.filter((c) => toStr(c.ruta) === toStr(ruta));
  return list;
};

const getLoansLocalForClientIds = (loans, clientIds) => (loans || []).filter((l) => clientIds.includes(l.client_id));

const fetchLoansForClientIds = async (clientIds) => {
  const { data } = await supabase.from("loans").select("*").in("client_id", clientIds);
  return data || [];
};

const ensureLoansForClientIds = async ({ loans, clientIds }) => {
  const local = getLoansLocalForClientIds(loans, clientIds);
  if (local.length) return local;
  return fetchLoansForClientIds(clientIds);
};

const scoreLoan = (loan) => {
  const nl = normalizeLoanRow(loan);
  const activeBoost = String(nl.status || "").toLowerCase() === "active" ? 2 : 1;
  const t = new Date(nl.created || nl.start || 0).getTime();
  return activeBoost * 1e12 + t;
};

const pickBestLoanPerClient = (allLoans) => {
  const byClient = new Map();

  for (const l of allLoans || []) {
    const cur = byClient.get(l.client_id);
    if (!cur) {
      byClient.set(l.client_id, l);
      continue;
    }
    if (scoreLoan(l) > scoreLoan(cur)) byClient.set(l.client_id, l);
  }

  return Array.from(byClient.values());
};

const filterLoansByClientGrupo = ({ allLoans, clientsById, grupo }) => {
  const g = toStr(grupo);
  return (allLoans || []).filter((l) => {
    const c = clientsById.get(l.client_id);
    if (!c) return false;
    return toStr(c.grupo) === g;
  });
};

const keepOnlyActiveLoans = (loansList) => (loansList || []).filter((l) => toStr(l?.status).toLowerCase() === "active");

const filterLoansByStartDateS1 = ({ loansList, startDate }) => {
  const s1 = startDate ? toDateInput(startDate) : "";
  if (!s1) return loansList || [];
  return (loansList || []).filter((l) => {
    const loanS1 = toDateInput(l?.start_date || l?.created_at);
    return loanS1 === s1;
  });
};

const pickMostRecentLoanPerClient = (loansList) => {
  const byClient = new Map();

  for (const l of loansList || []) {
    const nl = normalizeLoanRow(l);
    const t = new Date(nl.start || nl.created || 0).getTime();

    const cur = byClient.get(l.client_id);
    if (!cur) {
      byClient.set(l.client_id, l);
      continue;
    }

    const curNL = normalizeLoanRow(cur);
    const curT = new Date(curNL.start || curNL.created || 0).getTime();

    if (t > curT) byClient.set(l.client_id, l);
  }

  return Array.from(byClient.values());
};

const selectLoansToShow = ({ allLoans, groupClients, grupo, startDate }) => {
  const clientsById = new Map((groupClients || []).map((c) => [c.id, c]));

  if (!grupo) return pickBestLoanPerClient(allLoans);

  let loansToShow = filterLoansByClientGrupo({ allLoans, clientsById, grupo });
  loansToShow = keepOnlyActiveLoans(loansToShow);
  loansToShow = filterLoansByStartDateS1({ loansList: loansToShow, startDate });
  loansToShow = pickMostRecentLoanPerClient(loansToShow);

  return loansToShow;
};

const getDefaultStartDateFromLoans = (loansToShow) => {
  const sorted = (loansToShow || [])
    .map((x) => x.start_date || x.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b));
  return sorted[0] || "";
};

const fetchAvalesMap = async (clientIds) => {
  const { data } = await supabase
    .from("avales")
    .select("client_id, nombre, direccion, telefono")
    .in("client_id", clientIds);

  const map = {};
  for (const a of data || []) map[a.client_id] = a;
  return map;
};

const buildGuaranteesMapFromSets = (setsMap) => {
  const out = {};
  for (const [cid, set] of Object.entries(setsMap)) out[cid] = set;
  return out;
};

const fetchGuaranteesMap = async ({ clientIds, loansToShow }) => {
  const selectedLoanIds = (loansToShow || []).map((l) => l.id);

  const [gByClientRes, gByLoanRes] = await Promise.all([
    supabase
      .from("guarantees")
      .select("id, client_id, marca, modelo, no_serie, descripcion")
      .in("client_id", clientIds),
    selectedLoanIds.length
      ? supabase
          .from("guarantees")
          .select("id, loan_id, marca, modelo, no_serie, descripcion")
          .in("loan_id", selectedLoanIds)
      : Promise.resolve({ data: [] }),
  ]);

  const gByClient = gByClientRes?.data || [];
  const gByLoan = gByLoanRes?.data || [];

  const clientsSetMap = {}; // client_id -> Set()

  const addG = (cid, g) => {
    if (!cid) return;
    const txt = formatGuarantee(g);
    if (!txt) return;

    if (!clientsSetMap[cid]) clientsSetMap[cid] = new Set();
    clientsSetMap[cid].add(txt);
  };

  for (const g of gByClient) addG(g.client_id, g);

  const loanById = new Map((loansToShow || []).map((l) => [l.id, l]));
  for (const g of gByLoan) {
    const loan = loanById.get(g.loan_id);
    if (!loan) continue;
    addG(loan.client_id, g);
  }

  return buildGuaranteesMapFromSets(clientsSetMap);
};

const sortLoansByClientName = (loansToShow, clientsById) => {
  return [...(loansToShow || [])].sort((a, b) => {
    const ca = clientsById.get(a.client_id);
    const cb = clientsById.get(b.client_id);
    return toStr(ca?.name || ca?.nombre).localeCompare(toStr(cb?.name || cb?.nombre));
  });
};

const buildRowForLoan = ({ loan, idx, clientsById, avalesMap, guaranteesMap }) => {
  const c = clientsById.get(loan.client_id);
  if (!c) return null;

  const nl = normalizeLoanRow(loan);
  const aval = avalesMap[c.id] || "";
  const garantias = guaranteesMap[c.id] ? Array.from(guaranteesMap[c.id]).join(" • ") : "";

  const clientPhone = c.phone ?? c.telefono ?? "";
  const dirCliente = joinLines(c.address ?? c.direccion ?? "", clientPhone && `Tel. ${clientPhone}`);

  const avalPhone = aval?.telefono ?? aval?.phone ?? "";
  const dirAval = joinLines(aval?.direccion || "", avalPhone && `Tel. ${avalPhone}`);

  return {
    key: `${loan.id}`,
    no: idx + 1,
    loanId: nl.id,
    clientId: c.id,
    cliente: c.name ?? c.nombre ?? "(Sin nombre)",
    domicilio: dirCliente,
    aval: aval?.nombre || "",
    domicilioAval: dirAval,
    garantias,
    prestamo: nl.amount,
    pagoSemanal: nl.weekly_payment,
    startDate: nl.start || "",
    status: nl.status,
    ruta: toStr(c.ruta),
    poblacion: toStr(c.poblacion),
    grupo: toStr(c.grupo) || toStr(loan.grupo),
  };
};

const applySearchFilter = (rows, search) => {
  const q = toStr(search).toLowerCase();
  if (!q) return rows || [];

  return (rows || []).filter((r) =>
    [
      r.cliente,
      r.domicilio,
      r.aval,
      r.domicilioAval,
      r.garantias,
      r.loanId,
      r.ruta,
      r.poblacion,
      r.grupo,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
};

/* ==============================
   Helpers PDF/Print
============================== */
const FOOTER_TEXT = "Fincen tu crédito seguro";

const drawFooter = (pdf, pageNum, totalPages, pageWidth, pageHeight, margin) => {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const y = pageHeight - 12;
  pdf.text(FOOTER_TEXT, margin, y);
  pdf.text(`${pageNum}/${totalPages}`, pageWidth / 2, y, { align: "center" });
};

const buildPdfFromElement = async ({ el, waitForLogo }) => {
  await waitForLogo();

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: el.scrollWidth,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("l", "pt", "letter");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  const imgHeight = (canvas.height * contentWidth) / canvas.width;
  const totalPages = Math.max(1, Math.ceil(imgHeight / contentHeight));

  pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imgHeight, undefined, "FAST");
  drawFooter(pdf, 1, totalPages, pageWidth, pageHeight, margin);

  for (let p = 2; p <= totalPages; p++) {
    const yOffset = margin - (p - 1) * contentHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, yOffset, contentWidth, imgHeight, undefined, "FAST");
    drawFooter(pdf, p, totalPages, pageWidth, pageHeight, margin);
  }

  return pdf;
};

const buildPdfFilename = ({ startDate, ruta, poblacion }) => {
  const dForName = parseLocalDate(startDate);
  const iso = dForName
    ? `${dForName.getFullYear()}-${String(dForName.getMonth() + 1).padStart(2, "0")}-${String(
        dForName.getDate()
      ).padStart(2, "0")}`
    : "";

  const fname = `hoja-grupo_${ruta || ""}_${poblacion || ""}_${iso}.pdf`;
  return fname.replace(/\s+/g, "_");
};

/* ==============================
   FIX Sonar: evitar nesting profundo
============================== */
const safeDecodeImage = async (img) => {
  try {
    if (img?.decode) await img.decode();
  } catch {
    // ignore
  }
};

const loadImageOnce = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const waitForLogoLoaded = async (src) => {
  const img = await loadImageOnce(src);
  if (!img) return false;
  await safeDecodeImage(img);
  return true;
};

/* ==============================
   Componente principal
============================== */
export default function GroupSheet() {
  const { clients = [], loans = [], loading: dataLoading = false } = useData() || {};

  const [poblaciones, setPoblaciones] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [grupos, setGrupos] = useState([]);

  const [poblacion, setPoblacion] = useState("");
  const [ruta, setRuta] = useState("");
  const [grupo, setGrupo] = useState("");

  const [startDate, setStartDate] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const printRef = useRef(null);

  // Keys estables para columnas semanas (evita "Array index in keys")
  const weekColKeysRef = useRef(null);
  if (!weekColKeysRef.current) {
    const keys = [];
    for (let n = 1; n <= TOTAL_WEEKS; n++) keys.push(`wk-col-${String(n).padStart(2, "0")}`);
    weekColKeysRef.current = keys;
  }

  const waitForLogo = useCallback(() => waitForLogoLoaded(fincenLogoUrl), []);

  const handleDownloadPDF = useCallback(async () => {
    try {
      const el = printRef.current;
      if (!el) return;

      const pdf = await buildPdfFromElement({ el, waitForLogo });
      const fname = buildPdfFilename({ startDate, ruta, poblacion });
      pdf.save(fname);
    } catch (e) {
      console.error("PDF error:", e);
    }
  }, [poblacion, ruta, startDate, waitForLogo]);

  const handlePrint = useCallback(async () => {
    try {
      const el = printRef.current;
      if (!el) return;

      const pdf = await buildPdfFromElement({ el, waitForLogo });
      pdf.autoPrint();
      const url = pdf.output("bloburl");
      window.open(url, "_blank");
    } catch (e) {
      console.error("Print error:", e);
    }
  }, [waitForLogo]);

  const weekHeaders = useMemo(() => {
    if (!startDate) return [];
    return Array.from({ length: TOTAL_WEEKS }, (_, i) => ({
      label: `SEM ${String(i + 1).padStart(2, "0")}`,
      date: fmt(addDays(startDate, (i + 1) * 7)),
      index: i + 1,
    }));
  }, [startDate]);

  // Poblaciones desde clientes
  useEffect(() => {
    setPoblaciones(getPoblacionesFromClients(clients));
  }, [clients]);

  // Rutas y Grupos (solo desde CLIENTES, no desde loans)
  useEffect(() => {
    const source = getSourceClientsByPoblacion(clients, poblacion);

    const rutasArr = getRutasFromSource(source);
    setRutas(rutasArr);
    if (ruta && !rutasArr.includes(ruta)) setRuta("");

    const gruposArr = getGruposFromSourceClientsOnly(source);
    setGrupos(gruposArr);
    if (grupo && !gruposArr.includes(grupo)) setGrupo("");
  }, [poblacion, ruta, grupo, clients]);

  const clearRows = useCallback(() => setRows([]), []);

  const buildRows = useCallback(async () => {
    if (!poblacion) {
      clearRows();
      return;
    }

    setLoading(true);

    try {
      // 1) Clientes por población y (opcional) ruta
      const groupClients = filterClientsForSheet(clients, poblacion, ruta);
      const clientIds = groupClients.map((c) => c.id);

      if (!clientIds.length) {
        clearRows();
        return;
      }

      // 2) Préstamos (local -> fallback supabase)
      const allLoans = await ensureLoansForClientIds({ loans, clientIds });

      // 3) Selección de loans a mostrar
      const loansToShow = selectLoansToShow({ allLoans, groupClients, grupo, startDate });

      // 4) startDate por defecto
      if (!startDate && loansToShow.length) {
        const s = getDefaultStartDateFromLoans(loansToShow);
        if (s) setStartDate(s);
      }

      // 5) Mapas auxiliares
      const clientsById = new Map(groupClients.map((c) => [c.id, c]));
      const [avalesMap, guaranteesMap] = await Promise.all([
        fetchAvalesMap(clientIds),
        fetchGuaranteesMap({ clientIds, loansToShow }),
      ]);

      // 6) Construcción de filas
      const sortedLoans = sortLoansByClientName(loansToShow, clientsById);

      const baseRows = [];
      for (let i = 0; i < sortedLoans.length; i++) {
        const row = buildRowForLoan({
          loan: sortedLoans[i],
          idx: i,
          clientsById,
          avalesMap,
          guaranteesMap,
        });
        if (row) baseRows.push(row);
      }

      // 7) Search
      setRows(applySearchFilter(baseRows, search));
    } catch (e) {
      console.error("GroupSheet error:", e);
      clearRows();
    } finally {
      setLoading(false);
    }
  }, [poblacion, ruta, grupo, startDate, search, clients, loans, clearRows]);

  useEffect(() => {
    buildRows();
  }, [buildRows]);

  const headerInfo = useMemo(() => {
    if (!poblacion) return null;
    return { ruta: ruta || "Todas", poblacion, grupo: grupo || "Todos" };
  }, [poblacion, ruta, grupo]);

  const groupLabel = useMemo(() => (grupo ? `GRUPO ${grupo}` : "GRUPO"), [grupo]);

  const totalPagos = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r?.pagoSemanal) || 0), 0),
    [rows]
  );

  return (
    <div className="p-6 max-w-[1280px] mx-auto">
      <style id="groupSheetStyles">{`
  :root { --left-cols: 30%; --weeks-cols: 70%; --row-h: 150px; }
  @page { size: 11in 8.5in; margin: 0.35in; }

  body, .gs-table, .gs-th, .gs-td, .mini, .micro, .wk-head, .wk-date,
  .sheet-header, .meta-item, .brand-svg text, h1, label, span, b { color: #000 !important; }

  .sheet-wide { width: 2100px; }
  .gs-table { table-layout: fixed; font-size: 12px; border-collapse: collapse; }
  .gs-th, .gs-td { word-wrap: break-word; line-height: 1.05; }
  .gs-th { background: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
  .gs-td, .gs-th { padding: 2px; border-color:#000; }
  .gs-week-th { padding: 0 !important; height: 52px; vertical-align: middle; }
  @media print { .gs-week-th { height: 56px; } }
  .gs-week-td { padding: 0 !important; }
  .mini { font-size: 10.5px; }
  .micro { font-size: 9.5px; }

  .gs-table tbody tr.row-pad { min-height: var(--row-h); }
  .row-pad .cell { min-height: var(--row-h); height: auto; display: block; padding-bottom: 4px; }
  .week-box { border: 0; background: #fff; border-radius: 0; min-height: var(--row-h); height: auto; width: 100%; }

  .wk-head { font-size: 14px; font-weight: 800; line-height: 1.1; margin-top: 4px; }
  .wk-date { font-size: 12px; line-height: 1.05; margin-bottom: 4px; }

  .sheet-header.header-v2 {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 10px 12px; margin-bottom: 8px;
    border: 1px solid #000; border-radius: 0; background: #fff;
  }
  .meta-card { border: 1px solid #000; padding: 8px 10px; min-width: 300px; max-width: 420px; }
  .meta-row { display: grid; grid-template-columns: 110px 1fr; gap: 6px; font-size: 12px; }
  .meta-row b { display: block; }
  .group-pill {
    border: 1px solid #000; background: #fff; padding: 16px 32px;
    font-weight: 800; font-size: 42px; border-radius: 8px; white-space: nowrap;
  }
  .brand-wrap { display:flex; align-items:center; gap:8px; }
  .brand-badge { width: 34px; height: 34px; border-radius: 0; display: none !important; background: #fff; border: 1px solid #000; }

  .gs-table tbody .gs-td .cell { font-size: 16.5px !important; line-height: 1.32 !important; }
  .gs-table tbody .mini       { font-size: 16.5px !important; line-height: 1.32 !important; }
  .gs-table tbody .micro      { font-size: 15.5px !important; line-height: 1.32 !important; }

  .sum-pagos { margin-top: 8px; font-weight: 700; font-size: 18px; color: #000; text-align: center; }
  @media print { .sum-pagos { font-size: 22px; } }

  .sheet-header.header-v2, .sheet-header.header-v2 * { font-size: 20px !important; line-height: 1.3 !important; }
  @media print { .sheet-header.header-v2, .sheet-header.header-v2 * { font-size: 30px !important; line-height: 1.3 !important; } }

  .sheet-header.header-v2 .group-pill { font-size: 30px !important; line-height: 1.05 !important; }
  @media print { .sheet-header.header-v2 .group-pill { font-size: 58px !important; } }

  .brand-logo { height: 85px; width: auto; display: block; }
  @media print { .brand-logo { height: 95px; } }

  @media print {
    :root { --row-h: 2.5cm; }
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet-wide { width: calc(11in - 0.70in); padding-bottom: 2.5cm; }

    .gs-table tbody tr.row-pad { min-height: var(--row-h) !important; }

    .gs-table tbody tr.row-pad > td.gs-td {
      padding: 3px 4px 6px 4px !important;
      box-sizing: border-box;
      vertical-align: top;
    }

    .gs-table tbody tr.row-pad > td.gs-td .cell {
      min-height: calc(var(--row-h) - 8px) !important;
      height: auto !important;
      padding-bottom: 6px;
      display: block;
      line-height: 1.32 !important;
      overflow: visible;
      box-sizing: border-box;
    }

    .gs-table tbody tr.row-pad > td.gs-week-td .week-box {
      min-height: calc(var(--row-h) - 8px) !important;
      height: auto !important;
      width: 100%;
      box-sizing: border-box;
    }

    .gs-table thead .gs-th {
      font-size: 12px !important;
      line-height: 1.1 !important;
      padding: 2px !important;
      border-width: 1px !important;
    }
    .gs-table thead .wk-head { font-size: 14px !important; line-height: 1.2 !important; font-weight: 800 !important; }
    .gs-table thead .wk-date { font-size: 12px !important; line-height: 1.1 !important; }
    .gs-table tbody .gs-td { border-width: 2px !important; }

    .gs-table tbody .gs-td .cell { font-size: 16.5px !important; line-height: 1.32 !important; }
    .gs-table tbody .mini { font-size: 16.5px !important; line-height: 1.32 !important; }
    .gs-table tbody .micro { font-size: 15.5px !important; line-height: 1.32 !important; }
  }
`}</style>

      <div className="flex items-center justify-end mb-4">
        <div className="no-print flex gap-2">
          <button type="button" onClick={handlePrint} className="px-3 py-2 border rounded-md hover:bg-gray-50">
            Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="px-3 py-2 border rounded-md hover:bg-gray-50"
            title="Descargar PDF directo"
          >
            Descargar PDF
          </button>
        </div>
      </div>

      <Filters
        poblaciones={poblaciones}
        rutas={rutas}
        grupos={grupos}
        poblacion={poblacion}
        ruta={ruta}
        grupo={grupo}
        startDate={startDate}
        search={search}
        setPoblacion={setPoblacion}
        setRuta={setRuta}
        setGrupo={setGrupo}
        setStartDate={setStartDate}
        setSearch={setSearch}
        dataLoading={dataLoading}
      />

      <div ref={printRef} className="overflow-auto border rounded-lg sheet-wide" style={{ borderColor: "#000" }}>
        <div className="sheet-header header-v2">
          <div className="meta-card">
            <div className="meta-row">
              <b>Ruta:</b>
              <span>{headerInfo?.ruta || "—"}</span>
            </div>
            <div className="meta-row">
              <b>Población:</b>
              <span>{headerInfo?.poblacion || "—"}</span>
            </div>
            <div className="meta-row">
              <b>Inicio:</b>
              <span>{startDate ? fmt(startDate) : "—"}</span>
            </div>
          </div>

          <div className="group-pill">{groupLabel}</div>

          <div className="brand-wrap">
            <div className="brand-badge">
              <TrendingUp className="h-4 w-4" />
            </div>
            <FincenLogo />
          </div>
        </div>

        <Table
          loading={loading}
          dataLoading={dataLoading}
          rows={rows}
          weekHeaders={weekHeaders}
          weekColKeys={weekColKeysRef.current}
        />

        <div
          className="sum-pagos"
          style={{ marginLeft: "830px", width: "54px", marginTop: "12px", marginBottom: "12px" }}
        >
          Valor ${totalPagos.toLocaleString("es-MX")}
        </div>
      </div>

      <p className="text-xs mt-2" style={{ color: "#000" }}>
        Filtros alineados a <b>Corte de Cobranza Diario</b>: primero elegir Población y opcionalmente Ruta y Grupo.
        Semanas 1–15: pagos.
      </p>
    </div>
  );
}

/* ---------- Subcomponentes ---------- */
function Filters({
  poblaciones,
  rutas,
  grupos,
  poblacion,
  ruta,
  grupo,
  startDate,
  search,
  setPoblacion,
  setRuta,
  setGrupo,
  setStartDate,
  setSearch,
  dataLoading,
}) {
  const poblacionId = "gs-poblacion";
  const rutaId = "gs-ruta";
  const grupoId = "gs-grupo";
  const startDateId = "gs-startDate";
  const searchId = "gs-search";

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 no-print">
      <div className="col-span-1">
        <label htmlFor={poblacionId} className="block text-sm mb-1">
          Población
        </label>
        <select
          id={poblacionId}
          className="w-full border rounded-md px-3 py-2"
          value={poblacion}
          onChange={(e) => setPoblacion(e.target.value)}
          disabled={dataLoading}
        >
          <option value="">Seleccionar…</option>
          {poblaciones.map((p) => (
            <option key={`pob-${p}`} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-1">
        <label htmlFor={rutaId} className="block text-sm mb-1">
          Ruta
        </label>
        <select
          id={rutaId}
          className="w-full border rounded-md px-3 py-2"
          value={ruta}
          onChange={(e) => setRuta(e.target.value)}
          disabled={!poblacion || dataLoading || rutas.length === 0}
        >
          <option value="">Todas</option>
          {rutas.map((r) => (
            <option key={`ruta-${r}`} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-1">
        <label htmlFor={grupoId} className="block text-sm mb-1">
          Grupo
        </label>
        <select
          id={grupoId}
          className="w-full border rounded-md px-3 py-2"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          disabled={!poblacion || dataLoading || grupos.length === 0}
        >
          <option value="">Todos</option>
          {grupos.map((g) => (
            <option key={`grp-${g}`} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-1">
        <label htmlFor={startDateId} className="block text-sm mb-1">
          Fecha inicio (S1)
        </label>
        <input
          id={startDateId}
          type="date"
          className="w-full border rounded-md px-3 py-2"
          value={startDate ? toDateInput(startDate) : ""}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={!poblacion}
        />
      </div>

      <div className="col-span-1">
        <label htmlFor={searchId} className="block text-sm mb-1">
          Buscar
        </label>
        <input
          id={searchId}
          className="w-full border rounded-md px-3 py-2"
          placeholder="cliente, aval, dirección…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!poblacion}
        />
      </div>
    </div>
  );
}

Filters.propTypes = {
  poblaciones: PropTypes.arrayOf(PropTypes.string).isRequired,
  rutas: PropTypes.arrayOf(PropTypes.string).isRequired,
  grupos: PropTypes.arrayOf(PropTypes.string).isRequired,
  poblacion: PropTypes.string.isRequired,
  ruta: PropTypes.string.isRequired,
  grupo: PropTypes.string.isRequired,
  startDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
  search: PropTypes.string.isRequired,
  setPoblacion: PropTypes.func.isRequired,
  setRuta: PropTypes.func.isRequired,
  setGrupo: PropTypes.func.isRequired,
  setStartDate: PropTypes.func.isRequired,
  setSearch: PropTypes.func.isRequired,
  dataLoading: PropTypes.bool.isRequired,
};

/* ==============================
   Refactor Table (reduce nesting)
============================== */
function WeekHeaderCell({ w }) {
  return (
    <th className="gs-th gs-week-th border text-center">
      <div className="wk-head">{w.label}</div>
      <div className="wk-date">{w.date}</div>
    </th>
  );
}

WeekHeaderCell.propTypes = {
  w: PropTypes.shape({
    label: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    index: PropTypes.number.isRequired,
  }).isRequired,
};

function WeekEmptyCells({ weekHeaders }) {
  return weekHeaders.map((w) => (
    <td key={`wk-empty-${w.index}`} className="gs-td gs-week-td border align-top">
      <div className="week-box" />
    </td>
  ));
}

WeekEmptyCells.propTypes = {
  weekHeaders: PropTypes.arrayOf(
    PropTypes.shape({
      index: PropTypes.number.isRequired,
      label: PropTypes.string,
      date: PropTypes.string,
    })
  ).isRequired,
};

const keyFromText = (s) =>
  `k-${toStr(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")}`;

function GuaranteesList({ text }) {
  if (!text) return null;

  const raw = text
    .split(" • ")
    .map((x) => toStr(x))
    .filter(Boolean);

  const counts = new Map();
  const items = raw.map((g) => {
    const base = keyFromText(g) || "k-empty";
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    return { g, key: `${base}-${n}` };
  });

  return (
    <ul className="list-disc pl-4">
      {items.map((it) => (
        <li key={it.key} className="micro">
          {it.g}
        </li>
      ))}
    </ul>
  );
}

GuaranteesList.propTypes = {
  text: PropTypes.string,
};

GuaranteesList.defaultProps = {
  text: "",
};

function DataRow({ r, weekHeaders }) {
  return (
    <tr className="row-pad">
      <td className="gs-td border text-center align-top">
        <div className="cell mini">{r.no}</div>
      </td>
      <td className="gs-td border align-top">
        <div className="cell micro">{r.loanId}</div>
      </td>
      <td className="gs-td border align-top">
        <div className="cell">
          <div className="font-medium mini">{r.cliente}</div>
        </div>
      </td>
      <td className="gs-td border align-top whitespace-pre-line">
        <div className="cell micro">{r.domicilio}</div>
      </td>
      <td className="gs-td border align-top">
        <div className="cell mini">{r.aval}</div>
      </td>
      <td className="gs-td border align-top whitespace-pre-line">
        <div className="cell micro">{r.domicilioAval}</div>
      </td>
      <td className="gs-td border align-top">
        <div className="cell mini">
          <GuaranteesList text={r.garantias} />
        </div>
      </td>
      <td className="gs-td border text-right align-top">
        <div className="cell mini">${Number(r.prestamo || 0).toLocaleString("es-MX")}</div>
      </td>
      <td className="gs-td border text-right align-top">
        <div className="cell mini">${Number(r.pagoSemanal || 0).toLocaleString("es-MX")}</div>
      </td>

      <WeekEmptyCells weekHeaders={weekHeaders} />
    </tr>
  );
}

DataRow.propTypes = {
  r: PropTypes.shape({
    key: PropTypes.string.isRequired,
    no: PropTypes.number.isRequired,
    loanId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    cliente: PropTypes.string.isRequired,
    domicilio: PropTypes.string,
    aval: PropTypes.string,
    domicilioAval: PropTypes.string,
    garantias: PropTypes.string,
    prestamo: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    pagoSemanal: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  }).isRequired,
  weekHeaders: PropTypes.arrayOf(
    PropTypes.shape({
      index: PropTypes.number.isRequired,
      label: PropTypes.string.isRequired,
      date: PropTypes.string.isRequired,
    })
  ).isRequired,
};

function renderTableBody({ loading, dataLoading, rows, weekHeaders }) {
  const colSpan = 9 + weekHeaders.length;

  if (loading || dataLoading) {
    return (
      <tr>
        <td className="p-3 border text-center" colSpan={colSpan}>
          Cargando…
        </td>
      </tr>
    );
  }

  if (!rows.length) {
    return (
      <tr>
        <td className="p-3 border text-center" colSpan={colSpan}>
          Sin datos
        </td>
      </tr>
    );
  }

  return rows.map((r) => <DataRow key={r.key} r={r} weekHeaders={weekHeaders} />);
}

function Table({ loading, dataLoading, rows, weekHeaders, weekColKeys }) {
  // ✅ Sonar: quitamos weekCount si no se usa (unused assignment)
  return (
    <table className="gs-table w-full text-sm border" style={{ borderColor: "#000" }}>
      <colgroup>
        <col style={{ width: "1.9%" }} />
        <col style={{ width: "2%" }} />
        <col style={{ width: "5%" }} />
        <col style={{ width: "6.6%" }} />
        <col style={{ width: "5%" }} />
        <col style={{ width: "6.6%" }} />
        <col style={{ width: "6.2%" }} />
        <col style={{ width: "3%" }} />
        <col style={{ width: "2.5%" }} />

        {weekColKeys.map((k) => (
          <col key={k} style={{ width: "calc(55% / 15)" }} />
        ))}
      </colgroup>

      <thead>
        <tr>
          <th className="gs-th border mini">No.</th>
          <th className="gs-th border mini">Id</th>
          <th className="gs-th border mini">Cliente</th>
          <th className="gs-th border mini">Dir</th>
          <th className="gs-th border mini">Aval</th>
          <th className="gs-th border mini">Dir A</th>
          <th className="gs-th border mini">Garantías</th>
          <th className="gs-th border mini">Prest</th>
          <th className="gs-th border mini">Pagos</th>

          {weekHeaders.map((w) => (
            <WeekHeaderCell key={`wk-head-${w.index}`} w={w} />
          ))}
        </tr>
      </thead>

      <tbody>{renderTableBody({ loading, dataLoading, rows, weekHeaders })}</tbody>
    </table>
  );
}

Table.propTypes = {
  loading: PropTypes.bool.isRequired,
  dataLoading: PropTypes.bool.isRequired,
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      no: PropTypes.number.isRequired,
      loanId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      cliente: PropTypes.string.isRequired,
      prestamo: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      pagoSemanal: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    })
  ).isRequired,
  weekHeaders: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      date: PropTypes.string.isRequired,
      index: PropTypes.number.isRequired,
    })
  ).isRequired,
  weekColKeys: PropTypes.arrayOf(PropTypes.string).isRequired,
};
