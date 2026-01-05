import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Stars,
    Trail,
    useTexture,
    Text,
    Billboard,
    Loader,
    Html
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useRef, useState, useMemo, Suspense } from 'react';
import * as THREE from 'three';

// --- 1. 数据配置 ---
const PLANET_DATA = [
    { name: "水星", texture: "textures/mercury.jpg", size: 0.2, distance: 6, speed: 0.8, tilt: 0.03, info: "距离太阳最近，昼夜温差极大。" },
    { name: "金星", texture: "textures/venus.jpg", size: 0.3, distance: 8, speed: 0.6, tilt: 177.3, info: "浓厚的大气层产生了极强的温室效应。" },
    { name: "地球", isEarth: true, size: 0.35, distance: 11, speed: 0.5, tilt: 23.5, info: "布布跟一二的家，暗面可见城市灯光，边缘包裹着蓝色大气层。" },
    { name: "火星", texture: "textures/mars.jpg", size: 0.25, distance: 14, speed: 0.4, tilt: 25.2, info: "红色的荒漠世界。" },
    { name: "木星", texture: "textures/jupiter.jpg", size: 1.0, distance: 20, speed: 0.2, tilt: 3.1, info: "气态巨行星，体积巨大。" },
    { name: "土星", texture: "textures/saturn.jpg", size: 0.85, distance: 26, speed: 0.15, tilt: 26.7, hasRing: true, info: "拥有壮丽的行星环系统。" },
];

