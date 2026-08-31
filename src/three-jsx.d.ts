import type { ThreeElements } from '@react-three/fiber';
import type { MeshLineMaterialParameters } from 'meshline';

type MeshLineMaterialProps = Partial<MeshLineMaterialParameters> & {
    transparent?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
    blending?: number;
    side?: number;
};

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements extends ThreeElements {
            meshLineMaterial: MeshLineMaterialProps;
        }
    }
}

declare module 'react/jsx-runtime' {
    namespace JSX {
        interface IntrinsicElements extends ThreeElements {
            meshLineMaterial: MeshLineMaterialProps;
        }
    }
}

declare module 'react/jsx-dev-runtime' {
    namespace JSX {
        interface IntrinsicElements extends ThreeElements {
            meshLineMaterial: MeshLineMaterialProps;
        }
    }
}

export {};
