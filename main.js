// Camera and photo capture logic (send image to backend /api/analyze)
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('capture');
const photo = document.getElementById('photo');
const resultDiv = document.getElementById('result');

// disable capture until camera ready
captureBtn.disabled = true;

// Start camera
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;

        // enable capture once metadata is available
        video.addEventListener('loadedmetadata', () => {
            // some devices may report 0 for videoWidth until metadata loads
            if (video.videoWidth && video.videoHeight) {
                captureBtn.disabled = false;
            } else {
                // still enable as a fallback
                captureBtn.disabled = false;
            }
        }, { once: true });
    } catch (err) {
        alert('Could not access camera: ' + err.message);
        console.error('startCamera error:', err);
    }
}

// Capture photo and return a Blob
function capturePhotoBlob() {
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

// Set backend base to your server address (change port if different)
const BACKEND_BASE = 'http://localhost:3000';

async function sendToServer(blob) {
    resultDiv.textContent = 'Sending to server...';
    const form = new FormData();
    form.append('photo', blob, 'capture.png');

    try {
        const resp = await fetch(`${BACKEND_BASE}/api/analyze`, { method: 'POST', body: form });
        const json = await resp.json();
        if (!resp.ok) {
            console.warn('Server returned error:', json);
            resultDiv.textContent = 'Server error: ' + (json.error || JSON.stringify(json));
            return json;
        }

        // navigate to recents page showing the newly saved observation
        if (json && json.id) {
            // navigate and include the new observation id so recents page can highlight it
            window.location.href = `recents.html?highlight=${encodeURIComponent(json.id)}`;
            return json;
        }

        resultDiv.textContent = `Label: ${json.label || 'N/A'} | Age: ${json.estimated_age || 'N/A'} | Confidence: ${json.confidence ?? 'N/A'}`;
        return json;
    } catch (e) {
        console.error('sendToServer error:', e);
        resultDiv.textContent = 'Network error: ' + e.message;
        return null;
    }
}

captureBtn.addEventListener('click', async () => {
    // create local preview immediately
    const blob = await capturePhotoBlob();
    if (blob) {
        photo.src = URL.createObjectURL(blob); // show preview even if upload fails
        photo.alt = 'Captured photo';
    } else {
        resultDiv.textContent = 'Capture failed (no image data).';
        return;
    }

    // upload in background and update resultDiv when done
    await sendToServer(blob);
});

startCamera();
