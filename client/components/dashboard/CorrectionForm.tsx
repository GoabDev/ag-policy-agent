import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { correctionSchema, type CorrectionFormValues, typeConfig } from '@/schema/correction';
import { Badge } from '@/components/ui/badge';
import { useRunCorrection } from '@/queries/useCorrections';


export function CorrectionForm({ 
  isRunning, 
  steps, 
  error, 
  success 
}: { 
  isRunning: boolean, 
  steps: any[],
  error: string | null,
  success: string | null
}) {
  const runMutation = useRunCorrection();
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: {
      type: 'registration',
      policyNumber: '',
      newValue: ''
    }
  });

  const selectedType = watch('type');

  const onSubmit = (data: CorrectionFormValues) => {
    runMutation.mutate(data);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden">
      <CardHeader className="border-b border-slate-800 py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-slate-400" />
          New Correction
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs 
          value={selectedType} 
          onValueChange={(v) => setValue('type', v as any)} 
          className="mb-6"
        >
          <TabsList className="grid grid-cols-3 bg-slate-950 p-1 h-10 border border-slate-800">
            <TabsTrigger value="registration" className="text-xs data-[state=active]:bg-slate-800">Reg No.</TabsTrigger>
            <TabsTrigger value="name" className="text-xs data-[state=active]:bg-slate-800">Name</TabsTrigger>
            <TabsTrigger value="vehicle_make" className="text-xs data-[state=active]:bg-slate-800">Vehicle</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-[11px] text-slate-500 mb-6 flex items-center gap-2">
          {selectedType === 'registration' 
            ? '🔄 This correction updates both A&G and NIID' 
            : '📌 This correction updates A&G platform only'}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 bg-rose-500/10 border-rose-500/20 text-rose-400">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="text-xs">{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Policy Number</label>
            <Input 
              {...register('policyNumber')}
              placeholder="Enter policy number" 
              className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
              disabled={isRunning}
            />
            {errors.policyNumber && <p className="text-[10px] text-rose-500">{errors.policyNumber.message}</p>}
          </div>

          {selectedType === 'registration' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Registration</label>
              <Input 
                {...register('newValue')}
                placeholder="e.g. ABC-123-XY" 
                className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
                disabled={isRunning}
              />
              {errors.newValue && (
                <p className="text-[10px] text-rose-500">{(errors as any).newValue.message}</p>
              )}
            </div>
          )}

          {selectedType === 'name' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">First Name</label>
                <Input 
                  {...register('firstName')}
                  placeholder="e.g. John" 
                  className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
                  disabled={isRunning}
                />
                {(errors as any).firstName && (
                  <p className="text-[10px] text-rose-500">{(errors as any).firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Name</label>
                <Input 
                  {...register('lastName')}
                  placeholder="e.g. Doe (optional)" 
                  className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
                  disabled={isRunning}
                />
                {(errors as any).lastName && (
                  <p className="text-[10px] text-rose-500">{(errors as any).lastName.message}</p>
                )}
              </div>
            </>
          )}

          {selectedType === 'vehicle_make' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vehicle Make</label>
                <Input 
                  {...register('newVehicleMake')}
                  placeholder="e.g. Toyota" 
                  className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
                  disabled={isRunning}
                />
                {(errors as any).newVehicleMake && (
                  <p className="text-[10px] text-rose-500">{(errors as any).newVehicleMake.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vehicle Model</label>
                <Input 
                  {...register('newVehicleModel')}
                  placeholder="e.g. Corolla" 
                  className="bg-slate-950 border-slate-800 focus-visible:ring-blue-500/50"
                  disabled={isRunning}
                />
                {(errors as any).newVehicleModel && (
                  <p className="text-[10px] text-rose-500">{(errors as any).newVehicleModel.message}</p>
                )}
              </div>
            </>
          )}

          <Button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)]" 
            disabled={isRunning || runMutation.isPending}
          >
            {isRunning || runMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Running...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Run Correction</>
            )}
          </Button>
        </form>

        {steps.length > 0 && (
          <div className="mt-8 space-y-3 pt-6 border-t border-slate-800/50">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Task Progress</h4>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg text-xs ${
                  s.status === 'success' ? 'bg-emerald-500/5 text-emerald-300' : 
                  s.status === 'failed' ? 'bg-rose-500/5 text-rose-300' : 
                  'bg-blue-500/5 text-blue-300'
                }`}>
                  <Badge className={`h-4 text-[9px] px-1.5 ${s.site === 'ag' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {s.site.toUpperCase()}
                  </Badge>
                  <span className="opacity-80">{s.status === 'success' ? '✅' : s.status === 'failed' ? '❌' : '⏳'}</span>
                  <span className="flex-1 font-medium">{s.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
