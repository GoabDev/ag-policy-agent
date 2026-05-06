import { z } from "zod";

const baseSchema = z.object({
  policyNumber: z.string().trim().min(1, "Policy number is required"),
});

export const correctionSchema = z.discriminatedUnion("type", [
  baseSchema.extend({
    type: z.literal("registration"),
    newValue: z.string().trim().min(1, "New registration is required"),
  }),
  baseSchema.extend({
    type: z.literal("name"),
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().optional(), // Allow empty string as per logic
  }),
  baseSchema.extend({
    type: z.literal("vehicle_make"),
    newVehicleMake: z.string().trim().min(1, "Vehicle make is required"),
    newVehicleModel: z.string().trim().min(1, "Vehicle model is required"),
  }),
  baseSchema.extend({
    type: z.literal("reg_and_chassis"),
    newRegistrationNumber: z
      .string()
      .trim()
      .min(1, "New registration is required"),
    newChassisNumber: z
      .string()
      .trim()
      .min(1, "New chassis number is required"),
  }),
  baseSchema.extend({
    type: z.literal("chassis"),
    newChassisNumber: z
      .string()
      .trim()
      .min(1, "New chassis number is required"),
  }),
  baseSchema.extend({
    type: z.literal("swap"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    engineNumber: z.string().optional(),
    newChassisNumber: z.string().optional(),
    newRegistrationNumber: z.string().optional(),
    vehicleColor: z.string().optional(),
    newVehicleMake: z.string().optional(),
    newVehicleModel: z.string().optional(),
    vehicleYear: z.string().optional(),
    address: z.string().optional(),
  }).superRefine((value, ctx) => {
    const fields = [
      value.firstName,
      value.lastName,
      value.email,
      value.phone,
      value.engineNumber,
      value.newChassisNumber,
      value.newRegistrationNumber,
      value.vehicleColor,
      value.newVehicleMake,
      value.newVehicleModel,
      value.vehicleYear,
      value.address,
    ];

    const hasAnyValue = fields.some((field) => (field || "").trim().length > 0);
    if (!hasAnyValue) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one field to update",
        path: ["firstName"],
      });
    }
  }),
]);

export type CorrectionFormValues = z.infer<typeof correctionSchema>;

export const typeConfig = {
  registration: {
    label: "New Registration Number",
    placeholder: "e.g. ABC-123-XY",
  },
  name: { label: "Name Correction", placeholder: "" },
  vehicle_make: { label: "Vehicle Correction", placeholder: "" },
  reg_and_chassis: { label: "Registration & Chassis", placeholder: "" },
  chassis: { label: "Chassis Correction", placeholder: "" },
  swap: { label: "Swap Correction", placeholder: "" },
};
