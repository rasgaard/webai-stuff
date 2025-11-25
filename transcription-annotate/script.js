class TranscriptionTool {
    constructor() {
        this.audioFile = null;
        this.transcriptionFile = null;
        this.audio = null;
        this.transcriptionData = [];
        this.currentWordIndex = -1;
        this.playbackSpeed = 1;

        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        // File inputs
        this.audioFileInput = document.getElementById('audio-file');
        this.transcriptionFileInput = document.getElementById('transcription-file');

        // Audio elements
        this.audioSection = document.getElementById('audio-section');
        this.audioPlayer = document.getElementById('audio-player');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.rewindBtn = document.getElementById('rewind-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.speedSlider = document.getElementById('speed-slider');
        this.speedDisplay = document.getElementById('speed-display');

        // Transcription elements
        this.transcriptionSection = document.getElementById('transcription-section');
        this.transcriptionText = document.getElementById('transcription-text');
    }

    setupEventListeners() {
        // File input listeners
        this.audioFileInput.addEventListener('change', (e) => this.handleAudioFile(e.target.files[0]));
        this.transcriptionFileInput.addEventListener('change', (e) => this.handleTranscriptionFile(e.target.files[0]));


        // Audio controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.rewindBtn.addEventListener('click', () => this.skipTime(-2));
        this.forwardBtn.addEventListener('click', () => this.skipTime(2));
        this.speedSlider.addEventListener('input', (e) => this.updateSpeed(parseFloat(e.target.value)));

        // Load from localStorage on startup
        this.loadFromLocalStorage();
    }

    // File handling methods
    handleAudioFile(file) {
        if (!file) return;

        if (!this.isValidAudioFile(file)) {
            alert('Please select a valid audio file (.m4a, .wav, .mp3)');
            return;
        }

        this.audioFile = file;
        this.loadAudio();
        this.checkIfReadyToStart();
    }

    handleTranscriptionFile(file) {
        if (!file) return;

        if (!this.isValidTextFile(file)) {
            alert('Please select a valid text file (.txt)');
            return;
        }

        this.transcriptionFile = file;
        this.loadTranscription();
        this.checkIfReadyToStart();
    }

    isValidAudioFile(file) {
        return ['audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/mpeg'].includes(file.type) ||
            ['.m4a', '.wav', '.mp3'].some(ext => file.name.toLowerCase().endsWith(ext));
    }

    isValidTextFile(file) {
        return file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
    }


    // Audio loading and control
    async loadAudio() {
        try {
            const url = URL.createObjectURL(this.audioFile);
            this.audioPlayer.src = url;

            this.audioPlayer.addEventListener('loadedmetadata', () => {
                this.setupAudioEventListeners();
            });

            this.audioPlayer.addEventListener('canplay', () => {
                this.audioSection.style.display = 'block';
            });

        } catch (error) {
            console.error('Error loading audio:', error);
            alert('Error loading audio file');
        }
    }

    setupAudioEventListeners() {
        this.audioPlayer.addEventListener('timeupdate', () => this.updateCurrentWord());
        this.audioPlayer.addEventListener('ended', () => this.onAudioEnded());
    }


    updateCurrentWord() {
        if (!this.transcriptionData.length) return;

        const currentTime = this.audioPlayer.currentTime;

        // Find the current segment based on timestamps
        let currentLineIndex = -1;
        for (let i = 0; i < this.transcriptionData.length; i++) {
            const line = this.transcriptionData[i];
            if (line.hasTimestamp && line.startTime !== null && line.endTime !== null) {
                if (currentTime >= line.startTime && currentTime <= line.endTime) {
                    currentLineIndex = i;
                    break;
                }
            }
        }

        // Always call highlight to ensure proper update, even if same index
        this.highlightCurrentSegment(currentLineIndex);
        this.currentWordIndex = currentLineIndex;
    }

    highlightCurrentSegment(lineIndex) {
        // Remove previous highlighting
        document.querySelectorAll('.line-container.current').forEach(el => {
            el.classList.remove('current');
        });

        if (lineIndex >= 0) {
            // Highlight the current line container
            const lineContainers = document.querySelectorAll('.line-container');
            if (lineContainers[lineIndex]) {
                lineContainers[lineIndex].classList.add('current');
                lineContainers[lineIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }


    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸ Pause';
        } else {
            this.audioPlayer.pause();
            this.playPauseBtn.textContent = '▶ Play';
        }
    }

    skipTime(seconds) {
        this.audioPlayer.currentTime = Math.max(0,
            Math.min(this.audioPlayer.duration, this.audioPlayer.currentTime + seconds));
    }

    updateSpeed(speed) {
        this.playbackSpeed = speed;
        this.audioPlayer.playbackRate = this.playbackSpeed;
        this.speedDisplay.textContent = speed.toFixed(1) + 'x';
    }

    onAudioEnded() {
        this.playPauseBtn.textContent = '▶ Play';
        this.currentWordIndex = -1;
        document.querySelectorAll('.line-container.current').forEach(el => el.classList.remove('current'));
    }

    // Transcription loading and processing
    async loadTranscription() {
        try {
            const text = await this.readFileAsText(this.transcriptionFile);
            this.parseTranscription(text);
            this.renderTranscription();

        } catch (error) {
            console.error('Error loading transcription:', error);
            alert('Error loading transcription file');
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    parseTranscription(text) {
        const lines = text.split('\n').filter(line => line.trim());
        this.transcriptionData = [];

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // First, try to parse timestamp format directly [00:01.000 --> 00:13.220] content
            const directTimestampMatch = trimmedLine.match(/^\[(\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}\.\d{3})\]\s*(.+)$/);

            if (directTimestampMatch) {
                // Direct timestamp format
                const startTime = this.parseTimeToSeconds(directTimestampMatch[1]);
                const endTime = this.parseTimeToSeconds(directTimestampMatch[2]);
                const textContent = directTimestampMatch[3].trim();
                const words = textContent.split(/\s+/).filter(word => word.length > 0);

                this.transcriptionData.push({
                    lineNumber: index + 1,
                    content: textContent,
                    words,
                    originalLine: line,
                    startTime,
                    endTime,
                    hasTimestamp: true
                });
            } else {
                // Check if line starts with line number (format: "1→" or similar)
                const lineNumberMatch = trimmedLine.match(/^\s*(\d+)→(.+)$/);

                if (lineNumberMatch) {
                    const lineNumber = parseInt(lineNumberMatch[1]);
                    const content = lineNumberMatch[2].trim();

                    // Parse timestamp if present in format [00:01.000 --> 00:13.220]
                    const timestampMatch = content.match(/^\[(\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}\.\d{3})\]\s*(.+)$/);

                    let startTime = null, endTime = null, textContent = content;

                    if (timestampMatch) {
                        startTime = this.parseTimeToSeconds(timestampMatch[1]);
                        endTime = this.parseTimeToSeconds(timestampMatch[2]);
                        textContent = timestampMatch[3].trim();
                    }

                    const words = textContent.split(/\s+/).filter(word => word.length > 0);

                    this.transcriptionData.push({
                        lineNumber,
                        content: textContent,
                        words,
                        originalLine: line,
                        startTime,
                        endTime,
                        hasTimestamp: timestampMatch !== null
                    });
                } else {
                    // Handle plain text without line numbers or timestamps
                    const words = trimmedLine.split(/\s+/).filter(word => word.length > 0);
                    this.transcriptionData.push({
                        lineNumber: index + 1,
                        content: trimmedLine,
                        words,
                        originalLine: line,
                        startTime: null,
                        endTime: null,
                        hasTimestamp: false
                    });
                }
            }
        });
    }

    parseTimeToSeconds(timeStr) {
        // Parse time format MM:SS.mmm to seconds
        const parts = timeStr.split(':');
        const minutes = parseInt(parts[0]);
        const seconds = parseFloat(parts[1]);
        return minutes * 60 + seconds;
    }

    renderTranscription() {
        let html = '';

        this.transcriptionData.forEach((line, lineIndex) => {
            html += `<div class="line-container" data-line="${line.lineNumber}" data-line-index="${lineIndex}" data-start-time="${line.startTime}" data-end-time="${line.endTime}">`;

            // Header with line number and timestamp
            html += `<div class="line-header">`;
            html += `<span class="line-number">${line.lineNumber}→</span>`;
            if (line.hasTimestamp) {
                html += `<span class="timestamp" data-start-time="${line.startTime}">[${this.formatTimeWithMs(line.startTime)} → ${this.formatTimeWithMs(line.endTime)}]</span>`;
            }
            html += `</div>`;

            // Plain text content - no individual word spans
            html += `<div class="line-content">${line.content}</div>`;

            html += `</div>`;
        });

        this.transcriptionText.innerHTML = html;
        this.setupTimestampClickListeners();
        this.transcriptionSection.style.display = 'block';
    }

    formatTimeWithMs(seconds) {
        if (seconds === null) return '';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    setupTimestampClickListeners() {
        // Add click listeners for timestamps only
        document.querySelectorAll('.timestamp').forEach(timestampEl => {
            timestampEl.addEventListener('click', (e) => {
                e.preventDefault();
                const startTime = parseFloat(timestampEl.dataset.startTime);
                if (startTime !== null && !isNaN(startTime)) {
                    // Add small offset to ensure we land within the segment, not on the boundary
                    this.jumpToTime(startTime + 0.1);
                }
            });
        });
    }


    jumpToTime(timeInSeconds) {
        if (!this.audioPlayer.duration) return;

        this.audioPlayer.currentTime = Math.max(0, Math.min(this.audioPlayer.duration, timeInSeconds));

        // Update highlighting immediately
        this.updateCurrentWord();
    }

    // Save/export functionality
    loadFromLocalStorage() {
        const saved = localStorage.getItem('transcription-corrections');
        if (!saved) return;

        try {
            const data = JSON.parse(saved);
            if (data.transcriptionData) {
                this.transcriptionData = data.transcriptionData;
                this.renderTranscription();
                this.showMessage('Previous corrections loaded', 'info');
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }

    // Utility methods
    checkIfReadyToStart() {
        if (this.audioFile && this.transcriptionFile) {
            this.showMessage('Both files loaded! You can now start correcting the transcription.', 'success');
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    showMessage(text, type = 'info') {
        // Create a temporary message element
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
            color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
            font-size: 14px;
            max-width: 300px;
        `;
        message.textContent = text;

        document.body.appendChild(message);

        setTimeout(() => {
            document.body.removeChild(message);
        }, 3000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TranscriptionTool();
});