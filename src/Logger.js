
export class Logger {
    constructor() {
        // Clear previous overlay if exists
        const existing = document.getElementById('loading-overlay');
        if (existing) existing.remove();

        this.overlay = document.createElement('div');
        this.overlay.id = 'loading-overlay';

        this.overlay.className = 'loading-overlay';
        this.overlay.innerHTML = `
            <div class="loading-content">
                <div class="loader-spinner"></div>
                <div class="loading-main-text">INITIALIZING ENGINE</div>
                <div id="log-container" class="log-container"></div>
            </div>
        `;
        document.body.appendChild(this.overlay);
        this.logContainer = document.getElementById('log-container');

        // Cụm này để đảm bảo font Inter được load (hoặc fallback)
        this.overlay.style.visibility = 'visible';
    }

    log(message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        const now = new Date();
        const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
        logEntry.innerHTML = `<span class="timestamp">${timestamp}</span> <span class="msg">${message}</span>`;

        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
        console.log(`[AppLog] ${message}`);
    }

    async hide() {
        this.log("READY.");
        await new Promise(r => setTimeout(r, 500));
        this.overlay.classList.add('fade-out');

        return new Promise(resolve => {
            setTimeout(() => {
                this.overlay.style.display = 'none';
                resolve();
            }, 800);
        });
    }
}
