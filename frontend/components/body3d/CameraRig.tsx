"use client";

import { useEffect, useRef, type ComponentRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BodyPart } from "@/config/bodyParts";

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 1.3, 2.6);
const DEFAULT_TARGET = new THREE.Vector3(0, 1.2, 0);

export type OrbitControlsRef = ComponentRef<typeof OrbitControls>;

interface CameraRigProps {
  controlsRef: RefObject<OrbitControlsRef | null>;
  selectedRegion: BodyPart | null;
  /** Bumped by the "Reset view" button so the rig re-homes even when the
   * selection itself doesn't change (nothing was selected to begin with). */
  resetToken: number;
  reducedMotion: boolean;
}

/** SPEC §8.3 screen 3: "CameraRig animates the camera to the region (lerp),
 * with a 'Reset view' button." Runs under `frameloop="demand"`: it only
 * calls `invalidate()` while actually mid-flight, and snaps instantly
 * (one-frame lerp) under `prefers-reduced-motion`. */
export function CameraRig({
  controlsRef,
  selectedRegion,
  resetToken,
  reducedMotion,
}: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const goalPosition = useRef(DEFAULT_CAMERA_POSITION.clone());
  const goalTarget = useRef(DEFAULT_TARGET.clone());
  const flying = useRef(false);

  useEffect(() => {
    if (selectedRegion) {
      const [x, y, z] = selectedRegion.hotspot.position;
      const outward = new THREE.Vector3(x, 0, z);
      if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1);
      outward.normalize();
      goalPosition.current.set(
        x + outward.x * 0.55,
        y + 0.12,
        z + outward.z * 0.55 + 0.35,
      );
      goalTarget.current.set(x, y, z);
    } else {
      goalPosition.current.copy(DEFAULT_CAMERA_POSITION);
      goalTarget.current.copy(DEFAULT_TARGET);
    }
    flying.current = true;
    invalidate();
    // resetToken is a deliberate dependency: bumping it re-homes the
    // camera even when selectedRegion is unchanged (already null).
  }, [selectedRegion, resetToken, invalidate]);

  useFrame(() => {
    if (!flying.current) return;
    const controls = controlsRef.current;
    const lerpFactor = reducedMotion ? 1 : 0.12;
    camera.position.lerp(goalPosition.current, lerpFactor);
    if (controls) {
      controls.target.lerp(goalTarget.current, lerpFactor);
      controls.update();
    }
    const arrived =
      camera.position.distanceTo(goalPosition.current) < 0.01 &&
      (!controls || controls.target.distanceTo(goalTarget.current) < 0.01);
    if (arrived || reducedMotion) {
      camera.position.copy(goalPosition.current);
      if (controls) {
        controls.target.copy(goalTarget.current);
        controls.update();
      }
      flying.current = false;
    } else {
      invalidate();
    }
  });

  return null;
}
