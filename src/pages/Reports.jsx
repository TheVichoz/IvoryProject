// src/pages/Reports.jsx
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet";
import { BarChart3, TrendingUp, DollarSign, Users, Download, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";

// utils
const toNum = (v) => (v == null || v === "" ? 0 : Number(v));
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const startOfMonth = (d) => { const x = new Date(d); x.setDate(1); return startOfDay(x); };
const startOfQuarter = (d) => {
  const x = new Date(d);
  const qStartMonth = Math.floor(x.getMonth() / 3) * 3; // 0,3,6,9
  return startOfDay(new Date(x.getFullYear(), qStartMonth, 1));
};
const startOfWeek = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // ISO week: Monday=0
  x.setDate(x.getDate() - dow);
  return startOfDay(x);
};
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel = (d) =>
  ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][d.getMonth()];

export default function Reports() {
  const { clients = [], loans = [], payments = [] } = useData();
  const [selectedPeriod, setSelectedPeriod] = useState("month"); // week | month | quarter | year

  // ====== Periodo seleccionado (rango desde...hasta hoy) ======
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    let from;
    if (selectedPeriod === "week") from = startOfWeek(now);
    else if (selectedPeriod === "month") from = startOfMonth(now);
    else if (selectedPeriod === "quarter") from = startOfQuarter(now);
    else if (selectedPeriod === "year") from = startOfDay(new Date(now.getFullYear(), 0, 1));
    else from = startOfMonth(now);
    return { fromDate: from, toDate: now };
  }, [selectedPeriod]);

  // helpers para tomar fechas de cada tabla
  const loanDate = (l) => l?.start_date || l?.created_at;
  const paymentDate = (p) => p?.payment_date || p?.created_at;
  const clientDate = (c) => c?.created_at;

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const t = new Date(dateStr);
    return t >= fromDate && t <= toDate;
  };

  // ====== Filtrados por periodo ======
  const loansInPeriod = useMemo(() => loans.filter((l) => inRange(loanDate(l))), [loans, fromDate, toDate]);
  const paymentsInPeriod = useMemo(() => payments.filter((p) => inRange(paymentDate(p))), [payments, fromDate, toDate]);
  const clientsInPeriod = useMemo(() => clients.filter((c) => inRange(clientDate(c))), [clients, fromDate, toDate]);

  // ====== KPIs ======
  const stats = useMemo(() => {
    const totalLoaned = loansInPeriod.reduce((s, l) => s + toNum(l.amount), 0);
    const totalCollected = paymentsInPeriod.reduce((s, p) => s + toNum(p.amount), 0);
    const avgLoan = loansInPeriod.length ? totalLoaned / loansInPeriod.length : 0;

    // ratio de cobranza: cobrado / prestado (del periodo). Si totalLoaned es 0, 0%.
    const collectionRate = totalLoaned > 0 ? (totalCollected / totalLoaned) * 100 : 0;

    // clientes activos: según status en tabla clients
    const activeClients = clients.filter((c) => (c.status || "").toLowerCase() === "active").length;

    return {
      totalClients: activeClients,
      activeLoans: loans.filter((l) => (l.status || "").toLowerCase() === "active").length,
      totalLoaned,
      totalCollected,
      averageLoanAmount: avgLoan,
      collectionRate,
    };
  }, [loansInPeriod, paymentsInPeriod, clients, loans]);

  // ====== Serie mensual real (últimos 6 meses) ======
  const monthlyData = useMemo(() => {
    const now = new Date();
    // Construimos 6 buckets: M-5 .. M (incluye mes actual)
    theBuckets: {
      const buckets = [];
      for (let i = 5; i >= 0; i--) {
        const d = addMonths(startOfMonth(now), -i);
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
      const idx = (d) => buckets.findIndex((b) => b.y === d.getFullYear() && b.m === d.getMonth());

      // préstamos por mes
      for (const l of loans) {
        const ds = loanDate(l);
        if (!ds) continue;
        const d = new Date(ds);
        const i = idx(d);
        if (i >= 0) buckets[i].loans += 1;
      }
      // pagos por mes (suma de montos)
      for (const p of payments) {
        const ds = paymentDate(p);
        if (!ds) continue;
        const d = new Date(ds);
        const i = idx(d);
        if (i >= 0) buckets[i].payments += toNum(p.amount);
      }
      // clientes por mes (altas)
      for (const c of clients) {
        const ds = clientDate(c);
        if (!ds) continue;
        const d = new Date(ds);
        const i = idx(d);
        if (i >= 0) buckets[i].clients += 1;
      }
      return buckets;
    }
  }, [loans, payments, clients]);

  // ====== Distribuciones por estado (en el periodo) ======
  const loansByStatus = useMemo(() => {
    const map = new Map();
    for (const l of loansInPeriod) {
      const s = (l.status || l.estado_prestamo || "").toLowerCase() || "desconocido";
      map.set(s, (map.get(s) || 0) + 1);
    }
    // Colores base
    const colorFor = (s) =>
      s === "active" ? "bg-secondary" :
      s === "completed" ? "bg-primary" :
      s === "overdue" ? "bg-destructive" :
      "bg-muted";
    return Array.from(map.entries()).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      color: colorFor(status),
    }));
  }, [loansInPeriod]);

  const paymentsByStatus = useMemo(() => {
    const map = new Map();
    for (const p of paymentsInPeriod) {
      const s = (p.status || "").toLowerCase() || "desconocido";
      map.set(s, (map.get(s) || 0) + 1);
    }
    const colorFor = (s) =>
      s === "paid" ? "bg-secondary" :
      s === "pending" ? "bg-yellow-500" :
      s === "overdue" ? "bg-destructive" :
      "bg-muted";
    return Array.from(map.entries()).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      color: colorFor(status),
    }));
  }, [paymentsInPeriod]);

  const handleExportReport = () => {
    toast({
      title: "Exportar",
      description: "Podemos exportar a CSV/Excel: dime en qué formato lo quieres y qué columnas incluir. 📄",
    });
  };

  const handleFilterChange = () => {
    toast({
      title: "Filtros avanzados",
      description: "Puedo agregar filtros por ruta, población, cliente y rango de fechas. Dime cuáles necesitas.",
    });
  };

  return (
    <>
      <Helmet>
        <title>Reportes y Análisis</title>
      </Helmet>

      <div className="space-y-6">
        <PageHeader
          title="Reportes y Análisis"
          description="Análisis del rendimiento basado en datos reales"
        >
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Seleccionar periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mes</SelectItem>
                <SelectItem value="quarter">Este Trimestre</SelectItem>
                <SelectItem value="year">Este Año</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleFilterChange}>
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>

            <Button onClick={handleExportReport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </PageHeader>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Prestado</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  ${stats.totalLoaned.toLocaleString("es-MX")}
                </div>
                <p className="text-xs text-muted-foreground">Promedio: ${stats.averageLoanAmount.toLocaleString("es-MX")}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recaudado</CardTitle>
                <TrendingUp className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">
                  ${stats.totalCollected.toLocaleString("es-MX")}
                </div>
                <p className="text-xs text-muted-foreground">Tasa de cobranza: {stats.collectionRate.toFixed(1)}%</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
                <BarChart3 className="h-4 w-4 text-gradient" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gradient">
                  {stats.activeLoans}
                </div>
                <p className="text-xs text-muted-foreground">en toda la cartera</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
                <Users className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{stats.totalClients}</div>
                <p className="text-xs text-muted-foreground">según estado del cliente</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Serie mensual & Distribuciones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.5 }}>
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
                  {monthlyData.map((data) => (
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
                              style={{ width: `${Math.min(100, (data.loans / Math.max(1, Math.max(...monthlyData.map(x => x.loans)))) * 100)}%` }}
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
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
