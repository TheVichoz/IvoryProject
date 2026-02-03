// src/components/details/ClientDetails.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';

const InfoField = ({ label, value, className }) => (
  <div className={className}>
    <Label className="text-sm font-medium text-gray-500">{label}</Label>
    <p className="text-gray-900 text-sm">{value ?? 'Sin especificar'}</p>
  </div>
);

InfoField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.node]),
  className: PropTypes.string,
};

InfoField.defaultProps = {
  value: null,
  className: '',
};

/* ===== Toggle de visibilidad del ID de cliente ===== */
const SHOW_CLIENT_ID = false;

/* ================== Semáforo (lógica) ================== */
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
  if (!client || client.status !== 'active') return null;
  if (!Array.isArray(loans) || loans.length === 0) return null;

  const activeLoan = loans.find(
    (l) =>
      String(l.client_id) === String(client.id) &&
      (l.status === 'active' || (l.remaining_balance ?? 0) > 0)
  );
  if (!activeLoan) return null;

  const rawDue = normalizeDueDate(activeLoan);

  if (activeLoan.status === 'overdue') return { color: 'red', label: 'Pago atrasado' };

  if (rawDue) {
    const due = new Date(rawDue);
    const today = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const days =
      (startOf(due).getTime() - startOf(today).getTime()) / (1000 * 60 * 60 * 24);

    if (days < 0) return { color: 'red', label: 'Pago atrasado' };
    if (days <= DUE_SOON_DAYS) return { color: 'yellow', label: 'Pago próximo' };
    return { color: 'green', label: 'Al corriente' };
  }

  return { color: 'green', label: 'Al corriente' };
}

function getPalette(color) {
  if (color === 'green') {
    return { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-600' };
  }
  if (color === 'yellow') {
    return { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' };
  }
  return { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-600' };
}

function SemaphoreBadge({ sem }) {
  if (!sem) return null;

  const palette = getPalette(sem.color);

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

SemaphoreBadge.propTypes = {
  sem: PropTypes.shape({
    color: PropTypes.oneOf(['green', 'yellow', 'red']).isRequired,
    label: PropTypes.string.isRequired,
  }),
};

SemaphoreBadge.defaultProps = {
  sem: null,
};

/* ================== Componente ================== */
const ClientDetails = ({ client, aval, loans }) => {
  if (!client) return null;

  const fechaRegistro = client?.fecha_visita
    ? new Date(`${client.fecha_visita}T00:00:00`).toLocaleDateString('es-MX')
    : 'N/A';

  const miembroDesde = client?.created_at
    ? new Date(client.created_at).toLocaleDateString('es-MX')
    : 'Sin especificar';

  const semaphore = getSemaphoreForClient(client, loans);

  const clientAddress = client?.address || client?.direccion;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {client?.foto_url ? (
          <img
            src={client.foto_url}
            alt={`Foto de ${client.name}`}
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border-4 border-white shadow-md">
            <Camera className="h-10 w-10 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 w-full">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Izquierda: nombre + correo */}
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold text-gray-800">{client.name}</h3>

                {/* Badge de estado */}
                <Badge
                  variant={client.status === 'active' ? 'default' : 'secondary'}
                  className={client.status === 'active' ? 'bg-green-600' : 'bg-gray-500'}
                >
                  {client.status === 'active' ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <p className="text-muted-foreground">{client.email || 'Sin especificar'}</p>
            </div>

            {/* Derecha: semáforo */}
            <div className="flex flex-col items-start sm:items-end gap-1">
              {semaphore && <SemaphoreBadge sem={semaphore} />}
            </div>
          </div>
        </div>
      </div>

      {/* Información del cliente */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
        {/* 🔒 ID oculto por flag */}
        {SHOW_CLIENT_ID && <InfoField label="ID de Cliente" value={client.id} />}

        <InfoField label="Teléfono" value={client.phone} />
        <InfoField label="Correo Electrónico" value={client.email} />
        <InfoField label="Número de INE (Trasera)" value={client.numero_ine} />
        <InfoField label="Población" value={client.poblacion} />
        <InfoField label="Ruta" value={client.ruta} />
        <InfoField label="Grupo" value={client.grupo} />
        <InfoField label="Fecha de Registro/Visita" value={fechaRegistro} />
        <InfoField label="Miembro desde" value={miembroDesde} />
        <InfoField label="Dirección" value={clientAddress} className="lg:col-span-3" />
      </div>

      {/* Información del aval */}
      {aval && (
        <div>
          <h4 className="text-lg font-semibold text-gray-700 mt-6 mb-2 border-b pb-2">
            Información del Aval
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <InfoField label="Nombre del Aval" value={aval.nombre} />
            <InfoField label="Teléfono del Aval" value={aval.telefono} />
            <InfoField label="Correo Electrónico (Aval)" value={aval.email} />
            <InfoField label="Número de INE (Aval)" value={aval.numero_ine} />
            <InfoField
              label="Dirección del Aval"
              value={aval.direccion}
              className="lg:col-span-2"
            />
          </div>
        </div>
      )}
    </div>
  );
};

ClientDetails.propTypes = {
  client: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    status: PropTypes.string,
    email: PropTypes.string,
    phone: PropTypes.string,
    numero_ine: PropTypes.string,
    poblacion: PropTypes.string,
    ruta: PropTypes.string,
    grupo: PropTypes.string,
    fecha_visita: PropTypes.string,
    created_at: PropTypes.string,
    foto_url: PropTypes.string,
    address: PropTypes.string,
    direccion: PropTypes.string,
  }),
  aval: PropTypes.shape({
    nombre: PropTypes.string,
    telefono: PropTypes.string,
    email: PropTypes.string,
    numero_ine: PropTypes.string,
    direccion: PropTypes.string,
  }),
  loans: PropTypes.arrayOf(
    PropTypes.shape({
      client_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      status: PropTypes.string,
      remaining_balance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      next_due_date: PropTypes.string,
      next_payment_date: PropTypes.string,
      due_date: PropTypes.string,
      nextDate: PropTypes.string,
    })
  ),
};

ClientDetails.defaultProps = {
  client: null,
  aval: null,
  loans: [],
};

export default ClientDetails;
