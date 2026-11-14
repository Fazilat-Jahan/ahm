import { create } from "zustand";

/**
 * In-memory only — deliberately not persisted to localStorage. A page
 * reload should always come back to the locked Crew screen and require the
 * PIN again (SPEC §8.3 screen 0 "PIN pad" + §5.1 item 7 "PIN unlock"); see
 * docs/DECISIONS.md.
 */
interface ActiveAstronautState {
  activeAstronautId: string | null;
  lastActivityAt: number;
  setActiveAstronaut: (id: string) => void;
  lock: () => void;
  touch: () => void;
}

export const useActiveAstronautStore = create<ActiveAstronautState>((set) => ({
  activeAstronautId: null,
  lastActivityAt: Date.now(),
  setActiveAstronaut: (id) =>
    set({ activeAstronautId: id, lastActivityAt: Date.now() }),
  lock: () => set({ activeAstronautId: null }),
  touch: () => set({ lastActivityAt: Date.now() }),
}));
