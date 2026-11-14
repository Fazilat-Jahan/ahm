/**
 * Procedural primitive body (SPEC §8.3 screen 3, fallback option 3: "build
 * a stylised body procedurally from three.js primitives... so the feature
 * is never blocked"). No textures, no external geometry — just capsules
 * and a sphere, lit by local lights only (no drei `<Environment preset>`,
 * which would fetch an HDRI from a CDN and break offline use). Used by
 * `BodyModel.tsx` whenever no `public/models/body.glb` is present.
 */
const BODY_COLOR = "#9fb3c8";

export function ProceduralBodyModel() {
  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.14, 24, 24]} />
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 1.58, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 12]} />
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 1.2, 0]}>
        <capsuleGeometry args={[0.28, 0.5, 4, 16]} />
        <meshStandardMaterial
          color={BODY_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
      {/* Arms */}
      {[-1, 1].map((side) => (
        <mesh key={`arm-${side}`} position={[0.45 * side, 1.18, 0]}>
          <capsuleGeometry args={[0.07, 0.5, 4, 12]} />
          <meshStandardMaterial
            color={BODY_COLOR}
            roughness={0.7}
            metalness={0}
          />
        </mesh>
      ))}
      {/* Legs */}
      {[-1, 1].map((side) => (
        <mesh key={`leg-${side}`} position={[0.15 * side, 0.45, 0]}>
          <capsuleGeometry args={[0.11, 0.65, 4, 12]} />
          <meshStandardMaterial
            color={BODY_COLOR}
            roughness={0.7}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}
