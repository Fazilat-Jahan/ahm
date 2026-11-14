"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Object3D } from "three";
import { BODY_PARTS } from "@/config/bodyParts";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { ProceduralBodyModel } from "./ProceduralBodyModel";

const GLB_PATH = "/models/body.glb";

/** Draco decoder served from this app (`public/draco/`, copied from the
 * `three` package), never from a CDN. drei's default is a gstatic.com URL,
 * which would break offline use the moment a Draco-compressed GLB is
 * added. The decoder is only requested if the GLB actually uses Draco. */
const DRACO_DECODER_PATH = "/draco/";

/** The box every body is fitted to, so hotspot positions in
 * `config/bodyParts.ts` and the camera in `CameraRig` mean the same thing
 * for the procedural body and for any GLB: about 1.85 units tall, feet at
 * y = 0, centred on x and z. */
const MODEL_HEIGHT = 1.85;

/** Region id -> hotspot position taken from a named object in the GLB. */
export type RegionAnchors = Record<string, [number, number, number]>;

interface FittedModel {
  scale: number;
  offset: [number, number, number];
  anchors: RegionAnchors;
}

/** Scales and centres the loaded scene into the standard box, and finds
 * the centre of every object named after a region's `meshName`. */
function fitModel(scene: Object3D): FittedModel {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = size.y > 0 ? MODEL_HEIGHT / size.y : 1;
  const offset: [number, number, number] = [
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale,
  ];

  const anchors: RegionAnchors = {};
  for (const region of BODY_PARTS) {
    const object = scene.getObjectByName(region.meshName);
    if (!object) continue;
    const c = new Box3().setFromObject(object).getCenter(new Vector3());
    anchors[region.id] = [
      c.x * scale + offset[0],
      c.y * scale + offset[1],
      c.z * scale + offset[2],
    ];
  }
  return { scale, offset, anchors };
}

interface BodyModelProps {
  /** Called with the hotspot positions found in the GLB (empty when the
   * procedural body is shown, or the GLB has no `region_*` objects). */
  onAnchors?: (anchors: RegionAnchors) => void;
}

function GLBBodyModel({ onAnchors }: BodyModelProps) {
  const { scene } = useGLTF(GLB_PATH, DRACO_DECODER_PATH);
  const fitted = useMemo(() => fitModel(scene), [scene]);

  useEffect(() => {
    onAnchors?.(fitted.anchors);
    return () => onAnchors?.({});
  }, [fitted, onAnchors]);

  return (
    <group position={fitted.offset} scale={fitted.scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * SPEC §8.3 screen 3 model sourcing, in priority order: (1)
 * `public/models/body.glb`, if the user adds one — none ships with this
 * repo; a real model must be downloaded by the user under a licence that
 * allows reuse (CC0/CC-BY) and credited in README when added, never
 * invented here; (2) otherwise the procedural primitive body from C7.
 *
 * What a GLB gets automatically:
 * - any size/origin: it is fitted to the same box as the procedural body;
 * - Draco or Meshopt compression: both decoders are local;
 * - objects named `region_heart`, `region_lungs`, ... (the `meshName`
 *   values in `config/bodyParts.ts`): that region's hotspot moves to the
 *   object's centre. Regions with no matching object keep the hotspot
 *   position from `config/bodyParts.ts`, so an unsegmented model works too.
 *
 * This is the ONLY file (together with `config/bodyParts.ts`) that needs
 * to change to swap in a real model later — the clickable/coloured
 * hotspot spheres (`RegionHotspot`) are a layer on top of whichever body
 * this renders. `useGLTF` suspends while fetching and throws if
 * `body.glb` doesn't exist; the error boundary catches that and renders
 * the primitive body instead, same-origin and offline-safe either way.
 */
export function BodyModel({ onAnchors }: BodyModelProps) {
  return (
    <CanvasErrorBoundary fallback={<ProceduralBodyModel />}>
      <Suspense fallback={null}>
        <GLBBodyModel onAnchors={onAnchors} />
      </Suspense>
    </CanvasErrorBoundary>
  );
}
