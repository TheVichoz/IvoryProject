import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const guaranteeTypes = ['Prendaria', 'Hipotecaria', 'Aval', 'Depósito'];

const GuaranteeForm = ({ guarantee, client, clientLoans, onSubmit, onCancel }) => {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    client_id: '',
    loan_id: '',
    type: '',
    amount: '',
    owner_name: '',
    relation: '',
    document_ref: '',
    description: '',
    evaluation_date: '',
    status: 'vigente',
  });

  useEffect(() => {
    if (guarantee) {
      setFormData({
        client_id: guarantee.client_id?.toString() || '',
        loan_id: guarantee.loan_id?.toString() || '',
        type: guarantee.type || '',
        amount: guarantee.amount || '',
        owner_name: guarantee.owner_name || '',
        relation: guarantee.relation || '',
        document_ref: guarantee.document_ref || '',
        description: guarantee.description || '',
        evaluation_date: guarantee.evaluation_date || '',
        status: guarantee.status || 'vigente',
      });
    } else if (client) {
      setFormData({
        client_id: client.id.toString(),
        loan_id: '',
        type: '',
        amount: '',
        owner_name: client.name,
        relation: 'Titular',
        document_ref: '',
        description: '',
        evaluation_date: new Date().toISOString().split('T')[0],
        status: 'vigente',
      });
    }
  }, [guarantee, client]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.type || !formData.amount || !formData.owner_name) {
      toast({
        variant: "destructive",
        title: "Campos requeridos",
        description: "Cliente, tipo, valor y propietario son obligatorios."
      });
      return;
    }
    onSubmit({
      ...formData,
      loan_id: formData.loan_id || null,
      created_by: profile.id,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="text-sm md:text-base">
      <DialogHeader className="space-y-1">
        <DialogTitle className="text-lg md:text-xl">
          {guarantee ? 'Editar Garantía' : 'Añadir Nueva Garantía'}
        </DialogTitle>
        <DialogDescription className="text-xs md:text-sm">
          {guarantee
            ? 'Modifica la información de la garantía.'
            : `Completa la información de la nueva garantía para ${client?.name ?? 'el cliente'}.`}
        </DialogDescription>
      </DialogHeader>

      {/* Cuerpo con scroll solo aquí para móviles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
        {/* Cliente (solo lectura) */}
        <div className="space-y-2">
          <Label>Cliente</Label>
          <Input value={client?.name || 'N/A'} readOnly disabled className="w-full" />
        </div>

        {/* Préstamo (opcional) */}
        <div className="space-y-2">
          <Label htmlFor="loan_id">Préstamo Asociado (Opcional)</Label>
          <Select
            name="loan_id"
            value={formData.loan_id}
            onValueChange={(v) => handleSelectChange('loan_id', v)}
            disabled={!clientLoans || clientLoans.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un préstamo activo" />
            </SelectTrigger>
            <SelectContent className="w-full">
              {clientLoans && clientLoans.length > 0 ? (
                clientLoans.map(loan => (
                  <SelectItem key={loan.id} value={loan.id.toString()}>
                    Préstamo de ${Number(loan.amount).toLocaleString('es-MX')} ({new Date(loan.start_date).toLocaleDateString()})
                  </SelectItem>
                ))
              ) : (
                <div className="p-3 text-xs text-muted-foreground">No hay préstamos activos.</div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Tipo */}
        <div className="space-y-2">
          <Label htmlFor="type">Tipo de Garantía *</Label>
          <Select
            name="type"
            value={formData.type}
            onValueChange={(v) => handleSelectChange('type', v)}
            required
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un tipo" />
            </SelectTrigger>
            <SelectContent className="w-full">
              {guaranteeTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Valor */}
        <div className="space-y-2">
          <Label htmlFor="amount">Valor (MXN) *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={handleChange}
            required
            className="w-full"
            inputMode="decimal"
            placeholder="Ej. 15,000"
          />
        </div>

        {/* Propietario */}
        <div className="space-y-2">
          <Label htmlFor="owner_name">Propietario *</Label>
          <Input
            id="owner_name"
            name="owner_name"
            value={formData.owner_name}
            onChange={handleChange}
            required
            className="w-full"
            placeholder="Nombre del propietario"
          />
        </div>

        {/* Relación */}
        <div className="space-y-2">
          <Label htmlFor="relation">Relación con Cliente</Label>
          <Input
            id="relation"
            name="relation"
            value={formData.relation}
            onChange={handleChange}
            className="w-full"
            placeholder="Ej. Esposo(a), Padre, Titular"
          />
        </div>

        {/* Documento */}
        <div className="space-y-2">
          <Label htmlFor="document_ref">Referencia/Documento</Label>
          <Input
            id="document_ref"
            name="document_ref"
            value={formData.document_ref}
            onChange={handleChange}
            className="w-full"
            placeholder="Folio, No. de documento, etc."
          />
        </div>

        {/* Fecha evaluación */}
        <div className="space-y-2">
          <Label htmlFor="evaluation_date">Fecha de Evaluación</Label>
          <Input
            id="evaluation_date"
            name="evaluation_date"
            type="date"
            value={formData.evaluation_date}
            onChange={handleChange}
            className="w-full"
          />
        </div>

        {/* Descripción (full width) */}
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="description">Descripción / Notas</Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full min-h-28"
            placeholder="Marca, modelo, número de serie, estado, observaciones..."
          />
        </div>
      </div>

      {/* Footer responsivo */}
      <DialogFooter className="pt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
          Cancelar
        </Button>
        <Button type="submit" className="w-full sm:w-auto">
          {guarantee ? 'Guardar Cambios' : 'Añadir Garantía'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default GuaranteeForm;
