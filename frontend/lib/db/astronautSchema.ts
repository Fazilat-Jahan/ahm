import { z } from "zod";
import { ENVIRONMENTS } from "@/lib/rules/types";
import { ASTRONAUT_ROLES } from "./schema";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const registerAstronautSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Full name is required.")
      .max(100, "Keep the name under 100 characters."),
    crewCode: z
      .string()
      .trim()
      .min(3, "Crew ID must be at least 3 characters (e.g. AST-001).")
      .max(20, "Keep the crew ID under 20 characters.")
      .regex(
        /^[A-Za-z0-9-]+$/,
        "Letters, numbers, and hyphens only (e.g. AST-001).",
      ),
    role: z.enum(ASTRONAUT_ROLES),
    environment: z.enum(ENVIRONMENTS),
    missionStart: dateString,
    missionEnd: dateString.optional().or(z.literal("")),
    pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits."),
    confirmPin: z.string(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs do not match.",
    path: ["confirmPin"],
  })
  .refine((data) => !data.missionEnd || data.missionEnd >= data.missionStart, {
    message: "Mission end can't be before mission start.",
    path: ["missionEnd"],
  });

export type RegisterAstronautFormValues = z.infer<
  typeof registerAstronautSchema
>;
