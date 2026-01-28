import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, DollarSign, User } from 'lucide-react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import PageHeader from '@/components/PageHeader';

const Calendar = () => {
  const { profile } = useAuth();
  const { loans } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());

  const displayLoans = profile?.role === 'ADMIN_GENERAL' 
    ? loans 
    : loans.filter(loan => loan.client_name === profile?.name);

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getPaymentsForDate = (date) => {
    const dateStr = formatDate(date.getFullYear(), date.getMonth(), date.getDate());
    return displayLoans.filter(loan => loan.next_payment_date === dateStr);
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const today = new Date();
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const calendarDays = [];
  
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const upcomingPayments = displayLoans
    .filter(loan => {
      const paymentDate = new Date(loan.next_payment_date);
      const today = new Date();
      const diffTime = paymentDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    })
    .sort((a, b) => new Date(a.next_payment_date) - new Date(b.next_payment_date));

  return (
    <>
      <Helmet>
        <title>Calendario de Pagos - FinanComunitaria</title>
        <meta name="description" content="Visualiza y gestiona el calendario de pagos de préstamos" />
      </Helmet>

      <div className="space-y-6">
        <PageHeader
          title="Calendario de Pagos"
          description={profile?.role === 'ADMIN_GENERAL' 
              ? 'Visualiza todos los pagos programados en el calendario' 
              : 'Consulta las fechas de tus próximos pagos'
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <CalendarIcon className="h-5 w-5 mr-2 text-primary" />
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </CardTitle>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigateMonth(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigateMonth(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {dayNames.map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (!day) {
                      return <div key={index} className="p-2 h-20"></div>;
                    }
                    
                    const isToday = 
                      day === today.getDate() &&
                      currentDate.getMonth() === today.getMonth() &&
                      currentDate.getFullYear() === today.getFullYear();
                    
                    const dayPayments = getPaymentsForDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                    
                    return (
                      <motion.div
                        key={day}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.01 * index }}
                        className={`p-2 h-20 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                          isToday 
                            ? 'bg-blue-100 border-primary/50' 
                            : dayPayments.length > 0 
                              ? 'bg-green-50 border-secondary/50' 
                              : 'bg-card border-border'
                        }`}
                      >
                        <div className="text-sm font-medium text-foreground">{day}</div>
                        {dayPayments.length > 0 && (
                          <div className="mt-1">
                            <div className="text-xs bg-secondary text-secondary-foreground px-1 py-0.5 rounded">
                              {dayPayments.length} pago{dayPayments.length > 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-orange-600" />
                  Próximos Pagos
                </CardTitle>
                <CardDescription>Pagos programados para los próximos 7 días</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingPayments.length > 0 ? (
                    upcomingPayments.map((loan) => {
                      const paymentDate = new Date(loan.next_payment_date);
                      const today = new Date();
                      const diffTime = paymentDate - today;
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      return (
                        <motion.div
                          key={loan.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className={`p-3 rounded-lg border ${
                            diffDays === 0 
                              ? 'bg-red-50 border-red-200' 
                              : diffDays <= 2 
                                ? 'bg-orange-50 border-orange-200' 
                                : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span className="font-medium text-foreground">{loan.client_name}</span>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              diffDays === 0 
                                ? 'bg-red-100 text-red-800' 
                                : diffDays <= 2 
                                  ? 'bg-orange-100 text-orange-800' 
                                  : 'bg-blue-100 text-blue-800'
                            }`}>
                              {diffDays === 0 ? 'Hoy' : `${diffDays} día${diffDays > 1 ? 's' : ''}`}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                              <DollarSign className="h-4 w-4 mr-1" />
                              ${loan.weekly_payment.toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Préstamo #{loan.id}
                            </div>
                          </div>
                          
                          <div className="text-xs text-muted-foreground mt-1">
                            {paymentDate.toLocaleDateString('es-ES', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No hay pagos próximos</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default Calendar;