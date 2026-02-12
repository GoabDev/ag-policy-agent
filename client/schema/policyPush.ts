import { z } from 'zod';

export const policyPushSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('policy_number'),
    policyNumber: z.string().trim().min(1, 'Policy number is required'),
  }),
  z.object({
    method: z.literal('date_range'),
    fromDate: z.date({ error: 'From date is required' }),
    toDate: z.date({ error: 'To date is required' }),
  }),
]);

export type PolicyPushFormValues = z.infer<typeof policyPushSchema>;
