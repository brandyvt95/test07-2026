
export class PerformanceMonitor {
    constructor(state) {
        this.state = state;
        this.fpsThreshold = 40;
        this.detectionDuration = 2000; // 2 giây để phát hiện lag
        this.fpsLimit = 30;

        this.frameCount = 0;
        this.startTime = performance.now();
        this.isThrottled = false;
        this.lastFrameTime = 0;

        this.history = [];
        this.historyLimit = 10;

        console.log('Performance Monitor initialized.');
    }

    update() {
        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.startTime;

        // Tính FPS mỗi 500ms
        if (elapsed >= 500) {
            const currentFps = (this.frameCount * 1000) / elapsed;
            this.history.push(currentFps);
            if (this.history.length > this.historyLimit) this.history.shift();

            // Kiểm tra nếu trung bình FPS trong lịch sử dưới ngưỡng 40
            const avgFps = this.history.reduce((a, b) => a + b, 0) / this.history.length;

            if (!this.isThrottled && this.history.length >= 4 && avgFps < this.fpsThreshold) {
                console.warn(`Performance low (Avg FPS: ${avgFps.toFixed(1)}). Throttling to ${this.fpsLimit} FPS.`);
                this.isThrottled = true;
            }

            this.frameCount = 0;
            this.startTime = now;
        }
    }

    // Kiểm tra xem có nên render frame này không (dựa trên giới hạn 30fps)
    shouldRender() {
        if (!this.isThrottled) return true;

        const now = performance.now();
        const delta = now - this.lastFrameTime;
        const interval = 1000 / this.fpsLimit;

        if (delta >= interval) {
            this.lastFrameTime = now - (delta % interval);
            return true;
        }
        return false;
    }
}
