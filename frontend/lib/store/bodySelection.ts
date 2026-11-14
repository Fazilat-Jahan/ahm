import { create } from "zustand";

/** Selection/hover state for the 3D body screen (SPEC §8.3 screen 3:
 * "selection state lives in the Zustand store"). In-memory only — there's
 * nothing to persist across reloads here. */
interface BodySelectionState {
  selectedRegionId: string | null;
  hoveredRegionId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}

export const useBodySelectionStore = create<BodySelectionState>((set) => ({
  selectedRegionId: null,
  hoveredRegionId: null,
  select: (id) => set({ selectedRegionId: id }),
  hover: (id) => set({ hoveredRegionId: id }),
}));
