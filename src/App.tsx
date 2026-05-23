import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Stars,
    Trail,
    useTexture,
    Loader,
    Html
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useRef, useState, useMemo, Suspense, useEffect } from 'react';
import * as THREE from 'three';

// --- 1. 数据配置 ---
const PLANET_DATA = [
    { name: "水星", texture: "textures/mercury.jpg", size: 0.2, distance: 6, speed: 0.8, tilt: 0.03, rotationSpeed: 0.003, info: "距离太阳最近，昼夜温差极大。", color: "#b5b5b5" },
    { name: "金星", texture: "textures/venus.jpg", size: 0.3, distance: 8, speed: 0.6, tilt: 177.3, rotationSpeed: -0.002, info: "浓厚的大气层产生了极强的温室效应。", color: "#e8cda0" },
    { name: "地球", isEarth: true, size: 0.35, distance: 11, speed: 0.5, tilt: 23.5, rotationSpeed: 0.02, info: "布布跟一二的家，暗面可见城市灯光，边缘包裹着蓝色大气层。", color: "#4488ff" },
    { name: "火星", texture: "textures/mars.jpg", size: 0.25, distance: 14, speed: 0.4, tilt: 25.2, rotationSpeed: 0.018, info: "红色的荒漠世界。", color: "#c1440e" },
    { name: "木星", texture: "textures/jupiter.jpg", size: 1.0, distance: 20, speed: 0.2, tilt: 3.1, rotationSpeed: 0.04, info: "气态巨行星，体积巨大。", color: "#c8a55a" },
    { name: "土星", texture: "textures/saturn.jpg", size: 0.85, distance: 26, speed: 0.15, tilt: 26.7, hasRing: true, rotationSpeed: 0.038, info: "拥有壮丽的行星环系统。", color: "#e0d0a0" },
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

// --- 3. 太阳日冕 Shader (双层: 内层紧密 + 外层弥散) ---
const SunCoronaInner = {
    uniforms: {
        uTime: { value: 0 },
        uColorInner: { value: new THREE.Color(1.0, 0.85, 0.3) },
        uColorOuter: { value: new THREE.Color(1.0, 0.3, 0.05) },
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorInner;
        uniform vec3 uColorOuter;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vec3 viewDir = normalize(-vPosition);
            float intensity = pow(0.65 - dot(vNormal, viewDir), 2.5);
            vec3 corona = mix(uColorInner, uColorOuter, intensity);
            float pulse = 1.0 + 0.05 * sin(uTime * 2.0);
            gl_FragColor = vec4(corona * 2.5 * pulse, intensity * 0.9);
        }
    `
};

const SunCoronaOuter = {
    uniforms: {
        uTime: { value: 0 },
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vec3 viewDir = normalize(-vPosition);
            float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
            float glow = pow(rim, 1.5) * 0.6;
            float pulse = 1.0 + 0.08 * sin(uTime * 1.5);
            vec3 color = vec3(1.0, 0.6, 0.1) * glow * pulse;
            gl_FragColor = vec4(color, glow * 0.4);
        }
    `
};

// --- 4. 土星环渐变纹理 ---
function createSaturnRingTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    for (let i = 0; i < size; i++) {
        const t = i / size;
        let r = 180, g = 160, b = 120, a = 0;
        if (t < 0.25) { a = 80; r = 140; g = 120; b = 90; }
        else if (t < 0.5) { a = 200; }
        else if (t < 0.58) { a = 20; }
        else if (t < 0.78) { a = 160; r = 190; g = 170; b = 130; }
        else if (t < 0.83) { a = 30; }
        else { a = 100; r = 160; g = 140; b = 100; }
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(i, 0, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    return tex;
}

// --- 5. 银河背景组件 ---
function Galaxy() {
    const texture = useTexture("textures/8k_stars_milky_way.jpg");
    return (
        <mesh scale={[-400, -400, -400]}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
    );
}

// --- 6. HUD 信息面板 ---
const HUD = ({ selectedPlanet }: { selectedPlanet: any }) => {
    return (
        <div style={{
            position: 'absolute', right: '40px', top: '50%', transform: 'translateY(-50%)',
            width: '280px', padding: '24px', borderRadius: '12px', zIndex: 100,
            background: selectedPlanet ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white',
            fontFamily: 'sans-serif', pointerEvents: 'none',
            textAlign: 'center'
        }}>
            {selectedPlanet ? (
                <>
                    <h2 style={{ margin: '0 0 10px 0', fontSize: '28px', color: '#4488ff' }}>{selectedPlanet.name}</h2>
                    <p style={{ fontSize: '14px', lineHeight: '1.6', opacity: 0.8 }}>{selectedPlanet.info}</p>
                </>
            ) : (
                <p style={{ fontSize: '13px', lineHeight: '1.6', opacity: 0.4 }}>
                    点击行星查看详情<br />拖拽旋转视角 · 滚轮缩放
                </p>
            )}
        </div>
    );
};

// --- 7. 太阳组件 ---
const Sun = ({ onSelect }: any) => {
    const texture = useTexture("textures/2k_sun.jpg");
    const coronaInnerRef = useRef<THREE.ShaderMaterial>(null);
    const coronaOuterRef = useRef<THREE.ShaderMaterial>(null);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (coronaInnerRef.current) coronaInnerRef.current.uniforms.uTime.value = t;
        if (coronaOuterRef.current) coronaOuterRef.current.uniforms.uTime.value = t;
    });

    return (
        <group onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            <mesh>
                <sphereGeometry args={[2.5, 64, 64]} />
                <meshBasicMaterial map={texture} color={[1.5, 1.1, 0.7]} toneMapped={false} />
            </mesh>
            {/* 内层日冕: 紧贴太阳表面 */}
            <mesh scale={[1.15, 1.15, 1.15]}>
                <sphereGeometry args={[2.5, 64, 64]} />
                <shaderMaterial ref={coronaInnerRef} args={[SunCoronaInner]} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
            </mesh>
            {/* 外层光晕: 弥散效果 */}
            <mesh scale={[1.4, 1.4, 1.4]}>
                <sphereGeometry args={[2.5, 48, 48]} />
                <shaderMaterial ref={coronaOuterRef} args={[SunCoronaOuter]} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
            </mesh>
            <pointLight intensity={50} distance={150} decay={2} />
        </group>
    );
};

