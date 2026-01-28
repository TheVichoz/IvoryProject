// src/lib/loanUtils.js

/**
 * Extrae el número de semanas desde un texto como "14 semanas".
 * Si ya viene número, lo retorna tal cual. Usa fallback cuando no pueda parsear.
 */
export function parseTermWeeks(term, fallback = 14) {
  if (term == null) return fallback;
  if (typeof term === "number") return term || fallback;
  const m = String(term).match(/(\d+)/);
  return m ? Number(m[1]) : fallback;
}

/**
 * Normaliza una tasa para que:
 *  - 40    => 0.40
 *  - 0.40  => 0.40
 */
export function normalizeRate(rate) {
  const r = Number(rate) || 0;
  return r > 1 ? r / 100 : r;
}

/**
 * Calcula pago semanal fijo.
 * mode:
 *  - "flat": interés plano sobre el total del ciclo → total = amount * (1 + r)
 *  - "annual": prorratea tasa anual por semanas  → total = amount * (1 + r * (weeks/52))
 *
 * Devuelve:
 *  - weekly: pago semanal (redondeado)
 *  - total: total a pagar en el ciclo
 */
export function calcWeeklyPayment({
  amount = 0,
  interest_rate = 0,
  term_weeks = 14,
  mode = "flat",        // usa "annual" si quieres prorratear por año
  round = "peso",       // "peso" | "decena" | number (decimales)
}) {
  const principal = Number(amount) || 0;
  const w = Number(term_weeks) || 1;
  const r = normalizeRate(interest_rate);

  let total;
  if (mode === "annual") {
    total = principal * (1 + r * (w / 52));
  } else {
    total = principal * (1 + r);
  }

  let weekly = total / w;

  if (round === "decena")      weekly = Math.ceil(weekly / 10) * 10;
  else if (round === "peso")   weekly = Math.round(weekly);
  else if (typeof round === "number") {
    const p = 10 ** round;
    weekly = Math.round(weekly * p) / p;
  }

  return { weekly, total };
}

/**
 * Cálculo estilo "jefe": interés PLANO del ciclo.
 * Ej: monto 2000, tasa 40%, semanas 14 → total 2800, semanal 200.
 *
 * Devuelve:
 *  - base: monto original
 *  - interest: interés del ciclo
 *  - total: base + interés
 *  - weekly: pago semanal (redondeado)
 */
export function calcFlatCycle({
  amount = 0,
  ratePercent = 40,     // admite 40 o 0.40
  weeks = 14,
  round = "peso",       // "peso" | "decena" | number (decimales)
}) {
  const base = Number(amount) || 0;
  const r = normalizeRate(ratePercent);
  const interest = base * r;
  const total = base + interest;

  let weekly = total / (Number(weeks) || 1);

  if (round === "decena")      weekly = Math.ceil(weekly / 10) * 10;
  else if (round === "peso")   weekly = Math.round(weekly);
  else if (typeof round === "number") {
    const p = 10 ** round;
    weekly = Math.round(weekly * p) / p;
  }

  return { base, interest, total, weekly };
}

/**
 * Suma días a una fecha ISO (YYYY-MM-DD) y devuelve ISO (YYYY-MM-DD).
 */
export function addDaysISO(isoDate, days) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
