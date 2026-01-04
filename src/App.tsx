import { Canvas, useFrame } from '@react-three/fiber';
import {
    OrbitControls,
    Stars,
    Html,
    Trail,
    useTexture,
    Text,
    Billboard,
    Loader
} from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useState, useMemo, Suspense } from 'react';
import * as THREE from 'three';

// --- 纹理资源 URL 配置 (使用开源稳定的图床) ---
// 修改 App.tsx 中的 TEXTURES 配置
const TEXTURES = {
    sun: "textures/sun.jpg",
    mercury: "textures/mercury.jpg",
    venus: "textures/venus.jpg",
    earth: "textures/earth.jpg",
    mars: "textures/mars.jpg",
    jupiter: "textures/jupiter.jpg",
    saturn: "textures/saturn.jpg",
    uranus: "textures/uranus.jpg",
    neptune: "textures/neptune.jpg"
};

// --- 行星配置数据 ---
const PLANET_DATA = [
    { name: "水星", texture: TEXTURES.mercury, size: 0.2, distance: 6, speed: 0.8 },
    { name: "金星", texture: TEXTURES.venus, size: 0.3, distance: 8, speed: 0.6 },
    { name: "地球", texture: TEXTURES.earth, size: 0.35, distance: 11, speed: 0.5 },
    { name: "火星", texture: TEXTURES.mars, size: 0.25, distance: 14, speed: 0.4 },
    { name: "木星", texture: TEXTURES.jupiter, size: 1.0, distance: 20, speed: 0.2 },
    { name: "土星", texture: TEXTURES.saturn, size: 0.9, distance: 26, speed: 0.15, hasRing: true },
    { name: "天王星", texture: TEXTURES.uranus, size: 0.6, distance: 32, speed: 0.1 },
    { name: "海王星", texture: TEXTURES.neptune, size: 0.6, distance: 36, speed: 0.08 },
];

// --- 太阳组件 (带文字) ---
const Sun = () => {
    // 加载太阳纹理
    const texture = useTexture(TEXTURES.sun);

    return (
        <group>
            {/* 太阳本体 */}
            <mesh>
                <sphereGeometry args={[2.5, 64, 64]} />
                <meshBasicMaterial map={texture} color="#ffddaa" />
            </mesh>

            {/* 核心光源 */}
            <pointLight
                intensity={3}
                distance={100}
                decay={1}
                color="#ffffff"
            />

            {/* 告白文字 - 使用 Billboard 让文字始终面向相机 */}
            <Billboard position={[0, 3.5, 0]}>
                <Text
                    fontSize={1}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.02}
                    outlineColor="#ff0000" // 红色描边，更有爱意
                >
                    I LOVE YOU
                    <meshBasicMaterial toneMapped={false} />
                </Text>
            </Billboard>
        </group>
    );
};

// --- 行星组件 ---
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
const Planet = ({ planet }) => {
    const planetRef = useRef<THREE.Mesh>(null);
    const orbitRef = useRef<THREE.Group>(null);
    const [hovered, setHover] = useState(false);

    // 加载对应行星的纹理
    const texture = useTexture(planet.texture);

    // 随机初始角度
    // eslint-disable-next-line react-hooks/purity
    const initialAngle = useMemo(() => Math.random() * Math.PI * 2, []);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime() * planet.speed * 0.3;

        if (orbitRef.current) {
            orbitRef.current.rotation.y = t + initialAngle;
        }
        if (planetRef.current) {
            planetRef.current.rotation.y += 0.005; // 自转
        }
    });

    return (
        <group>
            {/* 轨道线 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[planet.distance - 0.1, planet.distance + 0.1, 128]} />
                <meshBasicMaterial color="#ffffff" opacity={0.08} transparent side={THREE.DoubleSide} />
            </mesh>

            <group ref={orbitRef}>
                <group position={[planet.distance, 0, 0]}>
                    <Html distanceFactor={15}>
                        <div style={{
                            opacity: hovered ? 1 : 0,
                            color: 'white',
                            background: 'rgba(0,0,0,0.8)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            transform: 'translate3d(-50%, -150%, 0)',
                            transition: 'opacity 0.2s',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap'
                        }}>
                            {planet.name}
                        </div>
                    </Html>

                    <Trail width={2} length={6} color="#ffffff" attenuation={(t) => t * t}>
                        <mesh
                            ref={planetRef}
                            onPointerOver={() => setHover(true)}
                            onPointerOut={() => setHover(false)}
                        >
                            <sphereGeometry args={[planet.size, 64, 64]} />
                            {/* 使用 standard material 配合 texture */}
                            <meshStandardMaterial
                                /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
                                // @ts-expect-error
                                map={texture}
                                roughness={0.8}
                                metalness={0.1}
                            />
                        </mesh>
                    </Trail>

                    {/* 土星环 (使用几何体模拟，也可以加纹理，这里简化处理) */}
                    {planet.hasRing && (
                        <mesh rotation={[-Math.PI / 2.2, 0, 0]}>
                            <ringGeometry args={[planet.size * 1.4, planet.size * 2.2, 64]} />
                            <meshStandardMaterial
                                color="#C6A686"
                                transparent
                                opacity={0.8}
                                side={THREE.DoubleSide}
                            />
                        </mesh>
                    )}
                </group>
            </group>
        </group>
    );
};

// --- 主程序 ---
export default function SolarSystem() {
    return (
        <>
            <Canvas
                shadows
                camera={{ position: [0, 20, 35], fov: 45 }}
                style={{ background: '#000000', height: '100vh', width: '100vw' }}
            >
                {/* 1. 环境设置 */}
                <Stars radius={200} depth={50} count={10000} factor={4} saturation={0} fade speed={0.5} />
                <ambientLight intensity={0.02} />

                {/* 2. 核心内容 (使用 Suspense 等待纹理加载) */}
                <Suspense fallback={null}>
                    <Sun />
                    {PLANET_DATA.map((data, index) => (
                        <Planet key={index} planet={data} />
                    ))}
                </Suspense>

                {/* 3. 后期特效 (让太阳和文字发光) */}
                <EffectComposer enableNormalPass>
                    <Bloom
                        luminanceThreshold={0.9} // 只有很亮的东西才发光
                        mipmapBlur
                        intensity={2.0}
                        radius={0.5}
                    />
                </EffectComposer>

                {/* 4. 控制器 */}
                <OrbitControls
                    enablePan={false}
                    minDistance={10}
                    maxDistance={100}
                />
            </Canvas>

            {/* 加载进度条 */}
            <Loader />
        </>
    );
}