// --- 8. 行星组件 ---
const PlanetObject = ({ data, isFocused, onSelect }: any) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const [hovered, setHover] = useState(false);
    const moonRef = useRef<THREE.Group>(null);

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
            t.minFilter = THREE.LinearMipmapLinearFilter;
        });
    }, [textures, regularTexture, data.isEarth]);

    const saturnRingTex = useMemo(() => createSaturnRingTexture(), []);

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.rotation.y += data.rotationSpeed ?? 0.005;
            if (data.isEarth && materialRef.current) {
                const worldPos = new THREE.Vector3();
                meshRef.current.getWorldPosition(worldPos);
                materialRef.current.uniforms.uSunDir.value.copy(worldPos).negate();
            }
            if (moonRef.current) {
                const t = Date.now() * 0.001;
                moonRef.current.position.set(Math.cos(t) * 1.2, 0.15, Math.sin(t) * 1.2);
            }
        }
    });

    return (
        <group position={[data.distance, 0, 0]}>
            <group rotation={[0, 0, THREE.MathUtils.degToRad(data.tilt)]}>
                <group ref={(node) => { if (isFocused && node) onSelect(node); }}>
                    <Trail width={0.4} length={4} color={isFocused ? "#fff" : data.color} opacity={isFocused ? 0.5 : 0.15}>
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
                                    map={regularTexture} roughness={0.7} metalness={0.1}
                                    emissive={isFocused ? data.color : "#000000"}
                                    emissiveIntensity={isFocused ? 0.3 : 0} />
                            )}
                        </mesh>
                    </Trail>
                    {/* 选中/悬停发光层 (非地球) */}
                    {(isFocused || hovered) && !data.isEarth && (
                        <mesh>
                            <sphereGeometry args={[data.size * 1.15, 32, 32]} />
                            <meshBasicMaterial color={isFocused ? data.color : "#ffffff"} transparent opacity={0.06} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
                        </mesh>
                    )}
                    {/* 月球 */}
                    {data.isEarth && (
                        <group ref={moonRef} position={[1.2, 0.15, 0]}>
                            <mesh>
                                <sphereGeometry args={[0.08, 32, 32]} />
                                <meshStandardMaterial map={useTexture("textures/moon.jpg")} roughness={0.9} />
                            </mesh>
                        </group>
                    )}
                    <Html distanceFactor={8}>
                        <div style={{ opacity: hovered || isFocused ? 1 : 0, color: 'white', background: 'rgba(0,0,0,0.8)', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', border: `1px solid ${isFocused ? data.color : '#4488ff'}`, whiteSpace: 'nowrap' }}>
                            {data.name}
                        </div>
                    </Html>
                    {/* 土星环 */}
                    {data.hasRing && (
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                            <ringGeometry args={[data.size * 1.4, data.size * 2.2, 128]} />
                            <meshStandardMaterial map={saturnRingTex} transparent opacity={0.85} side={THREE.DoubleSide} roughness={0.9} metalness={0.1} />
                        </mesh>
                    )}
                </group>
            </group>
        </group>
    );
};

// --- 9. 公转轨道组 ---
function OrbitingGroup({ children, speed }: { children: React.ReactNode, speed: number }) {
    const ref = useRef<THREE.Group>(null);
    const offset = useMemo(() => Math.random() * 100, []);
    useFrame(({ clock }) => {
        if (ref.current) ref.current.rotation.y = (clock.getElapsedTime() + offset) * speed * 0.15;
    });
    return <group ref={ref}>{children}</group>;
}

// --- 10. 相机跟随 ---
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

// --- 11. 主场景 ---
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
                    <Galaxy />
                    <Stars radius={300} count={3000} factor={4} fade />

                    <ambientLight intensity={0.3} />
                    <Sun onSelect={() => setSelectedName(null)} />

                    {PLANET_DATA.map((planet) => (
                        <group key={planet.name}>
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[planet.distance - 0.015, planet.distance + 0.015, 128]} />
                                <meshBasicMaterial color={planet.color} opacity={0.15} transparent />
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

                <EffectComposer multisampling={0}>
                    <Bloom luminanceThreshold={0.6} intensity={2.0} radius={0.8} />
                    <Vignette eskil={false} offset={0.1} darkness={1.1} />
                </EffectComposer>
            </Canvas>
            <Loader />
        </div>
    );
}
