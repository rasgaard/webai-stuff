const IS_WEBGPU_AVAILABLE = typeof navigator !== 'undefined' && 'gpu' in navigator;

const worker = new Worker('worker.js', { type: 'module' });

const transcribeBtn = document.getElementById('transcribeButton');
transcribeBtn.disabled = true;

const audioUpload = document.getElementById('audioInput');
const copyBtn = document.getElementById('copyAllButton');
let transcriptionInProgress = false;
let audioLoaded = false;



worker.onmessage = function (event) {
    console.log('Message from worker:', event.data);
};

worker.onmessage = function (event) {
    const { status, data } = event.data;
    switch (status) {
        case "progress":
            transcribeBtn.getElementsByTagName('span')[0].textContent = "Loading...";
            break;
        case "ready":
            transcribeBtn.getElementsByTagName('span')[0].textContent = "Transcribe";
            break;
        case "update":
            console.log("Update from worker:", data);
            // Clear and populate the transcription table
            const tbody = document.querySelector('#transcription tbody');
            tbody.innerHTML = ''; // Clear existing content
            transcriptionInProgress = true;
            updateSpinnerVisibility();
            populateTranscriptionTable(data.chunks);
            break;
        case "complete":
            console.log("Transcription complete:", data);
            populateTranscriptionTable(data.chunks);
            transcriptionInProgress = false;
            updateSpinnerVisibility();
            break;
        default:
            console.log(`Status ${status}: ${JSON.stringify(data)}`);
            break;
    }
};

function updateSpinnerVisibility() {
    const spinner = document.querySelector('#transcribeButton .spinner-border');
    if (transcriptionInProgress) {
        spinner.style.display = 'inline-block'; // Show spinner
    } else {
        spinner.style.display = 'none'; // Hide spinner
    }
}

const audioCtx = new AudioContext({ sampleRate: 16000 });
let decodedAudio = null;
audioUpload.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    decodedAudio = audioBuffer.getChannelData(0);
    console.log('Decoded audio:', decodedAudio);

    transcribeBtn.disabled = !audioUpload.files.length && !IS_WEBGPU_AVAILABLE;
});

// Transcribe audio file
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

// Define a function to populate the transcription table
function populateTranscriptionTable(chunks) {
    const tbody = document.querySelector('#transcription tbody');
    tbody.innerHTML = ''; // Clear existing content

    if (chunks && chunks.length > 0) {
        chunks.forEach((chunk, index) => {
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

            // Create timestamp cell
            const timeCell = document.createElement('td');
            timeCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';

            if (chunk.timestamp && chunk.timestamp.length === 2) {
                const startTime = formatTime(chunk.timestamp[0]);
                const endTime = formatTime(chunk.timestamp[1]);

                // Create a wrapper div with flex to hold play icon and timestamp
                const timeWrapper = document.createElement('div');
                timeWrapper.className = 'flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors duration-150';
                timeWrapper.title = 'Click to play this segment';

                // Add play icon
                const playIcon = document.createElement('span');
                playIcon.textContent = '▶️';
                playIcon.className = 'text-gray-400';
                timeWrapper.appendChild(playIcon);

                // Add timestamp text
                const timeText = document.createElement('span');
                timeText.textContent = `${startTime} - ${endTime}`;
                timeWrapper.appendChild(timeText);

                // Add click event
                timeWrapper.dataset.start = chunk.timestamp[0];
                timeWrapper.dataset.end = chunk.timestamp[1];
                timeWrapper.addEventListener('click', () => {
                    playAudioSegment(chunk.timestamp[0], chunk.timestamp[1]);

                    // Add visual feedback when playing
                    playIcon.textContent = '🔊';
                    timeWrapper.classList.add('text-indigo-600');
                    setTimeout(() => {
                        playIcon.textContent = '▶️';
                        timeWrapper.classList.remove('text-indigo-600');
                    }, (chunk.timestamp[1] - chunk.timestamp[0]) * 1000);
                });

                timeCell.appendChild(timeWrapper);
            } else {
                timeCell.textContent = 'N/A';
            }

            // Create text cell
            const textCell = document.createElement('td');
            textCell.className = 'px-6 py-4 text-sm text-gray-900';
            textCell.textContent = chunk.text || '';

            // Add cells to row and row to table
            row.appendChild(timeCell);
            row.appendChild(textCell);
            tbody.appendChild(row);
        });
    } else {
        // Show a message when no transcription is available
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.className = 'px-6 py-4 text-sm text-gray-500 text-center italic';
        cell.textContent = 'No transcription available. Select an audio file and click Transcribe.';
        row.appendChild(cell);
        tbody.appendChild(row);
    }
}



function getTranscriptionLanguage() {
    const languageSelect = document.getElementById('languageSelect');
    return languageSelect.options[languageSelect.selectedIndex].value;
}

// Helper function to format time in MM:SS format
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to play a specific segment of audio
function playAudioSegment(startTime, endTime) {
    if (!decodedAudio) {
        console.error('No audio available to play');
        return;
    }

    // Create a new buffer for the segment
    const segmentDuration = endTime - startTime;
    const segmentBuffer = audioCtx.createBuffer(1, segmentDuration * audioCtx.sampleRate, audioCtx.sampleRate);
    const segmentData = segmentBuffer.getChannelData(0);

    // Copy the segment data from the original audio
    const startSample = Math.floor(startTime * audioCtx.sampleRate);
    const endSample = Math.floor(endTime * audioCtx.sampleRate);

    for (let i = 0; i < endSample - startSample; i++) {
        if (startSample + i < decodedAudio.length) {
            segmentData[i] = decodedAudio[startSample + i];
        }
    }

    // Play the segment
    const source = audioCtx.createBufferSource();
    source.buffer = segmentBuffer;
    source.connect(audioCtx.destination);
    source.start();
}

// Function to copy all transcription text
copyBtn.addEventListener('click', async function () {
    const tbody = document.querySelector('#transcription tbody');
    const rows = tbody.querySelectorAll('tr');

    // Skip if there's only one row with the "no transcription" message
    if (rows.length <= 1) {
        alert('No transcription available to copy.');
        return;
    }

    // Collect all text with timestamps
    let fullText = '';
    rows.forEach(row => {
        const timeCell = row.querySelector('td:nth-child(1)');
        const textCell = row.querySelector('td:nth-child(2)');

        // Get timestamp text without the play icon
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
            fullText += `[${timestamp}] ${textCell.textContent}\n\n`;
        }
    });

    try {
        await navigator.clipboard.writeText(fullText.trim());

        // Visual feedback
        const button = document.getElementById('copyAllButton');
        const originalHTML = button.innerHTML;
        button.innerHTML = `
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Copied!
                `;
        button.classList.remove('bg-indigo-100', 'text-indigo-700');
        button.classList.add('bg-green-100', 'text-green-700');

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('bg-green-100', 'text-green-700');
            button.classList.add('bg-indigo-100', 'text-indigo-700');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy text to clipboard');
    }
});
