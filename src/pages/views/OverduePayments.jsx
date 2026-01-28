import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader';

const OverdueLoanCard = ({ loan }) => {
  const today = new Date();
  const nextPaymentDate = new Date(loan.next_payment_date);
  const daysOverdue = Math.floor((today - nextPaymentDate) / (1000 * 60 * 60 * 24));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-lg transition-shadow duration-300 border-destructive/50 h-full flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">Préstamo #{loan.id}</CardTitle>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-destructive">
              {daysOverdue} {daysOverdue === 1 ? 'día' : 'días'} de atraso
            </span>
          </div>
          <p className="text-sm text-muted-foreground pt-1">{loan.client_name}</p>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Fecha de pago: <span className="font-medium text-destructive">{nextPaymentDate.toLocaleDateString('es-MX')}</span></p>
            <p className="text-sm text-muted-foreground">Monto semanal: <span className="font-medium">${Number(loan.weekly_payment).toLocaleString('es-MX')}</span></p>
            <p className="text-sm text-muted-foreground">Saldo pendiente: <span className="font-medium">${Number(loan.remaining_balance).toLocaleString('es-MX')}</span></p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const OverduePayments = () => {
  const { loans, loading } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueLoans = loans.filter(l => 
    l.status === 'active' && 
    l.next_payment_date && 
    new Date(l.next_payment_date) < today
  );
  
  const filteredLoans = overdueLoans.filter(loan =>
    loan.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan.id.toString().includes(searchTerm)
  );

  return (
    <>
      <Helmet>
        <title>Pagos Atrasados - FinanComunitaria</title>
      </Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Pagos Atrasados"
          description="Préstamos con pagos vencidos que requieren atención."
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative"
        >
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o ID de préstamo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </motion.div>

        {loading ? (
          <div className="text-center py-12">Cargando datos...</div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {filteredLoans.map(loan => (
              <OverdueLoanCard key={loan.id} loan={loan} />
            ))}
          </motion.div>
        )}
        
        {filteredLoans.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <CheckCircle className="h-16 w-16 mx-auto text-secondary mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">¡Todo en orden!</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'No se encontraron coincidencias.' : 'No hay préstamos con pagos atrasados.'}
            </p>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default OverduePayments;