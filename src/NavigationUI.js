import { state } from './state.js';
import { Vector3, Box3 } from 'three';

export class NavigationUI {
    constructor() {
        this.boothCameras = [];
        this.currentIndex = 0; // Index in boothCameras
        this.mainCameraObj = null;

        this._initUI();
    }

    // Scan for cameras and identify booth views using config
    refresh() {
        if (!state.modelCar || !state.boothConfig) return;

        const cameras = [];
        const configBooths = state.boothConfig.booths;

        state.modelCar.traverse(c => {
            if (c.isCamera) {
                // Find if this camera is registered in our booth config
                const isBooth = configBooths.some(b => b.boothCamera === c.name);
                if (isBooth) {
                    cameras.push(c);
                } else if (c.name.toLowerCase().includes('main')) {
                    this.mainCameraObj = c;
                }
            }
        });

        // Sort based on the order in JSON config
        cameras.sort((a, b) => {
            const idxA = configBooths.findIndex(booth => booth.boothCamera === a.name);
            const idxB = configBooths.findIndex(booth => booth.boothCamera === b.name);
            return idxA - idxB;
        });

        // Full navigation list: [Main, Booth A, Booth B, ...]
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
            bottom: 40px;
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
            padding: 10px 25px;
            border-radius: 40px;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 1px;
            backdrop-filter: blur(10px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        `;

        const prevBtn = this._createButton('PREV', btnStyle, () => this.navigate(-1));
        const exitBtn = this._createButton('HOME', btnStyle, () => this.exit());
        const nextBtn = this._createButton('NEXT', btnStyle, () => this.navigate(1));

        container.appendChild(prevBtn);
        container.appendChild(exitBtn);
        container.appendChild(nextBtn);

        document.body.appendChild(container);

        // Hover effects logic
        [prevBtn, exitBtn, nextBtn].forEach(btn => {
            btn.onmouseover = () => {
                btn.style.background = 'rgba(255, 255, 255, 0.2)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                btn.style.transform = 'translateY(-2px)';
            };
            btn.onmouseout = () => {
                btn.style.background = 'rgba(0, 0, 0, 0.7)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                btn.style.transform = 'translateY(0)';
            };
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
        if (this.boothCameras.length <= 1) this.refresh();
        if (this.boothCameras.length <= 1) return;

        this.currentIndex = (this.currentIndex + dir + this.boothCameras.length) % this.boothCameras.length;
        const targetCam = this.boothCameras[this.currentIndex];

        this._moveTo(targetCam);
    }

    exit() {
        if (!this.mainCameraObj) this.refresh();
        if (this.mainCameraObj) {
            console.log("[Navigation] Exiting to Home View");
            this._moveTo(this.mainCameraObj);
        }
    }

    _moveTo(targetCam) {
        if (!state.controls) return;

        let orbitCenter = new Vector3(0, 0, 0);

        // Determine orbit center from boothConfig bounds
        if (state.boothConfig?.booths) {
            const booth = state.boothConfig.booths.find(b => b.boothCamera === targetCam.name);
            if (booth && state.modelCar) {
                let boundMesh = null;
                state.modelCar.traverse(c => {
                    if (c.name === booth.clickPattern) boundMesh = c;
                });

                if (boundMesh) {
                    const box = new Box3().setFromObject(boundMesh);
                    box.getCenter(orbitCenter);
                }
            }
        }

        state.controls.transitionTo(targetCam, orbitCenter);

        // Sync boothId for raycaster logic
        if (state.boothConfig?.booths) {
            const booth = state.boothConfig.booths.find(b => b.boothCamera === targetCam.name);
            state.currentBoothId = booth ? booth.id : null;
            window.DEBUG_BOOTH = state.currentBoothId;
            console.log(`[Navigation] Sync: Cam="${targetCam.name}" -> BoothID="${state.currentBoothId || 'GLOBAL'}"`);
        }

        this._updateCurrentIndex();
    }
}
