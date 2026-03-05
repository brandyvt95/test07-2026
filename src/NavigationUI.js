import { state } from './state.js';
import { Vector3, Box3 } from 'three';

export class NavigationUI {
    constructor() {
        this.boothCameras = [];
        this.currentIndex = 0; // Index in boothCameras
        this.mainCameraObj = null;

        this._initUI();
    }

    // Scan for cameras and identify booth views
    refresh() {
        if (!state.modelCar) return;

        const cameras = [];
        state.modelCar.traverse(c => {
            if (c.isCamera) {
                if (c.name.includes('gianhang')) {
                    cameras.push(c);
                } else if (c.name.toLowerCase().includes('main')) {
                    this.mainCameraObj = c;
                }
            }
        });

        // Sort booths numerically if possible (gianhang_1, gianhang_2...)
        cameras.sort((a, b) => {
            const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
            const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
            return numA - numB;
        });

        // Full navigation list: [Main, Booth 1, Booth 2, ...]
        this.boothCameras = [];
        if (this.mainCameraObj) this.boothCameras.push(this.mainCameraObj);
        this.boothCameras.push(...cameras);

        console.log(`[Navigation] Found ${this.boothCameras.length} views:`, this.boothCameras.map(c => c.name));
        this._updateCurrentIndex();
    }

    // Public sync method to keep UI in sync with external camera changes (e.g. Ray clicks)
    sync() {
        this._updateCurrentIndex();
    }

    _updateCurrentIndex() {
        if (this.boothCameras.length === 0) return;
        const currentName = state.controls?.currentCameraName;
        const index = this.boothCameras.findIndex(c => c.name === currentName);
        if (index !== -1) {
            this.currentIndex = index;
            console.log(`[Navigation] Sync: Current index is now ${this.currentIndex} (${currentName})`);
        }
    }

    _initUI() {
        const container = document.createElement('div');
        container.id = 'nav-ui';
        container.style.cssText = `
            position: absolute;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 15px;
            z-index: 10000;
        `;

        const btnStyle = `
            background: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            font-size: 14px;
            backdrop-filter: blur(5px);
            transition: all 0.2s ease;
            user-select: none;
        `;

        const prevBtn = this._createButton('PREV', btnStyle, () => this.navigate(-1));
        const exitBtn = this._createButton('EXIT', btnStyle, () => this.exit());
        const nextBtn = this._createButton('NEXT', btnStyle, () => this.navigate(1));

        container.appendChild(prevBtn);
        container.appendChild(exitBtn);
        container.appendChild(nextBtn);

        document.body.appendChild(container);

        // Hover effects
        [prevBtn, exitBtn, nextBtn].forEach(btn => {
            btn.onmouseover = () => btn.style.background = 'rgba(255, 0, 0, 0.8)';
            btn.onmouseout = () => btn.style.background = 'rgba(0, 0, 0, 0.7)';
        });
    }

    _createButton(text, style, onClick) {
        const btn = document.createElement('div');
        btn.innerText = text;
        btn.style.cssText = style;
        btn.addEventListener('click', onClick);
        return btn;
    }

    navigate(dir) {
        if (this.boothCameras.length === 0) this.refresh();
        if (this.boothCameras.length === 0) return;

        this.currentIndex = (this.currentIndex + dir + this.boothCameras.length) % this.boothCameras.length;
        const targetCam = this.boothCameras[this.currentIndex];

        this._moveTo(targetCam);
    }

    exit() {
        if (!this.mainCameraObj) this.refresh();
        if (this.mainCameraObj) {
            this._moveTo(this.mainCameraObj);
        }
    }

    _moveTo(targetCam) {
        if (!state.controls) return;

        let orbitCenter = new Vector3(0, 0, 0);

        // If it's a booth, try to find a booth bound or car to orbit
        if (targetCam.name.includes('gianhang')) {
            // Find corresponding bound mesh for the booth ID
            const id = targetCam.name.match(/\d+/)?.[0];
            let boundMesh = null;
            if (id && state.modelCar) {
                state.modelCar.traverse(c => {
                    if (c.name === `bound_gianhang_${id}`) boundMesh = c;
                });
            }

            if (boundMesh) {
                const box = new Box3().setFromObject(boundMesh);
                box.getCenter(orbitCenter);
            }
        }

        state.controls.transitionTo(targetCam, orbitCenter);
        this._updateCurrentIndex();
    }
}
