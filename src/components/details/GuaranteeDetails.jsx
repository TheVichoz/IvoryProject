import React from 'react';
import { Label } from '@/components/ui/label';

const getTypeIcon = (type) => {
  switch (type) {
    case 'Electrónico': return '📱';
    case 'Mueble': return '🪑';
    case 'Vehículo': return '🚗';
    case 'Joyería': return '💍';
    case 'Herramienta': return '🔧';
    case 'Electrodoméstico': return '🏠';
    default: return '📦';
  }
};

const GuaranteeDetails = ({ guarantee }) => {
  if (!guarantee) return null;

  return (
    <div className="space-y-4 max-h-96 overflow-y-auto p-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium text-gray-600">Tipo</Label>
          <p className="text-gray-900 flex items-center">
            <span className="text-xl mr-2">{getTypeIcon(guarantee.type)}</span>
            {guarantee.type}
          </p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-600">Condición</Label>
          <p className="text-gray-900">{guarantee.condition}</p>
        </div>
      </div>
      
      <div>
        <Label className="text-sm font-medium text-gray-600">Cliente</Label>
        <p className="text-gray-900">{guarantee.client_name}</p>
      </div>
      
      <div>
        <Label className="text-sm font-medium text-gray-600">Préstamo Asociado</Label>
        <p className="text-gray-900">#{guarantee.loan_id}</p>
      </div>
      
      <div>
        <Label className="text-sm font-medium text-gray-600">Descripción</Label>
        <p className="text-gray-900">{guarantee.description}</p>
      </div>
      
      <div>
        <Label className="text-sm font-medium text-gray-600">Valor Estimado</Label>
        <p className="text-2xl font-bold text-green-600">
          ${Number(guarantee.estimated_value).toLocaleString('es-MX')}
        </p>
      </div>
      
      {guarantee.photos && guarantee.photos.length > 0 && (
        <div>
          <Label className="text-sm font-medium text-gray-600">Fotografías</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {guarantee.photos.map((photo, index) => (
              <img 
                key={index}
                src={photo} 
                alt={`${guarantee.description} - Foto ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg border"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GuaranteeDetails;