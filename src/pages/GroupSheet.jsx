// src/pages/GroupSheet.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/lib/customSupabaseClient";
import { parseTermWeeks, calcWeeklyPayment } from "@/lib/loanUtils";
import { TrendingUp } from "lucide-react";
// Importa el logo como URL empaquetada por Vite (evita CORS en html2canvas)
import fincenLogoUrl from "@/assets/Logo-Azul-CIelo.png?url";

const TOTAL_WEEKS = 15;

const toStr = (v) => (v == null ? "" : String(v)).trim();

/* =========================
   FIX fechas: parser local
========================= */
const parseLocalDate = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [_, Y, M, D] = m;
      return new Date(Number(Y), Number(M) - 1, Number(D), 12, 0, 0, 0);
    }
  }
  const d = new Date(v);
  if (isNaN(d)) return null;
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

// helper para <input type="date"> en hora local
const toDateInput = (dLike) => {
  const x = parseLocalDate(dLike);
  if (!x) return "";
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* ===== Normalización de texto multilínea para evitar huecos ===== */
const normalizeMultiline = (s) =>
  toStr(s).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();

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

export default function GroupSheet() {
  const {
    clients = [],
    loans = [],
    payments = [],
    loading: dataLoading = false,
  } = useData() || {};

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

  /* ========= Pre-carga del logo para asegurar que html2canvas lo capture ========= */
  const waitForLogo = useCallback(() => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.decode) {
          img.decode().finally(() => resolve(true));
        } else {
          resolve(true);
        }
      };
      img.onerror = () => resolve(false);
      img.src = fincenLogoUrl;
    });
  }, []);

  /* ===== Pie de página: leyenda izquierda + páginas centradas ===== */
  const FOOTER_TEXT = "Fincen tu crédito seguro";
  function drawFooter(pdf, pageNum, totalPages, pageWidth, pageHeight, margin) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const y = pageHeight - 12; // altura del pie
    // Izquierda: leyenda
    pdf.text(FOOTER_TEXT, margin, y);
    // Centro: numeración
    pdf.text(`${pageNum}/${totalPages}`, pageWidth / 2, y, { align: "center" });
  }

  // ===== Descargar PDF (mismo DOM -> misma vista) =====
  const handleDownloadPDF = async () => {
    try {
      const el = printRef.current;
      if (!el) return;

      await waitForLogo();

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: el.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");

      // 🚨 Tamaño Carta horizontal (Letter landscape)
      const pdf = new jsPDF("l", "pt", "letter");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24; // ~0.33in
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      const totalPages = Math.max(1, Math.ceil(imgHeight / contentHeight));

      // Página 1
      pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imgHeight, undefined, "FAST");
      drawFooter(pdf, 1, totalPages, pageWidth, pageHeight, margin);

      // Páginas siguientes (si las hay)
      for (let p = 2; p <= totalPages; p++) {
        const yOffset = margin - (p - 1) * contentHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, yOffset, contentWidth, imgHeight, undefined, "FAST");
        drawFooter(pdf, p, totalPages, pageWidth, pageHeight, margin);
      }

      const dForName = parseLocalDate(startDate);
      const fname = `hoja-grupo_${ruta || ""}_${poblacion || ""}_${
        dForName
          ? `${dForName.getFullYear()}-${String(dForName.getMonth() + 1).padStart(2, "0")}-${String(
              dForName.getDate()
            ).padStart(2, "0")}`
          : ""
      }.pdf`;

      pdf.save(fname.replace(/\s+/g, "_"));
    } catch (e) {
      console.error("PDF error:", e);
    }
  };

  // ===== Imprimir (PDF sin encabezados del navegador) =====
  const handlePrint = async () => {
    try {
      const el = printRef.current;
      if (!el) return;

      await waitForLogo();

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: el.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");

      // 🚨 Tamaño Carta horizontal (Letter landscape)
      const pdf = new jsPDF("l", "pt", "letter");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24; // ~0.33in
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      const totalPages = Math.max(1, Math.ceil(imgHeight / contentHeight));

      // Página 1
      pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imgHeight, undefined, "FAST");
      drawFooter(pdf, 1, totalPages, pageWidth, pageHeight, margin);

      // Páginas siguientes
      for (let p = 2; p <= totalPages; p++) {
        const yOffset = margin - (p - 1) * contentHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, yOffset, contentWidth, imgHeight, undefined, "FAST");
        drawFooter(pdf, p, totalPages, pageWidth, pageHeight, margin);
      }

      pdf.autoPrint();
      const url = pdf.output("bloburl");
      window.open(url, "_blank");
    } catch (e) {
      console.error("Print error:", e);
    }
  };

  // ===== Semanas
  const weekHeaders = useMemo(() => {
    if (!startDate) return [];
    return Array.from({ length: TOTAL_WEEKS }, (_, i) => ({
      label: `SEM ${String(i + 1).padStart(2, "0")}`,
      // S1 = startDate + 7 días, S2 = startDate + 14, etc.
      date: fmt(addDays(startDate, (i + 1) * 7)),
      index: i + 1,
    }));
  }, [startDate]);

  // Poblaciones desde clientes
  useEffect(() => {
    const setCat = new Set();
    for (const c of clients) {
      const p = toStr(c.poblacion);
      if (p) setCat.add(p);
    }
    setPoblaciones(Array.from(setCat).sort((a, b) => a.localeCompare(b)));
  }, [clients]);

  // Rutas desde clientes + Grupos (solo desde CLIENTES, no desde loans)
  useEffect(() => {
    const source = poblacion ? clients.filter((c) => toStr(c.poblacion) === poblacion) : [];
    const setR = new Set();
    for (const c of source) {
      const r = toStr(c.ruta);
      if (r) setR.add(r);
    }
    const rutasArr = Array.from(setR).sort((a, b) => a.localeCompare(b));
    setRutas(rutasArr);
    if (ruta && !rutasArr.includes(ruta)) setRuta("");

    const setG = new Set();
    for (const c of source) {
      const g = toStr(c.grupo);
      if (g) setG.add(g);
    }
    const gruposArr = Array.from(setG).sort((a, b) => a.localeCompare(b));
    setGrupos(gruposArr);
    if (grupo && !gruposArr.includes(grupo)) setGrupo("");
  }, [poblacion, ruta, clients, loans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Construcción de filas
  useEffect(() => {
    if (!poblacion) {
      setRows([]);
      return;
    }
    buildRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poblacion, ruta, grupo, startDate, search, clients, loans, payments]);

  async function buildRows() {
    setLoading(true);
    try {
      // 1) Clientes por población y (opcional) ruta
      let groupClients = clients.filter((c) => toStr(c.poblacion) === poblacion);
      if (ruta) groupClients = groupClients.filter((c) => toStr(c.ruta) === ruta);
      const clientIds = groupClients.map((c) => c.id);

      if (!clientIds.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2) Préstamos de esos clientes
      let allLoans = loans.filter((l) => clientIds.includes(l.client_id));
      if (!allLoans.length) {
        const { data: supLoans } = await supabase.from("loans").select("*").in("client_id", clientIds);
        allLoans = supLoans || [];
      }

      // 3) Decidir qué préstamos mostrar
      const clientsById = new Map(groupClients.map((c) => [c.id, c]));
      let loansToShow = [];

      if (!grupo) {
        // Sin grupo seleccionado → 1 préstamo por cliente (el más reciente / activo)
        const byClient = new Map();
        for (const l of allLoans) {
          const nl = normalizeLoanRow(l);
          const score =
            (nl.status === "active" ? 2 : 1) * 1e12 + new Date(nl.created || nl.start || 0).getTime();
          const cur = byClient.get(l.client_id);
          const curScore = cur
            ? (() => {
                const ncur = normalizeLoanRow(cur);
                return (
                  (ncur.status === "active" ? 2 : 1) * 1e12 +
                  new Date(ncur.created || ncur.start || 0).getTime()
                );
              })()
            : -1;
          if (!cur || score > curScore) byClient.set(l.client_id, l);
        }
        loansToShow = Array.from(byClient.values());
      } else {
        // CON grupo seleccionado → filtrar por el grupo del CLIENTE,
        // para que coincida con ClientManagement
        loansToShow = allLoans.filter((l) => {
          const c = clientsById.get(l.client_id);
          if (!c) return false;
          return toStr(c.grupo) === toStr(grupo);
        });

        // ============================
        // ✅ FIX: respetar "Fecha inicio (S1)"
        // y evitar que salga el préstamo completed
        // ============================

        // 1) En hoja de grupo, por default solo mostrar ACTIVOS
        loansToShow = loansToShow.filter((l) => toStr(l?.status).toLowerCase() === "active");

        // 2) Si el usuario eligió startDate (S1), filtrar por start_date (o created_at fallback)
        const s1 = startDate ? toDateInput(startDate) : "";
        if (s1) {
          loansToShow = loansToShow.filter((l) => {
            const loanS1 = toDateInput(l?.start_date || l?.created_at);
            return loanS1 === s1;
          });
        }

        // 3) Si por algún motivo quedan 2 activos para el mismo cliente,
        // quedarnos con el más reciente (por start/created)
        const byClient = new Map();
        for (const l of loansToShow) {
          const nl = normalizeLoanRow(l);
          const t = new Date(nl.start || nl.created || 0).getTime();
          const cur = byClient.get(l.client_id);
          const curT = cur
            ? new Date(
                normalizeLoanRow(cur).start || normalizeLoanRow(cur).created || 0
              ).getTime()
            : -1;
          if (!cur || t > curT) byClient.set(l.client_id, l);
        }
        loansToShow = Array.from(byClient.values());
      }

      // 4) startDate por defecto (más antiguo entre visibles)
      if (!startDate && loansToShow.length) {
        const s = loansToShow
          .map((x) => x.start_date || x.created_at)
          .filter(Boolean)
          .sort((a, b) => new Date(a) - new Date(b))[0];
        if (s) setStartDate(s);
      }

      // 5) Mapas auxiliares (avales y garantías)
      let avalesMap = {};
      {
        const { data: avales } = await supabase
          .from("avales")
          .select("client_id, nombre, direccion, telefono")
          .in("client_id", clientIds);
        if (avales) {
          avalesMap = avales.reduce((acc, a) => {
            acc[a.client_id] = a;
            return acc;
          }, {});
        }
      }

      let guaranteesMap = {};
      const selectedLoanIds = loansToShow.map((l) => l.id);
      {
        const [{ data: gByClient }, { data: gByLoan }] = await Promise.all([
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

        const addG = (cid, g) => {
          if (!cid) return;
          const txt = formatGuarantee(g);
          if (!txt) return;
          if (!guaranteesMap[cid]) guaranteesMap[cid] = new Set();
          guaranteesMap[cid].add(txt);
        };

        for (const g of gByClient || []) addG(g.client_id, g);
        for (const g of gByLoan || []) {
          const loan = loansToShow.find((l) => l.id === g.loan_id);
          if (!loan) continue;
          addG(loan.client_id, g);
        }
      }

      // 6) Construcción de filas
      const list = [];

      loansToShow
        .sort((a, b) => {
          const ca = clientsById.get(a.client_id);
          const cb = clientsById.get(b.client_id);
          return toStr(ca?.name || ca?.nombre).localeCompare(toStr(cb?.name || cb?.nombre));
        })
        .forEach((loan, idx) => {
          const c = clientsById.get(loan.client_id);
          if (!c) return;
          const nl = normalizeLoanRow(loan);
          const aval = avalesMap[c.id] || {};
          const garantias = guaranteesMap[c.id] ? Array.from(guaranteesMap[c.id]).join(" • ") : "";

          const clientPhone = c.phone ?? c.telefono ?? "";
          const dirCliente = joinLines(c.address ?? c.direccion ?? "", clientPhone && `Tel. ${clientPhone}`);
          const avalPhone = aval.telefono ?? aval.phone ?? "";
          const dirAval = joinLines(aval.direccion || "", avalPhone && `Tel. ${avalPhone}`);

          list.push({
            key: `${loan.id}`,
            no: idx + 1,
            loanId: nl.id,
            clientId: c.id,
            cliente: c.name ?? c.nombre ?? "(Sin nombre)",
            domicilio: dirCliente,
            aval: aval.nombre || "",
            domicilioAval: dirAval,
            garantias,
            prestamo: nl.amount,
            pagoSemanal: nl.weekly_payment,
            startDate: nl.start || "",
            status: nl.status,
            ruta: toStr(c.ruta),
            poblacion: toStr(c.poblacion),
            // 👇 Siempre prioriza el grupo del CLIENTE (igual que en ClientManagement)
            grupo: toStr(c.grupo) || toStr(loan.grupo),
          });
        });

      // 7) Búsqueda
      const filteredRows = list.filter((r) =>
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
          .includes((search || "").toLowerCase())
      );

      setRows(filteredRows);
    } catch (e) {
      console.error("GroupSheet error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const headerInfo = useMemo(() => {
    if (!poblacion) return null;
    return {
      ruta: ruta || "Todas",
      poblacion,
      grupo: grupo || "Todos",
    };
  }, [poblacion, ruta, grupo]);

  const groupLabel = useMemo(() => (grupo ? `GRUPO ${grupo}` : "GRUPO"), [grupo]);

  const totalPagos = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r?.pagoSemanal) || 0), 0),
    [rows]
  );

  return (
    <div className="p-6 max-w-[1280px] mx-auto">
      {/* Estilos */}
      <style id="groupSheetStyles">{`
  /* ===== Config ancho columnas ===== */
  :root {
    --left-cols: 30%;
    --weeks-cols: 70%;
    --row-h: 150px; /* altura mínima en pantalla */
  }

  /* ============ IMPRESIÓN EN CARTA (LETTER) ============ */
  @page {
    size: 11in 8.5in;
    margin: 0.35in;
  }

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

  /* Altura en pantalla normal: mínima, no fija */
  .gs-table tbody tr.row-pad { min-height: var(--row-h); }
  .row-pad .cell {
    min-height: var(--row-h);
    height: auto;
    display: block;
    padding-bottom: 4px; /* pequeño hueco en pantalla también */
  }
  .week-box {
    border: 0;
    background: #fff;
    border-radius: 0;
    min-height: var(--row-h);
    height: auto;
    width: 100%;
  }

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
  .group-pill { border: 1px solid #000; background: #fff; padding: 16px 32px;
    font-weight: 800; font-size: 42px; border-radius: 8px; white-space: nowrap; }
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

  /* ======== Ajustes específicos para impresión ======== */
  @media print {
    /* Altura MÍNIMA por fila del cuerpo: 2.5 cm,
       pero se deja crecer si el texto necesita más */
    :root { --row-h: 2.5cm; }

    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet-wide { width: calc(11in - 0.70in); padding-bottom: 2.5cm; }

    .gs-table tbody tr.row-pad { min-height: var(--row-h) !important; }

    .gs-table tbody tr.row-pad > td.gs-td {
      padding: 3px 4px 6px 4px !important; /* un poco más de aire abajo */
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

    /* Encabezados y bordes un poco más marcados */
    .gs-table thead .gs-th {
      font-size: 12px !important;
      line-height: 1.1 !important;
      padding: 2px !important;
      border-width: 1px !important;
    }
    .gs-table thead .wk-head {
      font-size: 14px !important;
      line-height: 1.2 !important;
      font-weight: 800 !important;
    }
    .gs-table thead .wk-date {
      font-size: 12px !important;
      line-height: 1.1 !important;
    }
    .gs-table tbody .gs-td { border-width: 2px !important; }

    /* 👇 Mismo tamaño de letra que en pantalla para evitar números mochos */
    .gs-table tbody .gs-td .cell {
      font-size: 16.5px !important;
      line-height: 1.32 !important;
    }
    .gs-table tbody .mini {
      font-size: 16.5px !important;
      line-height: 1.32 !important;
    }
    .gs-table tbody .micro {
      font-size: 15.5px !important;
      line-height: 1.32 !important;
    }
  }
`}</style>

      {/* Encabezado de acciones (SIN título visible) */}
      <div className="flex items-center justify-end mb-4">
        <div className="no-print flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-2 border rounded-md hover:bg-gray-50"
          >
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

      {/* Filtros */}
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

      {/* Área imprimible */}
      <div
        ref={printRef}
        className="overflow-auto border rounded-lg sheet-wide"
        style={{ borderColor: "#000" }}
      >
        {/* Encabezado */}
        <div className="sheet-header header-v2">
          {/* Izquierda */}
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

          {/* Centro */}
          <div className="group-pill">{groupLabel}</div>

          {/* Derecha */}
          <div className="brand-wrap">
            <div className="brand-badge">
              <TrendingUp className="h-4 w-4" />
            </div>
            <FincenLogo />
          </div>
        </div>

        {/* Tabla */}
        <Table loading={loading} dataLoading={dataLoading} rows={rows} weekHeaders={weekHeaders} />

        {/* Total debajo de "Pagos" */}
        <div
          className="sum-pagos"
          style={{ marginLeft: "830px", width: "54px", marginTop: "12px", marginBottom: "12px" }}
        >
          Valor ${totalPagos.toLocaleString("es-MX")}
        </div>
      </div>

      <p className="text-xs mt-2" style={{ color: "#000" }}>
        Filtros alineados a <b>Corte de Cobranza Diario</b>: primero elegir Población y
        opcionalmente Ruta y Grupo. Semanas 1–15: pagos.
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 no-print">
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
        <label className="block text-sm mb-1">Fecha inicio (S1)</label>
        <input
          type="date"
          className="w-full border rounded-md px-3 py-2"
          value={startDate ? toDateInput(startDate) : ""}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={!poblacion}
        />
      </div>

      <div className="col-span-1">
        <label className="block text-sm mb-1">Buscar</label>
        <input
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

function Table({ loading, dataLoading, rows, weekHeaders }) {
  return (
    <table className="gs-table w-full text-sm border" style={{ borderColor: "#000" }}>
      <colgroup>
        {/* 40% para info (9 columnas) */}
        <col style={{ width: "1.9%" }} /> {/* No. */}
        <col style={{ width: "2%" }} /> {/* Id */}
        <col style={{ width: "5%" }} /> {/* Cliente */}
        <col style={{ width: "6.6%" }} /> {/* Dir */}
        <col style={{ width: "5%" }} /> {/* Aval */}
        <col style={{ width: "6.6%" }} /> {/* Dir A */}
        <col style={{ width: "6.2%" }} /> {/* Garantías */}
        <col style={{ width: "3%" }} /> {/* Prest */}
        <col style={{ width: "2.5%" }} /> {/* Pagos */}

        {/* 60% repartido entre 15 semanas */}
        {Array.from({ length: TOTAL_WEEKS }).map((_, i) => (
          <col key={i} style={{ width: "calc(55% / 15)" }} />
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
            <th key={w.index} className="gs-th gs-week-th border text-center">
              <div className="wk-head">{w.label}</div>
              <div className="wk-date">{w.date}</div>
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {(loading || dataLoading) && (
          <tr>
            <td className="p-3 border text-center" colSpan={9 + weekHeaders.length}>
              Cargando…
            </td>
          </tr>
        )}

        {!loading && !dataLoading && rows.length === 0 && (
          <tr>
            <td className="p-3 border text-center" colSpan={9 + weekHeaders.length}>
              Sin datos
            </td>
          </tr>
        )}

        {!loading &&
          !dataLoading &&
          rows.map((r) => (
            <tr key={r.key} className="row-pad">
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
                  {r.garantias ? (
                    <ul className="list-disc pl-4">
                      {r.garantias.split(" • ").map((g, i) => (
                        <li key={i} className="micro">
                          {g}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    ""
                  )}
                </div>
              </td>
              <td className="gs-td border text-right align-top">
                <div className="cell mini">${r.prestamo.toLocaleString("es-MX")}</div>
              </td>
              <td className="gs-td border text-right align-top">
                <div className="cell mini">${r.pagoSemanal.toLocaleString("es-MX")}</div>
              </td>

              {weekHeaders.map((_, i) => (
                <td key={i} className="gs-td gs-week-td border align-top">
                  <div className="week-box" />
                </td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
  );
}
