"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  registerAstronautSchema,
  type RegisterAstronautFormValues,
} from "@/lib/db/astronautSchema";
import { DuplicateCrewCodeError, registerAstronaut } from "@/lib/db/repo";
import { ASTRONAUT_ROLES } from "@/lib/db/schema";
import { ENVIRONMENT_LABELS, ROLE_LABELS } from "@/lib/db/labels";
import { getMissionDate } from "@/lib/time/missionDate";
import { ENVIRONMENTS } from "@/lib/rules/types";

const inputClass =
  "min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "text-sm text-red-600 dark:text-red-400";

export function RegisterAstronautForm({
  onRegistered,
}: {
  onRegistered: (astronautId: string) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterAstronautFormValues>({
    resolver: zodResolver(registerAstronautSchema),
    defaultValues: {
      role: "astronaut",
      environment: "station",
      missionStart: getMissionDate(),
      missionEnd: "",
    },
  });

  async function onSubmit(values: RegisterAstronautFormValues) {
    try {
      const astronaut = await registerAstronaut({
        name: values.name.trim(),
        // Crew IDs are shown uppercase everywhere in the SPEC (e.g.
        // "AST-001"); normalizing on save avoids "ast-001"/"AST-001"
        // being treated as two different crew members.
        crewCode: values.crewCode.trim().toUpperCase(),
        role: values.role,
        environment: values.environment,
        missionStart: values.missionStart,
        missionEnd: values.missionEnd || undefined,
        pin: values.pin,
      });
      onRegistered(astronaut.id);
    } catch (error) {
      if (error instanceof DuplicateCrewCodeError) {
        setError("crewCode", { message: error.message });
      } else {
        setError("root", {
          message: "Something went wrong. Please try again.",
        });
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-md flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="name">
          Full name
        </label>
        <input id="name" className={inputClass} {...register("name")} />
        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="crewCode">
          Crew ID
        </label>
        <input
          id="crewCode"
          placeholder="AST-001"
          className={inputClass}
          {...register("crewCode")}
        />
        {errors.crewCode && (
          <p className={errorClass}>{errors.crewCode.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="role">
          Role
        </label>
        <select id="role" className={inputClass} {...register("role")}>
          {ASTRONAUT_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="environment">
          Environment
        </label>
        <select
          id="environment"
          className={inputClass}
          {...register("environment")}
        >
          {ENVIRONMENTS.map((env) => (
            <option key={env} value={env}>
              {ENVIRONMENT_LABELS[env]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="missionStart">
            Mission start
          </label>
          <input
            id="missionStart"
            type="date"
            className={inputClass}
            {...register("missionStart")}
          />
          {errors.missionStart && (
            <p className={errorClass}>{errors.missionStart.message}</p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="missionEnd">
            Mission end (optional)
          </label>
          <input
            id="missionEnd"
            type="date"
            className={inputClass}
            {...register("missionEnd")}
          />
          {errors.missionEnd && (
            <p className={errorClass}>{errors.missionEnd.message}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="pin">
            PIN (4-6 digits)
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            className={inputClass}
            {...register("pin")}
          />
          {errors.pin && <p className={errorClass}>{errors.pin.message}</p>}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="confirmPin">
            Confirm PIN
          </label>
          <input
            id="confirmPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            className={inputClass}
            {...register("confirmPin")}
          />
          {errors.confirmPin && (
            <p className={errorClass}>{errors.confirmPin.message}</p>
          )}
        </div>
      </div>

      {errors.root && <p className={errorClass}>{errors.root.message}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Register astronaut
      </button>
    </form>
  );
}
