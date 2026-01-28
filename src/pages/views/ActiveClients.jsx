import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useData } from '@/contexts/DataContext';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Search, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader';

const ClientCard = ({ client }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
  >
    <Card className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
      <CardHeader>
          <CardTitle className="text-lg">{client.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{client.email}</p>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1"><strong>Tel:</strong> {client.phone}</p>
          {client.address && <p className="text-sm text-muted-foreground line-clamp-1"><strong>Dir:</strong> {client.address}</p>}
        </div>
        <div className="text-xs text-muted-foreground mt-4">
          Registrado: {new Date(client.created_at).toLocaleDateString('es-MX')}
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const ActiveClients = () => {
  const { clients, loading } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const activeClients = clients.filter(c => c.status === 'active');
  
  const filteredClients = activeClients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <>
      <Helmet>
        <title>Clientes Activos - FinanComunitaria</title>
      </Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Clientes Activos"
          description="Lista de todos los clientes con estado activo."
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative"
        >
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </motion.div>

        {loading ? (
          <div className="text-center py-12">Cargando clientes...</div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {filteredClients.map(client => (
              <ClientCard key={client.id} client={client} />
            ))}
          </motion.div>
        )}
        
        {filteredClients.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <UserCheck className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No hay clientes activos</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'No se encontraron coincidencias' : 'Todos los clientes están inactivos o no hay clientes.'}
            </p>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default ActiveClients;