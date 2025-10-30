// Camera and photo capture logic (send image to backend /api/analyze)
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('capture');
const photo = document.getElementById('photo');
const resultDiv = document.getElementById('result');

// disable capture until camera ready
captureBtn.disabled = true;

// Start camera
// call with 'user' for front/selfie or 'environment' for back
async function startCamera(desiredFacing = 'environment') {
  captureBtn.disabled = true;

  // iOS Safari requires HTTPS or localhost for getUserMedia
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.warn('getUserMedia may be blocked on insecure origin. Serve over HTTPS or use localhost.');
  }

  // helper to open stream with given constraints
  async function openStream(constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await new Promise(resolve => {
        if (video.readyState >= 2) return resolve();
        video.addEventListener('loadedmetadata', resolve, { once: true });
      });
      captureBtn.disabled = false;
      return true;
    } catch (err) {
      console.warn('getUserMedia failed for', constraints, err);
      return false;
    }
  }

  // 1) Try to get permission with a simple request so enumerateDevices returns labels
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (err) {
    // user may deny — we'll still attempt other strategies below
    console.warn('Initial permission request failed (labels may be hidden):', err);
  }

  // 2) Enumerate devices and try to pick the best match
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');

    // try to find device by label heuristics (works after permission)
    let chosen = null;
    const want = desiredFacing === 'environment' ? ['back', 'rear', 'environment'] : ['front', 'face', 'user', 'selfie'];
    for (const dev of videoInputs) {
      const label = (dev.label || '').toLowerCase();
      for (const key of want) {
        if (label.includes(key)) {
          chosen = dev.deviceId;
          break;
        }
      }
      if (chosen) break;
    }

    if (chosen) {
      const ok = await openStream({ video: { deviceId: { exact: chosen } } });
      if (ok) return;
    }
  } catch (err) {
    console.warn('enumerateDevices failed or no matching device:', err);
  }

  // 3) Try facingMode constraint (may not be supported on all iOS versions)
  const facingConstraints = [
    { video: { facingMode: { exact: desiredFacing } } },
    { video: { facingMode: { ideal: desiredFacing } } },
    { video: { facingMode: desiredFacing } }
  ];
  for (const c of facingConstraints) {
    if (await openStream(c)) return;
  }

  // 4) Final fallback to any camera
  if (await openStream({ video: true })) return;

  alert('Could not access a camera on this device. Check permissions and that the browser supports getUserMedia.');
}

// default call (change 'user' to 'environment' if you want the back camera)
startCamera('user');

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
