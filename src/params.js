import { getScaledSettings } from '../utils/getScaledSettings.js';

export const envMaps = {
    'Aristea Wreck Puresky': '/assets/aristea_wreck_puresky_2k.hdr',
};

export const params = {
    multipleImportanceSampling: true,
    acesToneMapping: true,
    renderScale: 1 / window.devicePixelRatio,
    tiles: 1,

    model: '',

    envMap: envMaps['Aristea Wreck Puresky'],

    gradientTop: '#bfd8ff',
    gradientBottom: '#ffffff',

    environmentIntensity: 1.0,
    environmentRotation: 0,

    cameraProjection: 'Perspective',

    backgroundType: 'Environment',

    bgGradientTop: '#111111',
    bgGradientBottom: '#000000',
    backgroundBlur: 0.0,
    transparentBackground: false,
    checkerboardTransparency: true,

    enable: false,
    bounces: 5,
    filterGlossyFactor: 0.5,
    pause: false,

    floorColor: '#111111',
    floorOpacity: 1.0,
    floorRoughness: 0.2,
    floorMetalness: 0.2,

    // Performance Settings
    fpsLimitMode: '60 FPS', // Set to '60 FPS' to disable auto-throttling to 30fps
    enableDamping: true,

    // Snapshot Configs
    snapshots: {
        low: { samples: 16, bounces: 3, renderScale: 0.5 },
        med: { samples: 64, bounces: 5, renderScale: 0.75 },
        high: { samples: 256, bounces: 10, renderScale: 1.0 }
    },

    ...getScaledSettings(),
};

export const orthoWidth = 2;
