import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient'; // Corrected import
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader';

const AddGuarantee = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { refreshData } = useData();

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
  });

  const [clients, setClients] = useState([]);
  const [clientLoans, setClientLoans] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (profile?.role !== 'ADMIN_GENERAL') {
      toast({
        variant: 'destructive',
        title: 'Acceso Denegado',
        description: 'No tienes permisos para añadir garantías.',
      });
      navigate('/admin/guarantees');
    }

    const fetchClients = async () => {
      const { data, error } = await supabase.from('clients').select('id, name, email');
      if (error) {
        toast({ variant: 'destructive', title: 'Error cargando clientes' });
      } else {
        setClients(data);
      }
    };
    fetchClients();

    const params = new URLSearchParams(location.search);
    const clientIdFromQuery = params.get('client_id');
    if (clientIdFromQuery) {
      handleSelectChange('client_id', clientIdFromQuery);
    }
  }, [profile, navigate, location.search]);

  useEffect(() => {
    if (formData.client_id) {
      const fetchClientLoans = async () => {
        const { data, error } = await supabase
          .from('loans')
          .select('id, amount, start_date')
          .eq('client_id', formData.client_id)
          .eq('status', 'active');
        if (error) {
          toast({ variant: 'destructive', title: 'Error cargando préstamos del cliente' });
          setClientLoans([]);
        } else {
          setClientLoans(data);
        }
      };
      fetchClientLoans();
      
      const selectedClient = clients.find(c => c.id.toString() === formData.client_id);
      if(selectedClient){
        setFormData(prev => ({...prev, owner_name: selectedClient.name}));
      }

    } else {
      setClientLoans([]);
    }
  }, [formData.client_id, clients]);

  const validateForm = () => {
    const newErrors = {};
    if (!formData.client_id) newErrors.client_id = 'Debes seleccionar un cliente.';
    if (!formData.type) newErrors.type = 'El tipo de garantía es obligatorio.';
    if (!formData.amount || parseFloat(formData.amount) <= 0) newErrors.amount = 'El valor debe ser un número positivo.';
    if (!formData.owner_name.trim()) newErrors.owner_name = 'El nombre del propietario es obligatorio.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if(errors[name]) setErrors(prev => ({...prev, [name]: null}));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
     if(errors[name]) setErrors(prev => ({...prev, [name]: null}));
    if (name === 'client_id') {
      setFormData(prev => ({ ...prev, loan_id: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast({
        variant: "destructive",
        title: "Formulario incompleto",
        description: "Por favor, revisa los campos marcados en rojo.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('guarantees').insert([
        { 
          ...formData,
          loan_id: formData.loan_id || null, // Ensure null if empty
          status: 'vigente',
          created_by: profile.id
        }
      ]);

      if (error) throw error;

      toast({
        title: "Garantía agregada con éxito",
        description: "La nueva garantía ha sido registrada.",
      });
      await refreshData();
      navigate('/admin/guarantees');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al agregar garantía",
        description: error.message,
      });
      setIsSubmitting(false);
    }
  };

  const guaranteeTypes = ['Prendaria', 'Hipotecaria', 'Aval', 'Depósito'];

  return (
    <>
      <Helmet>
        <title>Añadir Nueva Garantía - FinanComunitaria</title>
      </Helmet>
      <div className="space-y-6">
        <PageHeader
          title="Añadir Nueva Garantía"
          description="Completa el formulario para registrar una nueva garantía."
        />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="max-w-4xl mx-auto glass-effect">
            <CardHeader><CardTitle>Información de la Garantía</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="client_id">Cliente *</Label>
                  <Select name="client_id" value={formData.client_id} onValueChange={(v) => handleSelectChange('client_id', v)} disabled={isSubmitting}>
                    <SelectTrigger className={errors.client_id ? 'border-destructive' : ''}><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(client => <SelectItem key={client.id} value={client.id.toString()}>{client.name} ({client.email})</SelectItem>)}
                    </SelectContent>
                  </Select>
                   {errors.client_id && <p className="text-sm text-destructive">{errors.client_id}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan_id">Préstamo Asociado (Opcional)</Label>
                  <Select name="loan_id" value={formData.loan_id} onValueChange={(v) => handleSelectChange('loan_id', v)} disabled={isSubmitting || !formData.client_id}>
                    <SelectTrigger><SelectValue placeholder="Selecciona un préstamo activo" /></SelectTrigger>
                    <SelectContent>
                      {clientLoans.length > 0 ? (
                        clientLoans.map(loan => (
                          <SelectItem key={loan.id} value={loan.id.toString()}>
                            Préstamo de ${loan.amount} ({new Date(loan.start_date).toLocaleDateString()})
                          </SelectItem>
                        ))
                      ) : (
                        <p className="p-4 text-sm text-muted-foreground">No hay préstamos activos para este cliente.</p>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo de Garantía *</Label>
                  <Select name="type" value={formData.type} onValueChange={(v) => handleSelectChange('type', v)} disabled={isSubmitting}>
                    <SelectTrigger className={errors.type ? 'border-destructive' : ''}><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                    <SelectContent>
                      {guaranteeTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                   {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Valor de la Garantía (MXN) *</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleChange} required disabled={isSubmitting} className={errors.amount ? 'border-destructive' : ''} />
                   {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_name">Nombre del Propietario *</Label>
                  <Input id="owner_name" name="owner_name" value={formData.owner_name} onChange={handleChange} required disabled={isSubmitting} className={errors.owner_name ? 'border-destructive' : ''} />
                   {errors.owner_name && <p className="text-sm text-destructive">{errors.owner_name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="relation">Relación con el Cliente</Label>
                  <Input id="relation" name="relation" value={formData.relation} onChange={handleChange} disabled={isSubmitting} />
                </div>
                
                 <div className="space-y-2">
                  <Label htmlFor="document_ref">Referencia/Documento</Label>
                  <Input id="document_ref" name="document_ref" value={formData.document_ref} onChange={handleChange} disabled={isSubmitting} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evaluation_date">Fecha de Evaluación</Label>
                  <Input id="evaluation_date" name="evaluation_date" type="date" value={formData.evaluation_date} onChange={handleChange} disabled={isSubmitting} />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description">Descripción / Notas Adicionales</Label>
                  <Textarea id="description" name="description" value={formData.description} onChange={handleChange} disabled={isSubmitting} />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => navigate('/admin/guarantees')} disabled={isSubmitting}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : 'Guardar Garantía'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default AddGuarantee;