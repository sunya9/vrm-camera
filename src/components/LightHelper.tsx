import { Line } from "@react-three/drei";

interface LightHelperProps {
  position: [number, number, number];
  target?: [number, number, number];
}

export function LightHelper({ position, target = [0, 1.2, 0] }: LightHelperProps) {
  return (
    <group>
      {/* Sphere at light position */}
      <mesh position={position} renderOrder={999}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial
          color={0xffdd44}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </mesh>

      {/* Dashed line from light to target */}
      <Line
        points={[position, target]}
        color={0xffdd44}
        lineWidth={1}
        dashed
        dashSize={0.1}
        gapSize={0.05}
        transparent
        opacity={0.5}
      />
    </group>
  );
}
