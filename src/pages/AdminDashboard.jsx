// src/pages/AdminDashboard.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Plus,
  FileSpreadsheet,
  Banknote,
} from 'lucide-react';
import { AdminNav } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { useData } from '@/contexts/DataContext';
import PageHeader from '@/components/PageHeader';
import { useRole } from '@/hooks/useRole'; // 👈 permisos (ADMIN_GENERAL = puede escribir)

const ScreenLoader = () => (
  <div className="flex justify-center items-center h-[60vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const EmptyState = ({ icon, text }) => (
  <div className="text-center py-10">
    <div className="mx-auto mb-2 text-muted-foreground">{icon}</div>
    <p className="text-muted-foreground text-sm">{text}</p>
  </div>
);

const StatCard = ({ title, value, icon, description, delay, to, colorClass }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
  >
    <Link to={to} className="block">
      <Card className="hover:shadow-md transition-shadow duration-300 hover:border-primary/30 overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1 ${colorClass}`}></div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  </motion.div>
);

/* ===== Fechas en local ===== */
const parseLocalISO = (v) => {
  if (!v) return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function AdminDashboard() {
  const { loans = [], payments = [], loading = false, clients = [] } = useData() || {};
  const navigate = useNavigate();
  const { canWrite } = useRole(); // ✅ ADMIN_GENERAL true, ADMIN_RUTA false

  const clientsById = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const loansById = useMemo(() => {
    const m = new Map();
    for (const l of loans) m.set(l.id, l);
    return m;
  }, [loans]);

  const getClientNameFromIds = (client_id, loan_id) => {
    if (client_id && clientsById.get(client_id)?.nombre) {
      return clientsById.get(client_id).nombre;
    }
    if (loan_id && loansById.get(loan_id)) {
      const cid = loansById.get(loan_id).client_id;
      if (cid && clientsById.get(cid)?.nombre) return clientsById.get(cid).nombre;
      if (loansById.get(loan_id).client_name) return loansById.get(loan_id).client_name;
    }
    return 'Cliente desconocido';
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const overdueLoans = useMemo(
    () =>
      loans.filter(
        l =>
          l.status === 'active' &&
          l.next_payment_date &&
          parseLocalISO(l.next_payment_date) < today
      ).length,
    [loans, today]
  );

  const recentActivities = useMemo(() => {
    const acts = [
      ...payments.slice(-10).map(p => ({
        id: `p-${p.id}`,
        type: 'payment',
        text: `Pago de ${p.client_name || getClientNameFromIds(p.client_id, p.loan_id)}`,
        amount: Number(p.amount || 0),
        date: p.created_at || p.date || null,
      })),
      ...loans.slice(-10).map(l => ({
        id: `l-${l.id}`,
        type: 'loan',
        text: `Nuevo préstamo a ${l.client_name || getClientNameFromIds(l.client_id, l.id)}`,
        amount: Number(l.amount || l.monto || 0),
        date: l.created_at || l.fecha || null,
      })),
    ]
      .filter(a => a.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
    return acts;
  }, [payments, loans, clientsById, loansById]);

  const upcomingPayments = useMemo(() => {
    const ups = loans
      .filter(l => l.status === 'active' && l.next_payment_date && parseLocalISO(l.next_payment_date) >= today)
      .map(l => ({
        ...l,
        _client_name: l.client_name || getClientNameFromIds(l.client_id, l.id),
      }))
      .sort((a, b) => parseLocalISO(a.next_payment_date) - parseLocalISO(b.next_payment_date))
      .slice(0, 5);
    return ups;
  }, [loans, today, clientsById, loansById]);

  const handleAddClient = () => navigate('/admin/clients/add');

  return (
    <>
      <Helmet>
        <title>Panel Principal - FinanComunitaria</title>
      </Helmet>

      <PageHeader
        title="Panel Principal"
        description="Vista general de la actividad financiera."
        showBackButton={false}
      >
        {/* 👇 Solo ADMIN_GENERAL ve el botón de alta */}
        {canWrite && (
          <Button onClick={handleAddClient}>
            <Plus className="h-4 w-4 mr-2" /> Añadir Cliente
          </Button>
        )}
      </PageHeader>

      <AdminNav />

      {loading && clients.length === 0 ? (
        <ScreenLoader />
      ) : (
        <div className="space-y-8">
          {/* Tarjetas de acceso rápido */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <StatCard
              to="/admin/calendar"
              title="Calendario"
              value="Abrir"
              icon={<Calendar className="h-5 w-5 text-secondary" />}
              description="Agenda de cobros y visitas"
              delay={0.1}
              colorClass="bg-secondary"
            />
            <StatCard
              to="/admin/reports"
              title="Reportes"
              value="Abrir"
              icon={<BarChart3 className="h-5 w-5 text-primary" />}
              description="Indicadores y descargas"
              delay={0.2}
              colorClass="bg-primary"
            />
            <StatCard
              to="/admin/views/overdue-payments"
              title="Pagos Atrasados"
              value={overdueLoans}
              icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
              description="Requieren atención inmediata"
              delay={0.3}
              colorClass="bg-destructive"
            />
            <StatCard
              to="/admin/group-sheet"
              title="Hoja de grupo"
              value="Abrir"
              icon={<FileSpreadsheet className="h-5 w-5 text-emerald-600" />}
              description="Semanas 1–14 y multa (15)"
              delay={0.4}
              colorClass="bg-emerald-500"
            />
            <StatCard
              to="/admin/daily-collections"
              title="Corte Diario"
              value="Abrir"
              icon={<Banknote className="h-5 w-5 text-lime-600" />}
              description="Pagos por población y fecha"
              delay={0.5}
              colorClass="bg-lime-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Actividad reciente */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Actividad Reciente</CardTitle>
                  <CardDescription>Últimos movimientos registrados en la plataforma.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivities.length > 0 ? (
                      recentActivities.map(act => (
                        <div key={act.id} className="flex justify-between items-center text-sm">
                          <p className="text-foreground">{act.text}</p>
                          <span
                            className={`font-semibold ${
                              act.type === 'payment' ? 'text-secondary' : 'text-primary'
                            }`}
                          >
                            +${Number(act.amount || 0).toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <EmptyState icon={<CheckCircle className="h-10 w-10" />} text="No hay actividad reciente." />
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Próximos pagos */}
            <motion.div
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Próximos Pagos</CardTitle>
                  <CardDescription>Pagos esperados en los próximos días.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {upcomingPayments.length > 0 ? (
                      upcomingPayments.map(loan => (
                        <div key={loan.id} className="flex justify-between items-center text-sm">
                          <div className="text-foreground">
                            <p>{loan._client_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {parseLocalISO(loan.next_payment_date)?.toLocaleDateString('es-MX', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                            </p>
                          </div>
                          <span className="font-semibold text-foreground">
                            ${Number(loan.weekly_payment || 0).toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <EmptyState icon={<CheckCircle className="h-10 w-10" />} text="No hay pagos próximos." />
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      )}
    </>
  );
}
