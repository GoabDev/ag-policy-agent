import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Send, Layers, Pin, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { correctionSchema, type CorrectionFormValues } from '@/schema/correction';
import { Badge } from '@/components/ui/badge';
import { useRunCorrection } from '@/queries/useCorrections';
import type { TaskState } from '@/hooks/useSSE';


export function CorrectionForm({
  isRunning,
  activeTasks,
  tasks,
}: {
  isRunning: boolean,
  activeTasks: TaskState[],
  tasks: Map<string, TaskState>,
}) {
  const runMutation = useRunCorrection();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
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
    <Card className="bg-card border-border shadow-xl overflow-hidden">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-muted-foreground" />
          New Correction
          {activeTasks.length > 0 && (
            <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">
              <Layers className="w-3 h-3 mr-1" />
              {activeTasks.length} running
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs
          value={selectedType}
          onValueChange={(v) => setValue('type', v as any)}
          className="mb-6"
        >
          <TabsList className="grid grid-cols-3 bg-background p-1 h-10 border border-border">
            <TabsTrigger value="registration" className="text-xs data-[state=active]:bg-secondary">Reg No.</TabsTrigger>
            <TabsTrigger value="name" className="text-xs data-[state=active]:bg-secondary">Name</TabsTrigger>
            <TabsTrigger value="vehicle_make" className="text-xs data-[state=active]:bg-secondary">Vehicle</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-[11px] text-muted-foreground mb-6 flex items-center gap-2">
          {selectedType === 'registration'
            ? <><RefreshCw className="w-3 h-3" /> This correction updates both A&G and NIID</>
            : <><Pin className="w-3 h-3" /> This correction updates A&G platform only</>}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Policy Number</label>
            <Input
              {...register('policyNumber')}
              placeholder="Enter policy number"
              className="bg-background border-border focus-visible:ring-primary/50"
            />
            {errors.policyNumber && <p className="text-[10px] text-destructive">{errors.policyNumber.message}</p>}
          </div>

          {selectedType === 'registration' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Registration</label>
              <Input
                {...register('newValue')}
                placeholder="e.g. ABC-123-XY"
                className="bg-background border-border focus-visible:ring-primary/50"
              />
              {(errors as any).newValue && (
                <p className="text-[10px] text-destructive">{(errors as any).newValue.message}</p>
              )}
            </div>
          )}

          {selectedType === 'name' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">First Name</label>
                <Input
                  {...register('firstName')}
                  placeholder="e.g. John"
                  className="bg-background border-border focus-visible:ring-primary/50"
                />
                {(errors as any).firstName && (
                  <p className="text-[10px] text-destructive">{(errors as any).firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Last Name</label>
                <Input
                  {...register('lastName')}
                  placeholder="e.g. Doe (optional)"
                  className="bg-background border-border focus-visible:ring-primary/50"
                />
                {(errors as any).lastName && (
                  <p className="text-[10px] text-destructive">{(errors as any).lastName.message}</p>
                )}
              </div>
            </>
          )}

          {selectedType === 'vehicle_make' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Make</label>
                <Input
                  {...register('newVehicleMake')}
                  placeholder="e.g. Toyota"
                  className="bg-background border-border focus-visible:ring-primary/50"
                />
                {(errors as any).newVehicleMake && (
                  <p className="text-[10px] text-destructive">{(errors as any).newVehicleMake.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Model</label>
                <Input
                  {...register('newVehicleModel')}
                  placeholder="e.g. Corolla"
                  className="bg-background border-border focus-visible:ring-primary/50"
                />
                {(errors as any).newVehicleModel && (
                  <p className="text-[10px] text-destructive">{(errors as any).newVehicleModel.message}</p>
                )}
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full font-semibold transition-all"
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Run Correction</>
            )}
          </Button>
        </form>

        {/* Active Tasks Progress */}
        {activeTasks.length > 0 && (
          <div className="mt-8 space-y-4 pt-6 border-t border-border/50">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Active Tasks ({activeTasks.length})
            </h4>
            {activeTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-foreground font-medium">{task.type} correction</span>
                  <span className="text-muted-foreground">— {task.policyNumber}</span>
                  <Badge className="ml-auto bg-primary/10 text-primary text-[9px]">
                    {task.steps.length} steps
                  </Badge>
                </div>
                <div className="space-y-1">
                  {task.steps.map((s, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                      s.status === 'success' ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-300' :
                      s.status === 'failed' ? 'bg-destructive/5 text-destructive' :
                      'bg-primary/5 text-primary'
                    }`}>
                      <Badge className={`h-3.5 text-[8px] px-1 ${s.site === 'ag' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                        {s.site.toUpperCase()}
                      </Badge>
                      <span className="opacity-80">
                        {s.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : s.status === 'failed' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      </span>
                      <span className="flex-1">{s.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recently completed/failed tasks */}
        {Array.from(tasks.values()).filter(t => t.status !== 'running').length > 0 && (
          <div className="mt-4 space-y-2">
            {Array.from(tasks.values()).filter(t => t.status !== 'running').map((task) => (
              <div key={task.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                task.status === 'completed' ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-300' : 'bg-destructive/5 text-destructive'
              }`}>
                <span>{task.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}</span>
                <span>{task.type} — {task.policyNumber}</span>
                <span className="ml-auto text-[10px] opacity-60">
                  {task.status === 'completed' ? 'Done' : task.error || 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
