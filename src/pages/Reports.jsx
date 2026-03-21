// src/pages/Reports.jsx
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet";
import { BarChart3, TrendingUp, DollarSign, Users, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";

// =========================
// Utils base
// =========================
const toNum = (v) => (v == null || v === "" ? 0 : Number(v));
const toStr = (v) => (v == null ? "" : String(v)).trim();

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const startOfMonth = (d) => {
  const x = new Date(d);
  x.setDate(1);
  return startOfDay(x);
};

const endOfMonth = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return endOfDay(x);
};

const startOfQuarter = (d) => {
  const x = new Date(d);
  const qStartMonth = Math.floor(x.getMonth() / 3) * 3;
  return startOfDay(new Date(x.getFullYear(), qStartMonth, 1));
};

const startOfWeek = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return startOfDay(x);
};

const endOfWeek = (d) => {
  const start = startOfWeek(d);
  const x = new Date(start);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
};

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d) =>
  ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][d.getMonth()];

// =========================
// Helpers de fechas
// =========================
const loanDate = (l) => l?.start_date || l?.created_at;
const paymentDate = (p) => p?.payment_date || p?.created_at;
const clientDate = (c) => c?.created_at;

// =========================
// Helpers catálogos
// =========================
const uniqSorted = (arr) =>
  Array.from(new Set((arr || []).map(toStr).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const getPoblaciones = (clients) => uniqSorted((clients || []).map((c) => c?.poblacion));

const getRutasByPoblacion = (clients, poblacion) => {
  if (!poblacion) return [];
  return uniqSorted((clients || []).filter((c) => toStr(c?.poblacion) === toStr(poblacion)).map((c) => c?.ruta));
};

const getGruposByPoblacionAndRuta = (clients, poblacion, ruta) => {
  if (!poblacion) return [];

  let source = (clients || []).filter((c) => toStr(c?.poblacion) === toStr(poblacion));

  if (ruta) {
    source = source.filter((c) => toStr(c?.ruta) === toStr(ruta));
  }

  return uniqSorted(source.map((c) => c?.grupo));
};

const matchesClientFilters = ({ client, poblacion, ruta, grupo }) => {
  if (!client) return false;
  if (!poblacion) return true;

  if (toStr(client?.poblacion) !== toStr(poblacion)) return false;
  if (ruta && toStr(client?.ruta) !== toStr(ruta)) return false;
  if (grupo && toStr(client?.grupo) !== toStr(grupo)) return false;

  return true;
};

// =========================
// Helpers reportes
// =========================
const buildMonthlyBuckets = ({ now, monthsBack = 5 }) => {
  const buckets = [];
  const base = startOfMonth(now);

  for (let i = monthsBack; i >= 0; i--) {
    const d = addMonths(base, -i);
    buckets.push({
      key: monthKey(d),
      month: monthLabel(d),
      y: d.getFullYear(),
      m: d.getMonth(),
      loans: 0,
      payments: 0,
      clients: 0,
    });
  }

  return buckets;
};

const buildBucketIndex = (buckets) => {
  const map = new Map();
  for (const b of buckets) {
    map.set(`${b.y}-${b.m}`, b);
  }
  return map;
};

const addLoanToBuckets = ({ bucketsIndex, loan }) => {
  const ds = loanDate(loan);
  if (!ds) return;

  const d = new Date(ds);
  const b = bucketsIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
  if (b) b.loans += 1;
};

const addPaymentToBuckets = ({ bucketsIndex, payment }) => {
  const ds = paymentDate(payment);
  if (!ds) return;

  const d = new Date(ds);
  const b = bucketsIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
  if (b) b.payments += toNum(payment.amount);
};

const addClientToBuckets = ({ bucketsIndex, client }) => {
  const ds = clientDate(client);
  if (!ds) return;

  const d = new Date(ds);
  const b = bucketsIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
  if (b) b.clients += 1;
};

const getDateRangeByPeriod = (period, now) => {
  switch (period) {
    case "week":
      return {
        fromDate: startOfWeek(now),
        toDate: now,
      };

    case "last_week": {
      const currentWeekStart = startOfWeek(now);
      const lastWeekStart = new Date(currentWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      return {
        fromDate: startOfWeek(lastWeekStart),
        toDate: endOfWeek(lastWeekStart),
      };
    }

    case "month":
      return {
        fromDate: startOfMonth(now),
        toDate: now,
      };

    case "last_month": {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        fromDate: startOfMonth(lastMonthDate),
        toDate: endOfMonth(lastMonthDate),
      };
    }

    case "quarter":
      return {
        fromDate: startOfQuarter(now),
        toDate: now,
      };

    case "year":
      return {
        fromDate: startOfDay(new Date(now.getFullYear(), 0, 1)),
        toDate: now,
      };

    default:
      return {
        fromDate: startOfMonth(now),
        toDate: now,
      };
  }
};

const calcMonthlyMaxLoans = (monthlyData) =>
  monthlyData.reduce((mx, x) => Math.max(mx, x.loans || 0), 0);

const colorForLoanStatus = (s) =>
  s === "active"
    ? "bg-secondary"
    : s === "completed"
    ? "bg-primary"
    : s === "overdue"
    ? "bg-destructive"
    : "bg-muted";

const colorForPaymentStatus = (s) =>
  s === "paid"
    ? "bg-secondary"
    : s === "pending"
    ? "bg-yellow-500"
    : s === "overdue"
    ? "bg-destructive"
    : "bg-muted";

export default function Reports() {
  const { clients = [], loans = [], payments = [] } = useData();

  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [selectedPoblacion, setSelectedPoblacion] = useState("");
  const [selectedRuta, setSelectedRuta] = useState("");
  const [selectedGrupo, setSelectedGrupo] = useState("");

  // =========================
  // Catálogos de filtros
  // =========================
  const poblaciones = useMemo(() => getPoblaciones(clients), [clients]);

  const rutas = useMemo(
    () => getRutasByPoblacion(clients, selectedPoblacion),
    [clients, selectedPoblacion]
  );

  const grupos = useMemo(
    () => getGruposByPoblacionAndRuta(clients, selectedPoblacion, selectedRuta),
    [clients, selectedPoblacion, selectedRuta]
  );

  // =========================
  // Normalizar dependencias entre filtros
  // =========================
  const handlePoblacionChange = (value) => {
    setSelectedPoblacion(value);
    setSelectedRuta("");
    setSelectedGrupo("");
  };

  const handleRutaChange = (value) => {
    setSelectedRuta(value);
    setSelectedGrupo("");
  };

  const handleGrupoChange = (value) => {
    setSelectedGrupo(value);
  };

  // =========================
  // Periodo seleccionado
  // =========================
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    return getDateRangeByPeriod(selectedPeriod, now);
  }, [selectedPeriod]);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const t = new Date(dateStr);
    return t >= fromDate && t <= toDate;
  };

  // =========================
  // Clientes filtrados por población/ruta/grupo
  // =========================
  const filteredClients = useMemo(() => {
    return clients.filter((client) =>
      matchesClientFilters({
        client,
        poblacion: selectedPoblacion,
        ruta: selectedRuta,
        grupo: selectedGrupo,
      })
    );
  }, [clients, selectedPoblacion, selectedRuta, selectedGrupo]);

  const filteredClientIds = useMemo(
    () => new Set(filteredClients.map((c) => c.id)),
    [filteredClients]
  );

  // =========================
  // Loans / payments filtrados por cliente
  // =========================
  const filteredLoans = useMemo(
    () => loans.filter((l) => filteredClientIds.has(l.client_id)),
    [loans, filteredClientIds]
  );

  const filteredPayments = useMemo(() => {
    const filteredLoanIds = new Set(filteredLoans.map((l) => l.id));
    return payments.filter((p) => filteredLoanIds.has(p.loan_id));
  }, [payments, filteredLoans]);

  // =========================
  // Filtrados por periodo
  // =========================
  const loansInPeriod = useMemo(
    () => filteredLoans.filter((l) => inRange(loanDate(l))),
    [filteredLoans, fromDate, toDate]
  );

  const paymentsInPeriod = useMemo(
    () => filteredPayments.filter((p) => inRange(paymentDate(p))),
    [filteredPayments, fromDate, toDate]
  );

  const clientsInPeriod = useMemo(
    () => filteredClients.filter((c) => inRange(clientDate(c))),
    [filteredClients, fromDate, toDate]
  );

  // =========================
  // KPIs
  // =========================
  const stats = useMemo(() => {
    const totalLoaned = loansInPeriod.reduce((s, l) => s + toNum(l.amount), 0);
    const totalCollected = paymentsInPeriod.reduce((s, p) => s + toNum(p.amount), 0);
    const avgLoan = loansInPeriod.length ? totalLoaned / loansInPeriod.length : 0;
    const collectionRate = totalLoaned > 0 ? (totalCollected / totalLoaned) * 100 : 0;

    const activeClients = filteredClients.filter(
      (c) => (c.status || "").toLowerCase() === "active"
    ).length;

    const activeLoans = filteredLoans.filter(
      (l) => (l.status || "").toLowerCase() === "active"
    ).length;

    return {
      totalClients: activeClients,
      activeLoans,
      totalLoaned,
      totalCollected,
      averageLoanAmount: avgLoan,
      collectionRate,
      newClientsInPeriod: clientsInPeriod.length,
    };
  }, [loansInPeriod, paymentsInPeriod, filteredClients, filteredLoans, clientsInPeriod]);

  // =========================
  // Serie mensual real (últimos 6 meses)
  // =========================
  const monthlyData = useMemo(() => {
    const now = new Date();
    const buckets = buildMonthlyBuckets({ now, monthsBack: 5 });
    const bucketsIndex = buildBucketIndex(buckets);

    for (const l of filteredLoans) addLoanToBuckets({ bucketsIndex, loan: l });
    for (const p of filteredPayments) addPaymentToBuckets({ bucketsIndex, payment: p });
    for (const c of filteredClients) addClientToBuckets({ bucketsIndex, client: c });

    return buckets;
  }, [filteredLoans, filteredPayments, filteredClients]);

  const maxLoansInMonthly = useMemo(() => calcMonthlyMaxLoans(monthlyData), [monthlyData]);

  // =========================
  // Distribuciones por estado
  // =========================
  const loansByStatus = useMemo(() => {
    const map = new Map();

    for (const l of loansInPeriod) {
      const s = (l.status || l.estado_prestamo || "").toLowerCase() || "desconocido";
      map.set(s, (map.get(s) || 0) + 1);
    }

    return Array.from(map.entries()).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      color: colorForLoanStatus(status),
    }));
  }, [loansInPeriod]);

  const paymentsByStatus = useMemo(() => {
    const map = new Map();

    for (const p of paymentsInPeriod) {
      const s = (p.status || "").toLowerCase() || "desconocido";
      map.set(s, (map.get(s) || 0) + 1);
    }

    return Array.from(map.entries()).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      color: colorForPaymentStatus(status),
    }));
  }, [paymentsInPeriod]);

  const handleExportReport = () => {
    toast({
      title: "Exportar",
      description: "Ya quedó lista la base para exportar respetando los filtros seleccionados.",
    });
  };

  const clearFilters = () => {
    setSelectedPoblacion("");
    setSelectedRuta("");
    setSelectedGrupo("");
  };

  return (
    <>
      <Helmet>
        <title>Reportes y Análisis</title>
      </Helmet>

      <div className="space-y-6">
        <PageHeader title="Reportes y Análisis" description="Análisis del rendimiento basado en datos reales">
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Seleccionar periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="last_week">Semana Pasada</SelectItem>
                <SelectItem value="month">Este Mes</SelectItem>
                <SelectItem value="last_month">Mes Pasado</SelectItem>
                <SelectItem value="quarter">Este Trimestre</SelectItem>
                <SelectItem value="year">Este Año</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleExportReport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </PageHeader>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>
              Primero población. Ruta es opcional. Grupo se ajusta según la selección.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Población</label>
                <Select value={selectedPoblacion} onValueChange={handlePoblacionChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar población" />
                  </SelectTrigger>
                  <SelectContent>
                    {poblaciones.map((p) => (
                      <SelectItem key={`pob-${p}`} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Ruta</label>
                <Select
                  value={selectedRuta || "all"}
                  onValueChange={(value) => handleRutaChange(value === "all" ? "" : value)}
                  disabled={!selectedPoblacion}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {rutas.map((r) => (
                      <SelectItem key={`ruta-${r}`} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Grupo</label>
                <Select
                  value={selectedGrupo || "all"}
                  onValueChange={(value) => handleGrupoChange(value === "all" ? "" : value)}
                  disabled={!selectedPoblacion}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {grupos.map((g) => (
                      <SelectItem key={`grupo-${g}`} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Prestado</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">${stats.totalLoaned.toLocaleString("es-MX")}</div>
                <p className="text-xs text-muted-foreground">
                  Promedio: ${stats.averageLoanAmount.toLocaleString("es-MX")}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recaudado</CardTitle>
                <TrendingUp className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">${stats.totalCollected.toLocaleString("es-MX")}</div>
                <p className="text-xs text-muted-foreground">
                  Tasa de cobranza: {stats.collectionRate.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
                <BarChart3 className="h-4 w-4 text-gradient" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gradient">{stats.activeLoans}</div>
                <p className="text-xs text-muted-foreground">según filtros seleccionados</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
                <Users className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{stats.totalClients}</div>
                <p className="text-xs text-muted-foreground">según filtros seleccionados</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-primary" />
                  Rendimiento (últimos 6 meses)
                </CardTitle>
                <CardDescription>Préstamos creados, pagos cobrados y altas de clientes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthlyData.map((data) => {
                    const denom = Math.max(1, maxLoansInMonthly);
                    const widthPct = Math.min(100, (data.loans / denom) * 100);

                    return (
                      <div key={data.key} className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 text-sm font-medium text-muted-foreground">{data.month}</div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 text-sm">
                              <span className="text-muted-foreground">Préstamos:</span>
                              <span className="font-semibold">{data.loans}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 mt-1">
                              <div
                                className="bg-gradient-to-r from-secondary to-primary h-2 rounded-full transition-all duration-500"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-secondary">
                            ${data.payments.toLocaleString("es-MX")}
                          </div>
                          <div className="text-xs text-muted-foreground">{data.clients} clientes</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-gradient" />
                  Distribución por Estado
                </CardTitle>
                <CardDescription>Estado actual en el periodo seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Préstamos</h4>
                    <div className="space-y-2">
                      {loansByStatus.map((item) => (
                        <div key={item.status} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${item.color}`} />
                            <span className="text-sm text-muted-foreground">{item.status}</span>
                          </div>
                          <span className="text-sm font-semibold">{item.count}</span>
                        </div>
                      ))}
                      {loansByStatus.length === 0 && (
                        <div className="text-xs text-muted-foreground">Sin datos en este periodo</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Pagos</h4>
                    <div className="space-y-2">
                      {paymentsByStatus.map((item) => (
                        <div key={item.status} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${item.color}`} />
                            <span className="text-sm text-muted-foreground">{item.status}</span>
                          </div>
                          <span className="text-sm font-semibold">{item.count}</span>
                        </div>
                      ))}
                      {paymentsByStatus.length === 0 && (
                        <div className="text-xs text-muted-foreground">Sin datos en este periodo</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}