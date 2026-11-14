import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
}

/** Shared empty-state shape (SPEC §16 table): every screen needs one, none
 * of them show fake/sample data. */
export function EmptyState({ title, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon}
      <p className="text-zinc-600 dark:text-zinc-400">{title}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 min-w-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
