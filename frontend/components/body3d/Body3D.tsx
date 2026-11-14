"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import type { Status } from "@/config/thresholds";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { BODY_PARTS } from "@/config/bodyParts";
import { BodyModel, type RegionAnchors } from "./BodyModel";
import { RegionHotspot } from "./RegionHotspot";
import { CameraRig, type OrbitControlsRef } from "./CameraRig";

interface Body3DProps {
  statuses: Record<string, Status | null>;
  resetToken: number;
}

/** Keeps `frameloop="demand"` alive for drei's `autoRotate` (which, like
 * any continuous animation, needs something to call `invalidate()` every
 * frame — it doesn't do this itself under a demand frameloop). No-op (so
 * truly idle) once `active` is false, e.g. under `prefers-reduced-motion`. */
function IdleRotationDriver({ active }: { active: boolean }) {
  const { invalidate } = useThree();
  useFrame(() => {
    if (active) invalidate();
  });
  return null;
}

/** SPEC §8.3 screen 3's interactive core. Client-only (loaded via
 * `dynamic(..., { ssr: false })` from the page) — three.js/WebGL can't run
 * during server rendering. */
export function Body3D({ statuses, resetToken }: Body3DProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const selectedRegionId = useBodySelectionStore((s) => s.selectedRegionId);
  const hoveredRegionId = useBodySelectionStore((s) => s.hoveredRegionId);
  const select = useBodySelectionStore((s) => s.select);
  const hover = useBodySelectionStore((s) => s.hover);

  // Hotspot positions found on named `region_*` objects in a GLB, if one
  // is loaded (see BodyModel.tsx). Empty for the procedural body.
  const [anchors, setAnchors] = useState<RegionAnchors>({});
  const regions = useMemo(
    () =>
      BODY_PARTS.map((region) => {
        const anchor = anchors[region.id];
        return anchor
          ? {
              region: {
                ...region,
                hotspot: { ...region.hotspot, position: anchor },
              },
              anchored: true,
            }
          : { region, anchored: false };
      }),
    [anchors],
  );

  const selectedRegion =
    regions.find((r) => r.region.id === selectedRegionId)?.region ?? null;

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [0, 1.3, 2.6], fov: 40 }}
      onPointerMissed={() => select(null)}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      <directionalLight position={[-2, 1, -1]} intensity={0.3} />
      <group>
        <BodyModel onAnchors={setAnchors} />
        {regions.map(({ region, anchored }) => (
          <RegionHotspot
            key={region.id}
            region={region}
            anchored={anchored}
            status={statuses[region.id] ?? null}
            isSelected={selectedRegionId === region.id}
            isHovered={hoveredRegionId === region.id}
            reducedMotion={reducedMotion}
            onSelect={() =>
              select(selectedRegionId === region.id ? null : region.id)
            }
            onHoverChange={(hovered) => hover(hovered ? region.id : null)}
          />
        ))}
      </group>
      <CameraRig
        controlsRef={controlsRef}
        selectedRegion={selectedRegion}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />
      <IdleRotationDriver active={!reducedMotion} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        minDistance={1.1}
        maxDistance={4}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI - Math.PI / 6}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
