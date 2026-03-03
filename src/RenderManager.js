import { state } from './state.js';
import { params } from './params.js';
import { onParamsChange } from './utils.js';

export class RenderManager {
    constructor() {
        this.isRendering = false;
        this.createUI();
    }

    createUI() {
        // Overlay Buttons (RE-ADDED)
        const overlay = document.createElement('div');
        overlay.className = 'render-overlay';
        overlay.innerHTML = `
            <button class="render-button" data-level="low">RENDER LOW</button>
            <button class="render-button" data-level="med">RENDER MED</button>
            <button class="render-button" data-level="high">RENDER HIGH</button>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            const level = e.target.dataset.level;
            if (level) this.startRender(level);
        });

        // Progress text + Cancel button


        this.progressEl = document.createElement('div');
        this.progressEl.className = 'render-progress';
        this.progressEl.innerHTML = `
            <div class="progress-text"></div>
            <button class="cancel-render-button">CANCEL</button>
        `;
        document.body.appendChild(this.progressEl);
        this.progressText = this.progressEl.querySelector('.progress-text');
        this.progressEl.querySelector('.cancel-render-button').onclick = () => this.abortRender('User cancelled');

        // Modal for result
        this.modal = document.createElement('div');
        this.modal.className = 'render-modal';
        this.modal.innerHTML = `
            <div class="render-result-container">
                <img class="render-result-image" src="" alt="Render Result">
            </div>
            <div class="render-modal-actions">
                <button class="modal-button button-save">Save Image</button>
                <button class="modal-button button-close">Discard</button>
            </div>
        `;
        document.body.appendChild(this.modal);

        this.resultImg = this.modal.querySelector('.render-result-image');

        this.modal.querySelector('.button-save').onclick = () => {
            const link = document.createElement('a');
            link.download = `render_${new Date().getTime()}.png`;
            link.href = this.resultImg.src;
            link.click();
        };

        this.modal.querySelector('.button-close').onclick = () => {
            this.modal.classList.remove('active');
        };
    }

    abortRender(reason) {
        if (!this.isRendering) return;
        console.warn(`Render aborted: ${reason}`);
        this.shouldAbort = true;
    }

    async startRender(level) {
        if (this.isRendering) return;

        const config = params.snapshots[level];
        if (!config) {
            console.error(`Invalid render level: ${level}`);
            return;
        }

        this.isRendering = true;
        this.shouldAbort = false;

        const originalParams = { ...params };
        const ptManager = state.ptManager;

        // Step 1: Inject high quality params into the MAIN LOOP
        params.renderScale = config.renderScale;
        params.bounces = config.bounces;
        params.enable = true;
        params.pause = false;



        // Critical: Update tracer state immediately
        ptManager.renderScale = params.renderScale;
        ptManager.bounces = params.bounces;
        ptManager.reset();

        this.progressEl.classList.add('active');

        // Step 2: Monitoring interval to check progress from main loop
        this.monitorId = setInterval(() => {
            // Terminal conditions: Only Abort or Target Samples reached
            if (this.shouldAbort || ptManager.samples >= config.samples) {
                this.finishRender(ptManager.samples >= config.samples, originalParams);
            } else {
                // Update UI
                const progress = Math.min(99, Math.round((ptManager.samples / config.samples) * 100));
                if (this.progressText) {
                    this.progressText.innerText = `Rendering ${level.toUpperCase()}... ${progress}%`;
                }
            }
        }, 100);
    }

    finishRender(success, originalParams) {
        if (!this.isRendering) return;
        clearInterval(this.monitorId);

        if (success && !this.shouldAbort) {
            // we capture directly from the canvas which contains the Path Tracing result
            const dataUrl = state.renderer.domElement.toDataURL('image/png');
            this.resultImg.src = dataUrl;
            this.modal.classList.add('active');
        } else {
            this.modal.classList.remove('active');
        }

        this.progressEl.classList.remove('active');

        // Step 3: Restore original state
        if (originalParams) {
            Object.assign(params, originalParams);
            state.ptManager.renderScale = params.renderScale;
            state.ptManager.bounces = params.bounces;
            onParamsChange();
        }

        this.isRendering = false;
    }
}



