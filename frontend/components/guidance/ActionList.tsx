import type { Action } from "@/lib/rules/types";

interface ActionListProps {
  actions: Action[];
  /** Home dashboard's "today's actions" are checkable (SPEC §8.3 screen 1);
   * the result screen's are not — just a plain list there. */
  checkable?: boolean;
  checkedIds?: ReadonlySet<string>;
  onToggle?: (actionId: string) => void;
}

export function ActionList({
  actions,
  checkable,
  checkedIds,
  onToggle,
}: ActionListProps) {
  if (actions.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {actions.map((action) =>
        checkable ? (
          <li key={action.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={checkedIds?.has(action.id) ?? false}
                onChange={() => onToggle?.(action.id)}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>{action.text}</span>
            </label>
          </li>
        ) : (
          <li
            key={action.id}
            className="rounded-md border border-border p-3 text-sm"
          >
            {action.text}
          </li>
        ),
      )}
    </ul>
  );
}
