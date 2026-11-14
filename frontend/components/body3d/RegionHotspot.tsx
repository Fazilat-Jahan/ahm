"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { MeshStandardMaterial } from "three";
import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";
import { resolveStatusColor } from "@/lib/body/statusColor";
import type { BodyPart } from "@/config/bodyParts";

interface RegionHotspotProps {
  region: BodyPart;
  /** True when the position came from a named object inside the GLB.
   * Such an object (an organ) usually sits inside the body mesh, so the
   * hotspot is drawn on top of the body instead of being hidden by it. */
  anchored?: boolean;
  status: Status | null;
  isSelected: boolean;
  isHovered: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/** SPEC §8.3 screen 3: "Material emissive colour + pulse animation by
 * status... respect prefers-reduced-motion (no pulse, static glow)." Only
 * `critical` pulses, matching the same "only the most urgent status
 * pulses" choice already made for 2D status UI in C5 (see
 * docs/DECISIONS.md) — a constantly-pulsing yellow/green region would be
 * visual noise for a routine result. */
export function RegionHotspot({
  region,
  anchored = false,
  status,
  isSelected,
  isHovered,
  reducedMotion,
  onSelect,
  onHoverChange,
}: RegionHotspotProps) {
  const materialRef = useRef<MeshStandardMaterial>(null);
  const { invalidate } = useThree();
  const color = useMemo(() => resolveStatusColor(status), [status]);
  const statusConfig = status ? getStatusConfig(status) : null;
  const StatusIcon = statusConfig?.icon;
  const shouldPulse = status === "critical" && !reducedMotion;
  const baseIntensity =
    status === null ? 0.15 : isHovered || isSelected ? 0.9 : 0.55;

  // `frameloop="demand"`: only keep requesting new frames while something is
  // actually animating (the critical pulse). Otherwise this callback still
  // runs on every externally-triggered frame (hover/selection/camera moves)
  // but never re-schedules itself.
  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    if (shouldPulse) {
      material.emissiveIntensity =
        baseIntensity + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      invalidate();
    } else {
      material.emissiveIntensity = baseIntensity;
    }
  });

  return (
    <group position={region.hotspot.position}>
      <mesh
        renderOrder={anchored ? 10 : 0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverChange(true);
        }}
        onPointerOut={() => onHoverChange(false)}
      >
        <sphereGeometry args={[region.hotspot.radius, 16, 16]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={baseIntensity}
          transparent
          opacity={0.78}
          depthTest={!anchored}
        />
      </mesh>
      {isSelected && (
        <mesh scale={1.3} raycast={() => null}>
          <sphereGeometry args={[region.hotspot.radius, 16, 16]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
      )}
      {isHovered && !isSelected && (
        // No `distanceFactor`: the tooltip stays at its normal CSS text size
        // instead of scaling up with camera distance. The wrapper ignores
        // pointer events so the tooltip (which sits under the cursor) never
        // swallows the click meant for the hotspot on the canvas, and it
        // floats just above the hotspot rather than on top of it.
        <Html
          center
          position={[0, region.hotspot.radius + 0.07, 0]}
          wrapperClass="pointer-events-none"
          className="pointer-events-none"
        >
          <div className="pointer-events-none flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-xs whitespace-nowrap text-white shadow">
            <span className="font-medium">{region.label}</span>
            <span aria-hidden="true">·</span>
            {statusConfig && StatusIcon ? (
              <>
                <StatusIcon size={12} aria-hidden="true" />
                <span>{statusConfig.label}</span>
              </>
            ) : (
              <span>No data yet</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
