const IS_WEBGPU_AVAILABLE = typeof navigator !== 'undefined' && 'gpu' in navigator;

const worker = new Worker('worker.js', { type: 'module' });

const transcribeBtn = document.getElementById('transcribeButton');
transcribeBtn.disabled = true;

const audioUpload = document.getElementById('audioInput');
const copyBtn = document.getElementById('copyAllButton');
const fileLabel = document.getElementById('fileLabel');
let transcriptionInProgress = false;
let audioLoaded = false;

worker.onmessage = function (event) {
    const { status, data } = event.data;
    switch (status) {
        case "progress":
            transcribeBtn.getElementsByTagName('span')[0].textContent = "LOADING...";
            break;
        case "ready":
            transcribeBtn.getElementsByTagName('span')[0].textContent = "TRANSCRIBE";
            break;
        case "update":
            console.log("Update from worker:", data);
            const tbody = document.querySelector('#transcription tbody');
            tbody.innerHTML = '';
            transcriptionInProgress = true;
            updateSpinnerVisibility();
            populateTranscriptionTable(data.chunks);
            break;
        case "complete":
            console.log("Transcription complete:", data);
            populateTranscriptionTable(data.chunks);
            transcriptionInProgress = false;
            updateSpinnerVisibility();
            copyBtn.disabled = false;
            break;
        default:
            console.log(`Status ${status}: ${JSON.stringify(data)}`);
            break;
    }
};

function updateSpinnerVisibility() {
    const spinner = document.getElementById('spinner');
    if (transcriptionInProgress) {
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

const audioCtx = new AudioContext({ sampleRate: 16000 });
let decodedAudio = null;
audioUpload.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (file) {
        fileLabel.textContent = `[ ${file.name.toUpperCase()} ]`;
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        decodedAudio = audioBuffer.getChannelData(0);
        console.log('Decoded audio:', decodedAudio);
        audioLoaded = true;
        transcribeBtn.disabled = false;
    } else {
        fileLabel.textContent = '[ CLICK TO SELECT FILE ]';
        audioLoaded = false;
        transcribeBtn.disabled = true;
    }
});

transcribeBtn.addEventListener('click', function () {
    if (decodedAudio) {
        worker.postMessage({
            audio: decodedAudio,
            model: "onnx-community/whisper-large-v3-turbo",
            subtask: "transcribe",
            language: getTranscriptionLanguage()
        });
    } else {
        console.error('No audio buffer available for transcription.');
        alert('Please select an audio file and try again.');
    }
});

function populateTranscriptionTable(chunks) {
    const tbody = document.querySelector('#transcription tbody');
    tbody.innerHTML = '';

    if (chunks && chunks.length > 0) {
        chunks.forEach((chunk, index) => {
            const row = document.createElement('tr');
            
            const timeCell = document.createElement('td');
            timeCell.style.whiteSpace = 'nowrap';

            if (chunk.timestamp && chunk.timestamp.length === 2) {
                const startTime = formatTime(chunk.timestamp[0]);
                const endTime = formatTime(chunk.timestamp[1]);

                const timeWrapper = document.createElement('div');
                timeWrapper.className = 'pixel-timestamp';
                timeWrapper.title = 'CLICK TO PLAY';

                const playIcon = document.createElement('span');
                playIcon.textContent = '>';
                playIcon.style.color = '#4a7c59';
                timeWrapper.appendChild(playIcon);

                const timeText = document.createElement('span');
                timeText.textContent = `[${startTime}-${endTime}]`;
                timeWrapper.appendChild(timeText);

                timeWrapper.dataset.start = chunk.timestamp[0];
                timeWrapper.dataset.end = chunk.timestamp[1];
                timeWrapper.addEventListener('click', () => {
                    playAudioSegment(chunk.timestamp[0], chunk.timestamp[1]);

                    playIcon.textContent = '♪';
                    playIcon.style.color = '#8fd4a0';
                    setTimeout(() => {
                        playIcon.textContent = '>';
                        playIcon.style.color = '#4a7c59';
                    }, (chunk.timestamp[1] - chunk.timestamp[0]) * 1000);
                });

                timeCell.appendChild(timeWrapper);
            } else {
                timeCell.textContent = '[N/A]';
                timeCell.className = 'pixel-disabled';
            }

            const textCell = document.createElement('td');
            textCell.textContent = chunk.text || '';
            textCell.style.color = '#7abf8a';

            row.appendChild(timeCell);
            row.appendChild(textCell);
            tbody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.className = 'text-center py-8 pixel-disabled';
        cell.textContent = '[ NO TRANSCRIPTION DATA AVAILABLE ]';
        row.appendChild(cell);
        tbody.appendChild(row);
    }
}

function getTranscriptionLanguage() {
    const languageSelect = document.getElementById('languageSelect');
    return languageSelect.options[languageSelect.selectedIndex].value;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playAudioSegment(startTime, endTime) {
    if (!decodedAudio) {
        console.error('No audio available to play');
        return;
    }

    const segmentDuration = endTime - startTime;
    const segmentBuffer = audioCtx.createBuffer(1, segmentDuration * audioCtx.sampleRate, audioCtx.sampleRate);
    const segmentData = segmentBuffer.getChannelData(0);

    const startSample = Math.floor(startTime * audioCtx.sampleRate);
    const endSample = Math.floor(endTime * audioCtx.sampleRate);

    for (let i = 0; i < endSample - startSample; i++) {
        if (startSample + i < decodedAudio.length) {
            segmentData[i] = decodedAudio[startSample + i];
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = segmentBuffer;
    source.connect(audioCtx.destination);
    source.start();
}

copyBtn.addEventListener('click', async function () {
    const tbody = document.querySelector('#transcription tbody');
    const rows = tbody.querySelectorAll('tr');

    if (rows.length <= 1) {
        alert('No transcription available to copy.');
        return;
    }

    let fullText = '';
    rows.forEach(row => {
        const timeCell = row.querySelector('td:nth-child(1)');
        const textCell = row.querySelector('td:nth-child(2)');

        let timestamp = 'N/A';
        if (timeCell) {
            const timeWrapper = timeCell.querySelector('div');
            if (timeWrapper) {
                const timeSpan = timeWrapper.querySelector('span:nth-child(2)');
                if (timeSpan) {
                    timestamp = timeSpan.textContent;
                }
            }
        }

        if (textCell && textCell.textContent) {
            fullText += `${timestamp} ${textCell.textContent}\n`;
        }
    });

    try {
        await navigator.clipboard.writeText(fullText.trim());

        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>[ COPIED! ]</span>`;

        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy text to clipboard');
    }
});
