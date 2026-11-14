"use client";

import { useState } from "react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

interface PinPadProps {
  onSubmit: (pin: string) => void;
  submitLabel: string;
  minLength?: number;
  maxLength?: number;
  error?: string | null;
  disabled?: boolean;
}

/** On-screen numeric keypad (SPEC §8.3 screen 0). Touch targets are >=44px
 * (CLAUDE.md §2 rule 8 — usable with gloves). */
export function PinPad({
  onSubmit,
  submitLabel,
  minLength = 4,
  maxLength = 6,
  error,
  disabled = false,
}: PinPadProps) {
  const [pin, setPin] = useState("");

  function press(key: string) {
    if (disabled) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;
    setPin((p) => (p.length < maxLength ? p + key : p));
  }

  function handleSubmit() {
    if (pin.length < minLength) return;
    onSubmit(pin);
    setPin("");
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        aria-live="polite"
        aria-label={`${pin.length} of up to ${maxLength} digits entered`}
        className="flex gap-2"
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-zinc-400 ${
              i < pin.length ? "bg-zinc-900 dark:bg-zinc-100" : ""
            }`}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              aria-label={key === "⌫" ? "Backspace" : key}
              className="flex h-14 w-14 min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-300 text-lg font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              {key}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        disabled={disabled || pin.length < minLength}
        onClick={handleSubmit}
        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitLabel}
      </button>
    </div>
  );
}