// --- 2. 地球 Shader 材质 ---
const EarthShaderMaterial = {
    uniforms: {
        uDayTex: { value: null },
        uNightTex: { value: null },
        uCloudTex: { value: null },
        uNormalTex: { value: null },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
            vViewDir = normalize(cameraPosition - worldPosition.xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uDayTex;
        uniform sampler2D uNightTex;
        uniform sampler2D uCloudTex;
        uniform sampler2D uNormalTex;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
            vec3 normalMap = texture2D(uNormalTex, vUv).rgb * 2.0 - 1.0;
            vec3 bumpedNormal = normalize(vNormal + normalMap * 0.15); 

            vec3 L = normalize(uSunDir);
            float dotLight = dot(bumpedNormal, L);
            
            vec3 day = texture2D(uDayTex, vUv).rgb;
            vec3 night = texture2D(uNightTex, vUv).rgb;
            vec3 clouds = texture2D(uCloudTex, vUv).rgb;

            float mixFactor = smoothstep(-0.1, 0.1, dotLight);
            vec3 nightLights = clamp(night * 1.3, 0.0, 0.8); 
            vec3 baseColor = mix(nightLights, day, mixFactor);

            float cloudIntensity = clamp(clouds.r, 0.0, 0.8);
            baseColor = mix(baseColor, vec3(0.9), cloudIntensity * mixFactor * 0.35);

            float fresnel = pow(1.0 - max(0.0, dot(vNormal, vViewDir)), 5.0);
            vec3 atmosphereColor = vec3(0.3, 0.6, 1.0) * fresnel * 0.4;

            gl_FragColor = vec4(clamp(baseColor + atmosphereColor, 0.0, 1.2), 1.0);
        }
    `
};

// --- 3. 银河背景组件 ---
function Galaxy() {
    // 使用你目录下的 8k 银河贴图
    const texture = useTexture("textures/8k_stars_milky_way.jpg");
    return (
        <mesh scale={[-400, -400, -400]}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
    );
}

// --- 4. 其他 UI 与逻辑组件 ---

const HUD = ({ selectedPlanet }: { selectedPlanet: any }) => {
    if (!selectedPlanet) return null;
    return (
        <div style={{
            position: 'absolute', right: '40px', top: '50%', transform: 'translateY(-50%)',
            width: '280px', padding: '24px', borderRadius: '12px', zIndex: 100,
            background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white',
            fontFamily: 'sans-serif', pointerEvents: 'none'
        }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '28px', color: '#4488ff' }}>{selectedPlanet.name}</h2>
            <p style={{ fontSize: '14px', lineHeight: '1.6', opacity: 0.8 }}>{selectedPlanet.info}</p>
        </div>
    );
};

const Sun = ({ onSelect }: any) => {
    const texture = useTexture("textures/2k_sun.jpg");
    return (
        <group onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            <mesh>
                <sphereGeometry args={[2.5, 64, 64]} />
                <meshBasicMaterial map={texture} color={[1.5, 1.1, 0.7]} toneMapped={false} />
            </mesh>
            <pointLight intensity={50} distance={150} decay={2} />
            <Billboard position={[0, 3.2, 0]}>
                <Text fontSize={0.4} color="#ffffff">
                    I LOVE YOU
                    <meshBasicMaterial toneMapped={false} color={[4, 4, 4]} />
                </Text>
            </Billboard>
        </group>
    );
};

const PlanetObject = ({ data, isFocused, onSelect }: any) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const [hovered, setHover] = useState(false);

    const textures = useTexture({
        day: "textures/2k_earth_daymap.jpg",
        night: "textures/2k_earth_nightmap.jpg",
        clouds: "textures/2k_earth_clouds.jpg",
        normal: "textures/2k_earth_normal_map.jpg"
    });
    const regularTexture = useTexture(data.texture || "textures/mercury.jpg");

    useMemo(() => {
        const texList = data.isEarth ? Object.values(textures) : [regularTexture];
        texList.forEach(t => {
            // @ts-ignore
            t.anisotropy = 16;
            // @ts-ignore
            t.minFilter = THREE.LinearMipmapLinearFilter; });
    }, [textures, regularTexture, data.isEarth]);

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.005;
            if (data.isEarth && materialRef.current) {
                const worldPos = new THREE.Vector3();
                meshRef.current.getWorldPosition(worldPos);
                materialRef.current.uniforms.uSunDir.value.copy(worldPos).negate();
            }
        }
    });

    return (
        <group position={[data.distance, 0, 0]}>
            <group rotation={[0, 0, THREE.MathUtils.degToRad(data.tilt)]}>
                <group ref={(node) => { if (isFocused && node) onSelect(node); }}>
                    <Trail width={0.4} length={4} color={isFocused ? "#fff" : "#111"}>
                        <mesh ref={meshRef} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }}
                              onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
                            <sphereGeometry args={[data.size, 64, 64]} />
                            {data.isEarth ? (
                                <shaderMaterial ref={materialRef} args={[EarthShaderMaterial]}
                                                uniforms-uDayTex-value={textures.day}
                                                uniforms-uNightTex-value={textures.night}
                                                uniforms-uCloudTex-value={textures.clouds}
                                                uniforms-uNormalTex-value={textures.normal}
                                />
                            ) : (
                                <meshStandardMaterial
                                    // @ts-ignore
                                    map={regularTexture} roughness={0.8} />
                            )}
                        </mesh>
                    </Trail>
                    {data.isEarth && (
                        <mesh scale={[1.06, 1.06, 1.06]}>
                            <sphereGeometry args={[data.size, 64, 64]} />
                            <meshBasicMaterial color="#4488ff" transparent opacity={0.08} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
                        </mesh>
                    )}
                    <Html distanceFactor={8}>
                        <div style={{ opacity: hovered || isFocused ? 1 : 0, color: 'white', background: 'rgba(0,0,0,0.8)', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', border: '1px solid #4488ff', whiteSpace: 'nowrap' }}>
                            {data.name}
                        </div>
                    </Html>
                    {data.hasRing && (
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                            <ringGeometry args={[data.size * 1.4, data.size * 2.2, 64]} />
                            <meshStandardMaterial color="#888" transparent opacity={0.4} side={THREE.DoubleSide} />
                        </mesh>
                    )}
                </group>
            </group>
        </group>
    );
};

function OrbitingGroup({ children, speed }: { children: React.ReactNode, speed: number }) {
    const ref = useRef<THREE.Group>(null);
    const offset = useMemo(() => Math.random() * 100, []);
    useFrame(({ clock }) => {
        if (ref.current) ref.current.rotation.y = (clock.getElapsedTime() + offset) * speed * 0.15;
    });
    return <group ref={ref}>{children}</group>;
}

function CameraTracker({ targetRef }: any) {
    const { controls } = useThree() as any;
    useFrame(() => {
        if (controls && targetRef.current) {
            const vec = new THREE.Vector3();
            targetRef.current.getWorldPosition(vec);
            controls.target.lerp(vec, 0.08);
            controls.update();
        }
    });
    return null;
}

// --- 5. 主场景 ---

export default function SolarSystem() {
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const targetRef = useRef<THREE.Group | null>(null);
    const selectedData = useMemo(() => PLANET_DATA.find(p => p.name === selectedName), [selectedName]);

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'fixed' }}>
            <HUD selectedPlanet={selectedData} />
            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 20, 45], fov: 45 }}
                    gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
                <Suspense fallback={null}>
                    {/* 银河背景 */}
                    <Galaxy />

                    {/* 辅以少量随机星星粒子，增强视差感 */}
                    <Stars radius={300} count={3000} factor={4} fade />

                    <ambientLight intensity={0.3} />
                    <Sun onSelect={() => setSelectedName(null)} />

                    {PLANET_DATA.map((planet) => (
                        <group key={planet.name}>
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[planet.distance - 0.015, planet.distance + 0.015, 128]} />
                                <meshBasicMaterial color="white" opacity={0.07} transparent />
                            </mesh>
                            <OrbitingGroup speed={planet.speed}>
                                <PlanetObject
                                    data={planet}
                                    isFocused={selectedName === planet.name}
                                    onSelect={(ref: any) => { setSelectedName(planet.name); targetRef.current = ref; }}
                                />
                            </OrbitingGroup>
                        </group>
                    ))}
                    <CameraTracker targetRef={targetRef} />
                </Suspense>

                <OrbitControls makeDefault enablePan={false} minDistance={5} maxDistance={200} />

                <EffectComposer>
                    <Bloom luminanceThreshold={0.9} intensity={1.5} mipmapBlur radius={0.4} />
                    <Vignette offset={0.1} darkness={1.1} />
                </EffectComposer>
            </Canvas>
            <Loader />
        </div>
    );
}