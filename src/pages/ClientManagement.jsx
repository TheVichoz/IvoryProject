// src/pages/admin/ClientManagement.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import {
  Plus,
  Search,
  Edit,
  Eye,
  Trash2,
  MoreVertical,
  MapPin,
  Users,
  Route as RouteIcon,
  Filter,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/components/ui/use-toast';
import ClientForm from '@/components/forms/ClientForm';
import PageHeader from '@/components/PageHeader';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useRole } from '@/hooks/useRole'; // 👈 usamos canWrite

/* ===================== Toggle de visibilidad ===================== */
// Si en el futuro quieren volver a mostrar el ID del cliente en la tarjeta,
// basta con poner este flag en true.
const SHOW_CLIENT_ID = false;

/* ========== Util: estado derivado por préstamos ========== */
// Si remaining_balance es NULL/no numérico, asumimos que HAY saldo (para no “apagar” al cliente).
function getClientDerivedStatus(client, loans) {
  const hasActive = loans?.some((l) => {
    const same = String(l.client_id) === String(client.id);
    const isActive = (l.status || '').toLowerCase() === 'active';
    const rb = Number(l.remaining_balance);
    const hasBalance = Number.isFinite(rb) ? rb > 0 : true; // fallback
    return same && isActive && hasBalance;
  });
  return hasActive ? 'active' : 'inactive';
}

/* ========== Semáforo (lógica) ========== */
const DUE_SOON_DAYS = 3;

function normalizeDueDate(loan) {
  return (
    loan?.next_due_date ||
    loan?.next_payment_date ||
    loan?.due_date ||
    loan?.nextDate ||
    null
  );
}

function getSemaphoreForClient(client, loans) {
  if (!client) return null;
  if (!Array.isArray(loans) || loans.length === 0) return null;

  const activeLoan = loans.find((l) => {
    const same = String(l.client_id) === String(client.id);
    const isActive = (l.status || '').toLowerCase() === 'active';
    const rb = Number(l.remaining_balance);
    const hasBalance = Number.isFinite(rb) ? rb > 0 : true; // fallback
    return same && isActive && hasBalance;
  });
  if (!activeLoan) return null;

  const rawDue = normalizeDueDate(activeLoan);

  if ((activeLoan.status || '').toLowerCase() === 'overdue') {
    return { color: 'red', label: 'Pago atrasado' };
  }

  if (rawDue) {
    const due = new Date(rawDue);
    const today = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days =
      (startOf(due).getTime() - startOf(today).getTime()) /
      (1000 * 60 * 60 * 24);

    if (days < 0) return { color: 'red', label: 'Pago atrasado' };
    if (days <= DUE_SOON_DAYS) return { color: 'yellow', label: 'Pago próximo' };
    return { color: 'green', label: 'Al corriente' };
  }

  return { color: 'green', label: 'Al corriente' };
}

