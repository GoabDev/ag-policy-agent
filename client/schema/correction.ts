import { z } from 'zod';

export const correctionSchema = z.object({
  type: z.enum(['registration', 'name', 'vehicle_make']),
  policyNumber: z.string().min(1, 'Policy number is required'),
  newValue: z.string().min(1, 'New value is required'),
});

export type CorrectionFormValues = z.infer<typeof correctionSchema>;

export const typeConfig = {
  registration: { label: 'New Registration Number', placeholder: 'e.g. ABC-123-XY' },
  name: { label: 'New Name', placeholder: 'e.g. John Doe' },
  vehicle_make: { label: 'New Vehicle Make', placeholder: 'e.g. Toyota Camry 2020' },
};
