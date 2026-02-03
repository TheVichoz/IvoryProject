import React from 'react';
import PropTypes from 'prop-types';
import { Label } from '@/components/ui/label';

/* ================== Utils ================== */
const getTypeIcon = (type) => {
  switch (type) {
    case 'Electrónico':
      return '📱';
    case 'Mueble':
      return '🪑';
    case 'Vehículo':
      return '🚗';
    case 'Joyería':
      return '💍';
    case 'Herramienta':
      return '🔧';
    case 'Electrodoméstico':
      return '🏠';
    default:
      return '📦';
  }
};

/* ================== Componente ================== */
const GuaranteeDetails = ({ guarantee }) => {
  if (!guarantee) return null;

  const {
    type,
    condition,
    client_name,
    loan_id,
    description,
    estimated_value,
    photos,
  } = guarantee;

  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  return (
    <div className="space-y-4 max-h-96 overflow-y-auto p-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Tipo</Label>
          <p className="text-gray-900 flex items-center">
            <span className="text-xl mr-2">{getTypeIcon(type)}</span>
            {type || 'Sin especificar'}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-600">Condición</Label>
          <p className="text-gray-900">{condition || 'Sin especificar'}</p>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Cliente</Label>
        <p className="text-gray-900">{client_name || 'Sin especificar'}</p>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Préstamo Asociado</Label>
        <p className="text-gray-900">#{loan_id ?? 'N/A'}</p>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Descripción</Label>
        <p className="text-gray-900">{description || 'Sin especificar'}</p>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-600">Valor Estimado</Label>
        <p className="text-2xl font-bold text-green-600">
          ${Number(estimated_value ?? 0).toLocaleString('es-MX')}
        </p>
      </div>

      {hasPhotos && (
        <div>
          <Label className="text-sm font-medium text-gray-600">Fotografías</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {photos.map((photo) => (
              <img
                key={photo}
                src={photo}
                alt={`${description || 'Garantía'} - Foto`}
                className="w-full h-32 object-cover rounded-lg border"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ================== PropTypes ================== */
GuaranteeDetails.propTypes = {
  guarantee: PropTypes.shape({
    type: PropTypes.string,
    condition: PropTypes.string,
    client_name: PropTypes.string,
    loan_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    description: PropTypes.string,
    estimated_value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    photos: PropTypes.arrayOf(PropTypes.string),
  }),
};

GuaranteeDetails.defaultProps = {
  guarantee: null,
};

export default GuaranteeDetails;