/* ========== Semáforo (UI badge) ========== */
function SemaphoreBadge({ sem }) {
  if (!sem) return null;

  const palette =
    sem.color === 'green'
      ? { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-600' }
      : sem.color === 'yellow'
      ? { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' }
      : { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-600' };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${palette.bg} ${palette.text}`}
      title={sem.label}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${palette.dot}`} />
      {sem.label}
    </span>
  );
}

/* ========== Tarjeta de cliente ========== */
const ClientCard = ({
  client,
  onSelect,
  onEdit,
  onDelete,
  isAdmin,
  semaphore,
  derivedStatus,
}) => {
  const { canWrite } = useRole(); // 👈 ADMIN_GENERAL = true, ADMIN_RUTA = false

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
        <CardHeader className="flex-row items-start justify-between">
          {/* Izquierda: Nombre + (ID ocultable) + Email */}
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">{client.name}</CardTitle>

            {/* 🔒 Ocultamos el ID según flag */}
            {SHOW_CLIENT_ID && (
              <p className="text-xs text-muted-foreground font-mono select-all">
                ID: {client.id}
              </p>
            )}

            <p className="text-sm text-muted-foreground truncate">
              {client.email}
            </p>
          </div>

          {/* Derecha: badges en columna */}
          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                derivedStatus === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {derivedStatus === 'active' ? 'Activo' : 'Inactivo'}
            </span>
            {semaphore && <SemaphoreBadge sem={semaphore} />}
          </div>
        </CardHeader>

        <CardContent className="flex-grow flex flex-col justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Tel:</strong> {client.phone}
            </p>
            {client.address && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                <strong>Dir:</strong> {client.address}
              </p>
            )}

            {/* Población, Grupo y Ruta */}
            <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
              {client.poblacion && (
                <p>
                  <strong>Población:</strong> {client.poblacion}
                </p>
              )}
              {client.grupo && (
                <p>
                  <strong>Grupo:</strong> {client.grupo}
                </p>
              )}
              {client.ruta && (
                <p>
                  <strong>Ruta:</strong> {client.ruta}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" onClick={() => onSelect(client)}>
              <Eye className="h-4 w-4 mr-1" /> Ver Ficha
            </Button>

            {/* 👇 Menú de acciones: solo si puede escribir */}
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {/* Editar: ADMIN_GENERAL */}
                  <DropdownMenuItem onClick={() => onEdit(client)}>
                    <Edit className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  {/* Eliminar: solo admin (si tu contexto distingue esto) */}
                  {isAdmin && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(client)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

/* ========== Página ========== */
const ClientManagement = () => {
  const { clients, loans = [], addClient, updateClient, deleteClient, loading } =
    useData();
  const { isAdmin } = useAuth(); // mantenemos isAdmin para eliminar
  const { canWrite } = useRole(); // 👈 controlar visibilidad de acciones (ADMIN_GENERAL)

  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [editingClient, setEditingClient] = useState(null);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Filtros (“all” en UI -> '' en estado)
  const [filterPoblacion, setFilterPoblacion] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterRuta, setFilterRuta] = useState('');
  const toState = (v) => (v === 'all' ? '' : v);
  const toUI = (v) => (v ? v : 'all');

  // Comparador explícito (arregla los issues de Sonar en .sort())
  const sortEs = (a, b) =>
    String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });

  // Valores únicos
  const poblaciones = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.poblacion).filter(Boolean))).sort(
        sortEs
      ),
    [clients]
  );
  const grupos = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.grupo).filter(Boolean))).sort(
        sortEs
      ),
    [clients]
  );
  const rutas = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.ruta).filter(Boolean))).sort(
        sortEs
      ),
    [clients]
  );

  // Búsqueda por ID exacto o nombre (se conserva la capacidad aunque no se muestre visualmente)
  const raw = searchTerm.trim();
  const term = raw.toLowerCase();
  const idQueryMatch = /^#?\d+$/.test(raw) || /^id:\s*\d+$/i.test(raw);
  const idNeedle = idQueryMatch
    ? raw.startsWith('#')
      ? raw.slice(1)
      : raw.toLowerCase().startsWith('id:')
      ? raw.slice(3).trim()
      : raw
    : null;

  // Filtrado combinado
  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      idNeedle !== null
        ? String(client.id) === String(idNeedle)
        : (client.name?.toLowerCase() || '').includes(term);
    if (!matchesSearch) return false;

    if (filterPoblacion && client.poblacion !== filterPoblacion) return false;
    if (filterGrupo && client.grupo !== filterGrupo) return false;
    if (filterRuta && client.ruta !== filterRuta) return false;

    return true;
  });

  const handleClearFilters = () => {
    setFilterPoblacion('');
    setFilterGrupo('');
    setFilterRuta('');
  };

  const handleFormSubmit = async (clientData) => {
    try {
      if (editingClient) {
        await updateClient(editingClient.id, clientData);
        toast({
          title: 'Cliente actualizado',
          description: 'Los datos del cliente se han guardado.',
        });
      } else {
        const newClient = await addClient(clientData);
        toast({
          title: 'Cliente agregado',
          description: 'El nuevo cliente ha sido registrado.',
        });
        navigate(`/admin/clients/${newClient.id}`);
      }
      setIsFormOpen(false);
      setEditingClient(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const handleSelectClient = (client) => navigate(`/admin/clients/${client.id}`);
  const handleEditClient = (client) => {
    setEditingClient(client);
    setIsFormOpen(true);
  };
  const handleAddNew = () => navigate('/admin/clients/add');

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      await deleteClient(clientToDelete.id);
      toast({
        title: 'Cliente eliminado',
        description: `${clientToDelete.name} ha sido eliminado.`,
      });
      setClientToDelete(null);
    } catch (error) {
      const rawErr = (error?.message || '').toLowerCase();
      const readable = rawErr.includes('cliente_tiene_prestamo_activo')
        ? 'No se puede eliminar: el cliente tiene un préstamo vigente.'
        : error?.message || 'Error al eliminar';
      toast({
        variant: 'destructive',
        title: 'No se pudo eliminar',
        description: readable,
      });
    }
  };

  // Totales
  const total = clients.length;
  const visibles = filteredClients.length;

  return (
    <>
      <Helmet>
        <title>Gestión de Clientes - FinanComunitaria</title>
      </Helmet>

      <div className="space-y-6">
        <PageHeader
          title="Gestión de Clientes"
          description="Administra la información de todos los clientes"
          showBackButton={false}
        >
          {/* 👇 Botón solo para ADMIN_GENERAL */}
          {canWrite && (
            <Button onClick={handleAddNew}>
              <Plus className="h-4 w-4 mr-2" /> Agregar Cliente
            </Button>
          )}
        </PageHeader>

        {/* Toolbar: buscador + filtros */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          {/* IZQUIERDA: Buscador */}
          <div className="w-full md:max-w-xl">
            <Label
              htmlFor="client-search"
              className="mb-1 block text-sm text-muted-foreground"
            >
              Búsqueda rápida
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="client-search"
                placeholder="Buscar por nombre o ID exacto (#15, id:15, 15)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </div>

          {/* DERECHA: Filtros */}
          <div className="w-full md:w-auto">
            <div className="flex items-center justify-between md:justify-end gap-3 mb-2">
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>Filtros</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Mostrando <b>{visibles}</b> de <b>{total}</b>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-2 md:flex md:items-end">
              {/* Población */}
              <div className="w-full md:w-48">
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Filtrar por población
                </Label>
                <Select
                  value={toUI(filterPoblacion)}
                  onValueChange={(v) => setFilterPoblacion(toState(v))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {poblaciones.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Grupo */}
              <div className="w-full md:w-40">
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Filtrar por grupo
                </Label>
                <Select
                  value={toUI(filterGrupo)}
                  onValueChange={(v) => setFilterGrupo(toState(v))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {grupos.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ruta */}
              <div className="w-full md:w-36">
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <RouteIcon className="h-3.5 w-3.5" />
                  Filtrar por ruta
                </Label>
                <Select
                  value={toUI(filterRuta)}
                  onValueChange={(v) => setFilterRuta(toState(v))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {rutas.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Limpiar */}
              <div className="w-full sm:w-auto md:ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="w-full md:w-auto h-10 gap-1"
                >
                  <XCircle className="h-4 w-4" /> Limpiar filtros
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-12">Cargando clientes...</div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredClients.map((client) => {
              const derivedStatus = getClientDerivedStatus(client, loans);
              const sem = getSemaphoreForClient(client, loans);
              return (
                <ClientCard
                  key={client.id}
                  client={client}
                  onSelect={handleSelectClient}
                  onEdit={handleEditClient}
                  onDelete={(c) => setClientToDelete(c)}
                  isAdmin={isAdmin}
                  semaphore={sem}
                  derivedStatus={derivedStatus}
                />
              );
            })}
          </motion.div>
        )}

        {filteredClients.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="text-muted-foreground mb-4">
              <Search className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No se encontraron clientes
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer cliente'}
            </p>
          </motion.div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <ClientForm
            client={editingClient}
            onSubmit={handleFormSubmit}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Eliminar: el botón solo se muestra a admin, pero dejamos el modal por si llega a abrirse */}
      <AlertDialog
        open={!!clientToDelete}
        onOpenChange={() => setClientToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se intentará eliminar al cliente "
              {clientToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ClientManagement;
