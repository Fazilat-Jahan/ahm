import { z } from "zod";
import { MEASUREMENTS, type NumberFieldSpec } from "@/config/measurements";

function numberFieldSchema(field: NumberFieldSpec) {
  let schema = z
    .number({ error: `${field.label} must be a number.` })
    .min(
      field.min,
      `${field.label} must be at least ${field.min}${field.unit}.`,
    );
  if (field.max !== undefined) {
    schema = schema.max(
      field.max,
      `${field.label} must be at most ${field.max}${field.unit}.`,
    );
  }
  return schema.optional();
}

function buildMeasurementSchema() {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const measurement of MEASUREMENTS) {
    switch (measurement.kind) {
      case "number":
        shape[measurement.id] = numberFieldSchema(measurement);
        break;
      case "two-number":
        for (const field of measurement.fields) {
          shape[field.id] = numberFieldSchema(field);
        }
        break;
      case "slider":
        shape[measurement.id] = z
          .number()
          .int(`${measurement.label} must be a whole number.`)
          .min(
            measurement.min,
            `${measurement.label} must be at least ${measurement.min}.`,
          )
          .max(
            measurement.max,
            `${measurement.label} must be at most ${measurement.max}.`,
          )
          .optional();
        break;
      case "toggle":
        shape[measurement.id] = z.boolean().optional();
        break;
    }
  }

  return z.object(shape);
}

export const measurementSchema = buildMeasurementSchema();
export type MeasurementFormValues = z.infer<typeof measurementSchema>;
