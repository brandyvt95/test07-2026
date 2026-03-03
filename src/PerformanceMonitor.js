import { params } from './params.js';

export class PerformanceMonitor {
    constructor(state) {
        this.state = state;
        this.fpsThreshold = 40;
        this.detectionDuration = 2000;
        this.fpsLimit = 30;

        this.frameCount = 0;
        this.startTime = performance.now();
        this.isThrottled = false; // Internal state for 'Auto' detect
        this.lastFrameTime = 0;

        this.history = [];
        this.historyLimit = 10;

        console.log('Performance Monitor initialized.');
    }

    update() {
        // Chỉ thực hiện đánh giá hiệu năng nếu ở chế độ 'Auto'
        if (params.fpsLimitMode !== 'Auto') return;

        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.startTime;

        if (elapsed >= 500) {
            const currentFps = (this.frameCount * 1000) / elapsed;
            this.history.push(currentFps);
            if (this.history.length > this.historyLimit) this.history.shift();

            const avgFps = this.history.reduce((a, b) => a + b, 0) / this.history.length;

            if (!this.isThrottled && this.history.length >= 4 && avgFps < this.fpsThreshold) {
                console.warn(`Performance low (Avg FPS: ${avgFps.toFixed(1)}). Auto-Throttling to 30 FPS.`);
                this.isThrottled = true;
            }

            this.frameCount = 0;
            this.startTime = now;
        }
    }

    shouldRender() {
        const mode = params.fpsLimitMode;

        // Chế độ 60 FPS hoặc Mặc định (Không giới hạn)
        if (mode === '60 FPS') return true;

        // Chế độ 30 FPS cố định
        if (mode === '30 FPS') {
            return this._limitFPS(30);
        }

        // Chế độ Auto
        if (mode === 'Auto') {
            if (!this.isThrottled) return true;
            return this._limitFPS(this.fpsLimit);
        }

        return true;
    }

    _limitFPS(limit) {
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        const interval = 1000 / limit;

        if (delta >= interval) {
            this.lastFrameTime = now - (delta % interval);
            return true;
        }
        return false;
    }
}

