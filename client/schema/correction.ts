import { z } from 'zod';

const baseSchema = z.object({
  policyNumber: z.string().trim().min(1, 'Policy number is required'),
});

export const correctionSchema = z.discriminatedUnion('type', [
  baseSchema.extend({
    type: z.literal('registration'),
    newValue: z.string().trim().min(1, 'New registration is required'),
  }),
  baseSchema.extend({
    type: z.literal('name'),
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim(), // Allow empty string as per logic
  }),
  baseSchema.extend({
    type: z.literal('vehicle_make'),
    newVehicleMake: z.string().trim().min(1, 'Vehicle make is required'),
    newVehicleModel: z.string().trim().min(1, 'Vehicle model is required'),
  }),
]);

export type CorrectionFormValues = z.infer<typeof correctionSchema>;

export const typeConfig = {
  registration: { label: 'New Registration Number', placeholder: 'e.g. ABC-123-XY' },
  name: { label: 'Name Correction', placeholder: '' },
  vehicle_make: { label: 'Vehicle Correction', placeholder: '' },
};
