import React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';
import { RefreshCw, Send, Layers, Pin, CheckCircle2, XCircle, Clock, Ban, Eraser } from 'lucide-react';
import { correctionSchema, type CorrectionFormValues } from '@/schema/correction';
import { Badge } from '@/components/ui/badge';
import { useRunCorrection, useCancelCorrection } from '@/queries/useCorrections';
import { getVehicleData, refreshVehicleData } from '@/service/api';
import type { TaskState } from '@/hooks/useSSE';
import { VEHICLE_COLOR_OPTIONS } from '@/lib/vehicle-options';
import { buildCorrectionRetryValues, type CorrectionRetryDraft } from '@/lib/correction-retry';

const DEFAULT_CORRECTION_VALUES = {
  type: 'registration',
  policyNumber: '',
  newValue: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  engineNumber: '',
  newChassisNumber: '',
  newRegistrationNumber: '',
  vehicleColor: '',
  newVehicleMake: '',
  newVehicleModel: '',
  vehicleYear: '',
  address: '',
  portalTarget: 'auto',
  previousRegistrationNumber: '',
};

function isEpinPolicyNumber(policyNumber?: string) {
  const lastSegment = (policyNumber || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .pop();

  return /^C\d+$/i.test(lastSegment || '');
}

export function CorrectionForm({
  isRunning,
  activeTasks,
  tasks,
  retryDraft,
}: {
  isRunning: boolean,
  activeTasks: TaskState[],
  tasks: Map<string, TaskState>,
  retryDraft?: CorrectionRetryDraft | null,
}) {
  const [vehicleModelEntryMode, setVehicleModelEntryMode] = React.useState<'select' | 'manual'>('select');
  const runMutation = useRunCorrection();
  const cancelMutation = useCancelCorrection();

  // Filter to only correction tasks (exclude push tasks)
  const correctionActiveTasks = activeTasks.filter((t) => t.type !== 'policy_push');
  const correctionTasks = new Map(
    Array.from(tasks.entries()).filter(([, t]) => t.type !== 'policy_push')
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<any>({
    resolver: zodResolver(correctionSchema),
    defaultValues: DEFAULT_CORRECTION_VALUES,
  });

  const selectedType = watch('type');
  const selectedMake = watch('newVehicleMake');
  const policyNumber = watch('policyNumber');
  const portalTarget = watch('portalTarget') || 'auto';
  const isEpinPolicy = isEpinPolicyNumber(policyNumber);
  const primaryPortalLabel = isEpinPolicy ? 'E-PIN only' : 'Scratch Card only';
  const secondaryPortalLabel = isEpinPolicy ? 'NIIP only' : 'NIID only';
  const isNiidOnly = !isEpinPolicy && portalTarget === 'secondary';
  const isUnsupportedNiidOnly =
    isNiidOnly &&
    !['registration', 'reg_and_chassis', 'chassis'].includes(selectedType);
  const isUnsupportedScratchSwap = !isEpinPolicy && selectedType === 'swap';
  const defaultTargetLabel = isEpinPolicy
    ? 'Default: E-PIN + NIIP when applicable'
    : 'Default: Scratch Card + NIID when applicable';

  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!retryDraft) return;

    reset(buildCorrectionRetryValues(retryDraft.correction));
    setVehicleModelEntryMode('select');
  }, [reset, retryDraft]);

  const { data: vehicleData, isLoading: isLoadingVehicles, error: vehicleError } = useQuery({
    queryKey: ['vehicle-data'],
    queryFn: getVehicleData,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.modelFetchStatus;
      return status?.inProgress ? 5000 : false;
    },
  });

  // axios interceptor strips response.data, so vehicleData = { success, data: { makes, models }, modelFetchStatus }
  const vd = (vehicleData as any)?.data ?? vehicleData;
  const fetchStatus = (vehicleData as any)?.modelFetchStatus;
  const makes: string[] = vd?.makes ?? [];
  const modelsForMake: string[] = selectedMake
    ? (vd?.models?.[selectedMake] ?? [])
    : [];

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const handleRefreshVehicleData = async () => {
    setIsRefreshing(true);
    try {
      await refreshVehicleData();
      queryClient.invalidateQueries({ queryKey: ['vehicle-data'] });
    } catch {
      // error will show via vehicleError
    } finally {
      setIsRefreshing(false);
    }
  };

  const onSubmit = (data: CorrectionFormValues) => {
    runMutation.mutate(data, {
      onSuccess: () => {
        setValue('portalTarget', 'auto');
        setValue('previousRegistrationNumber', '');
      },
    });
  };

  const clearFields = () => {
    reset({
      ...DEFAULT_CORRECTION_VALUES,
      type: selectedType,
    });
    setVehicleModelEntryMode('select');
  };

  return (
    <Card className="bg-card border-border shadow-xl overflow-hidden">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-muted-foreground" />
          New Correction
          {correctionActiveTasks.length > 0 && (
            <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">
              <Layers className="w-3 h-3 mr-1" />
              {correctionActiveTasks.length} running
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
          <TabsList className="grid grid-cols-6 bg-background p-1 h-10 border border-border">
            <TabsTrigger value="registration" className="text-xs data-[state=active]:bg-secondary">Reg No.</TabsTrigger>
            <TabsTrigger value="name" className="text-xs data-[state=active]:bg-secondary">Name</TabsTrigger>
            <TabsTrigger value="vehicle_make" className="text-xs data-[state=active]:bg-secondary">Vehicle</TabsTrigger>
            <TabsTrigger value="reg_and_chassis" className="text-xs data-[state=active]:bg-secondary">Reg & Chas</TabsTrigger>
            <TabsTrigger value="chassis" className="text-xs data-[state=active]:bg-secondary">Chassis</TabsTrigger>
            <TabsTrigger value="swap" className="text-xs data-[state=active]:bg-secondary">Swap</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-[11px] text-muted-foreground mb-6 flex items-center gap-2">
          {(selectedType === 'registration' || selectedType === 'reg_and_chassis')
            ? <><RefreshCw className="w-3 h-3" /> This correction updates both A&G and NIID</>
            : selectedType === 'swap'
            ? <><RefreshCw className="w-3 h-3" /> Swap updates only the filled fields. Empty fields are ignored.</>
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
            {errors.policyNumber && <p className="text-[10px] text-destructive">{String(errors.policyNumber.message)}</p>}
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
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {(isLoadingVehicles || fetchStatus?.inProgress) && (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {fetchStatus?.inProgress
                        ? `Loading models... ${fetchStatus.processed}/${fetchStatus.total} makes`
                        : 'Loading vehicle data...'}
                    </>
                  )}
                  {vehicleError && (
                    <span className="text-destructive">
                      Failed to load vehicle data: {(vehicleError as Error).message}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={handleRefreshVehicleData}
                  disabled={isRefreshing || fetchStatus?.inProgress}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Update Makes & Models
                </Button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Make</label>
                {makes.length > 0 ? (
                  <Combobox
                    options={makes}
                    value={selectedMake || ''}
                    onChange={(val) => {
                      setValue('newVehicleMake', val);
                      setValue('newVehicleModel', ''); // Reset model when make changes
                      setVehicleModelEntryMode('select');
                    }}
                    placeholder="Select vehicle make..."
                    searchPlaceholder="Search makes..."
                  />
                ) : (
                  <Input
                    {...register('newVehicleMake')}
                    placeholder="e.g. Toyota"
                    className="bg-background border-border focus-visible:ring-primary/50"
                  />
                )}
                {(errors as any).newVehicleMake && (
                  <p className="text-[10px] text-destructive">{(errors as any).newVehicleMake.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Model</label>
                  {selectedMake && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setVehicleModelEntryMode((current) =>
                          current === 'manual' ? 'select' : 'manual'
                        )
                      }
                    >
                      {vehicleModelEntryMode === 'manual' ? 'Pick from list' : 'Enter manually'}
                    </Button>
                  )}
                </div>
                {modelsForMake.length > 0 && vehicleModelEntryMode !== 'manual' ? (
                  <Combobox
                    options={modelsForMake}
                    value={watch('newVehicleModel') || ''}
                    onChange={(val) => setValue('newVehicleModel', val)}
                    placeholder="Select vehicle model..."
                    searchPlaceholder="Search models..."
                  />
                ) : (
                  <Input
                    {...register('newVehicleModel')}
                    placeholder={
                      selectedMake
                        ? modelsForMake.length > 0
                          ? 'Type vehicle model manually'
                          : 'No models loaded for this make, type manually'
                        : 'Select a make first'
                    }
                    className="bg-background border-border focus-visible:ring-primary/50"
                    disabled={!selectedMake}
                  />
                )}
                {selectedMake && modelsForMake.length > 0 && vehicleModelEntryMode === 'manual' && (
                  <p className="text-[10px] text-muted-foreground">
                    Manual model entry is allowed. The system will still try to match what you type to the closest available site option.
                  </p>
                )}
                {(errors as any).newVehicleModel && (
                  <p className="text-[10px] text-destructive">{(errors as any).newVehicleModel.message}</p>
                )}
              </div>
            </>
          )}

          {(selectedType === 'reg_and_chassis' || selectedType === 'chassis') && (
            <>
              {selectedType === 'reg_and_chassis' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Registration</label>
                  <Input
                    {...register('newRegistrationNumber')}
                    placeholder="e.g. ABC-123-XY"
                    className="bg-background border-border focus-visible:ring-primary/50"
                  />
                  {(errors as any).newRegistrationNumber && (
                    <p className="text-[10px] text-destructive">{(errors as any).newRegistrationNumber.message}</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Chassis Number</label>
                <Input
                  {...register('newChassisNumber')}
                  placeholder="e.g. CHAS123456789"
                  className="bg-background border-border focus-visible:ring-primary/50"
                />
                {(errors as any).newChassisNumber && (
                  <p className="text-[10px] text-destructive">{(errors as any).newChassisNumber.message}</p>
                )}
              </div>
            </>
          )}

          {selectedType === 'swap' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">First Name</label>
                  <Input {...register('firstName')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Last Name</label>
                  <Input {...register('lastName')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</label>
                  <Input {...register('email')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Phone</label>
                  <Input
                    {...register('phone')}
                    placeholder="e.g. 08012345678"
                    inputMode="numeric"
                    maxLength={11}
                    className="bg-background border-border focus-visible:ring-primary/50"
                  />
                  {(errors as any).phone && (
                    <p className="text-[10px] text-destructive">{String((errors as any).phone.message)}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Engine Number</label>
                  <Input {...register('engineNumber')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Color</label>
                  <Combobox
                    options={VEHICLE_COLOR_OPTIONS}
                    value={watch('vehicleColor') || ''}
                    onChange={(val) => setValue('vehicleColor', val)}
                    clearLabel="No color change"
                    placeholder="Select vehicle color..."
                    searchPlaceholder="Search colors..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Year</label>
                  <Input {...register('vehicleYear')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Registration Number</label>
                  <Input {...register('newRegistrationNumber')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Chassis Number</label>
                  <Input {...register('newChassisNumber')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Make</label>
                  <Input {...register('newVehicleMake')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vehicle Model</label>
                  <Input {...register('newVehicleModel')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Address</label>
                <Input {...register('address')} placeholder="Optional" className="bg-background border-border focus-visible:ring-primary/50" />
              </div>
              {(errors as any).firstName && (
                <p className="text-[10px] text-destructive">{String((errors as any).firstName.message)}</p>
              )}
            </>
          )}

          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <Button
              type="button"
              variant="outline"
              className="font-semibold transition-all"
              onClick={clearFields}
              disabled={runMutation.isPending}
            >
              <Eraser className="w-4 h-4 mr-2" />
              Clear
            </Button>
            <Button
              type="submit"
              className="font-semibold transition-all"
              disabled={runMutation.isPending || isUnsupportedNiidOnly || isUnsupportedScratchSwap}
            >
              {runMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Run Correction</>
              )}
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Correction Target</label>
              <span className="text-[10px] text-muted-foreground">{defaultTargetLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={portalTarget === 'primary' ? 'default' : 'outline'}
                className="h-9 text-xs font-semibold"
                onClick={() => setValue('portalTarget', portalTarget === 'primary' ? 'auto' : 'primary')}
              >
                {primaryPortalLabel}
              </Button>
              <Button
                type="button"
                variant={portalTarget === 'secondary' ? 'default' : 'outline'}
                className="h-9 text-xs font-semibold"
                onClick={() => setValue('portalTarget', portalTarget === 'secondary' ? 'auto' : 'secondary')}
              >
                {secondaryPortalLabel}
              </Button>
            </div>
          </div>

          {isNiidOnly && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Previous Registration Number
              </label>
              <Input
                {...register('previousRegistrationNumber')}
                placeholder="Optional. Leave blank to read from Scratch Card first."
                className="bg-background border-border focus-visible:ring-primary/50"
              />
            </div>
          )}

          {isUnsupportedNiidOnly && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              NIID-only corrections currently support registration and chassis updates only.
            </p>
          )}

          {isUnsupportedScratchSwap && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Swap correction is currently supported only for E-PIN / NIIP policies.
            </p>
          )}
        </form>

        {/* Active Tasks Progress */}
        {correctionActiveTasks.length > 0 && (
          <div className="mt-8 space-y-4 pt-6 border-t border-border/50">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Active Tasks ({correctionActiveTasks.length})
            </h4>
            {correctionActiveTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-foreground font-medium">{task.type} correction</span>
                  <span className="text-muted-foreground">— {task.policyNumber}</span>
                  <Badge className="ml-auto bg-primary/10 text-primary text-[9px]">
                    {task.steps.length} steps
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => cancelMutation.mutate(task.id)}
                    disabled={cancelMutation.isPending}
                    title="Cancel task"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </Button>
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
        {Array.from(correctionTasks.values()).filter(t => t.status !== 'running').length > 0 && (
          <div className="mt-4 space-y-2">
            {Array.from(correctionTasks.values()).filter(t => t.status !== 'running').map((task) => (
              <div key={task.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                task.status === 'completed' ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-300' :
                task.status === 'cancelled' ? 'bg-amber-500/5 text-amber-600 dark:text-amber-300' :
                'bg-destructive/5 text-destructive'
              }`}>
                <span>{task.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : task.status === 'cancelled' ? <Ban className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}</span>
                <span>{task.type} — {task.policyNumber}</span>
                <span className="ml-auto text-[10px] opacity-60">
                  {task.status === 'completed' ? 'Done' : task.status === 'cancelled' ? 'Cancelled' : task.error || 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
