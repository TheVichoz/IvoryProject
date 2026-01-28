import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Search, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader';

const LoanCard = ({ loan }) => {
  const progress = loan.amount > 0 ? ((loan.amount - loan.remaining_balance) / loan.amount) * 100 : 0;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">Préstamo #{loan.id}</CardTitle>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Activo
            </span>
          </div>
          <p className="text-sm text-muted-foreground pt-1">{loan.client_name}</p>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-between">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Pagado</span>
              <span className="font-medium text-secondary">
                ${Number(loan.amount - loan.remaining_balance).toLocaleString('es-MX')}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-secondary to-primary h-2 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Pendiente</span>
              <span className="font-medium text-orange-600">
                ${Number(loan.remaining_balance).toLocaleString('es-MX')}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-4">
            Próximo pago: {new Date(loan.next_payment_date).toLocaleDateString('es-MX')}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const ActiveLoans = () => {
  const { loans, loading } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const activeLoans = loans.filter(l => l.status === 'active');
  
  const filteredLoans = activeLoans.filter(loan =>
    loan.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan.id.toString().includes(searchTerm)
  );

  return (
    <>
      <Helmet>
        <title>Préstamos Vigentes - FinanComunitaria</title>
      </Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Préstamos Vigentes"
          description="Lista de todos los préstamos activos actualmente."
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
          <div className="text-center py-12">Cargando préstamos...</div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {filteredLoans.map(loan => (
              <LoanCard key={loan.id} loan={loan} />
            ))}
          </motion.div>
        )}
        
        {filteredLoans.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <CreditCard className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No hay préstamos activos</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'No se encontraron coincidencias.' : 'Actualmente no hay préstamos en curso.'}
            </p>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default ActiveLoans;