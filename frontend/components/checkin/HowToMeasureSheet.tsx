"use client";

import { useEffect } from "react";

interface HowToMeasureSheetProps {
  label: string;
  steps: string[];
  onClose: () => void;
}

/** "(?) How to measure" bottom sheet (SPEC §8.3 screen 2 step 3). */
export function HowToMeasureSheet({
  label,
  steps,
  onClose,
}: HowToMeasureSheetProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 motion-reduce:transition-none">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How to measure ${label}`}
        className="relative w-full max-w-lg rounded-t-xl bg-white p-6 shadow-lg dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">How to measure: {label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center text-xl"
          >
            ×
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-2 list-decimal pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
