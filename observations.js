// fetch and display recent captures from backend, support highlighting a newly uploaded item
const BACKEND_BASE = (window.location.hostname === 'localhost' && window.location.port !== '3000')
  ? 'http://localhost:3000'
  : '';

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function fetchObservations() {
  const container = document.getElementById('observations');
  container.innerHTML = '<div id="loading">Loading recent captures...</div>';
  const highlightId = getQueryParam('highlight');

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/observations`);
    if (!resp.ok) { container.innerHTML = `<div class="small">Server error: ${resp.status}</div>`; return; }
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) { container.innerHTML = '<div class="small">No captures yet. Take one from the camera page.</div>'; return; }

    container.innerHTML = '';
    for (const r of rows) {
      const imgRel = r.image_url || (r.filename ? `/uploads/${r.filename}` : '');
      const imgSrc = imgRel ? (imgRel.startsWith('http') ? imgRel : `${BACKEND_BASE}${imgRel}`) : '';
      const label = r.label || 'Unknown';
      const age = r.estimated_age || 'N/A';
      const confidence = (r.confidence == null) ? 'N/A' : Number(r.confidence).toFixed(2);
      const time = r.created_at || '';

      const item = document.createElement('div');
      item.className = 'obs-item';
      if (r.id !== undefined && r.id !== null) item.dataset.id = String(r.id);
      item.innerHTML = `
        <img src="${imgSrc}" alt="capture" onerror="this.style.display='none'">
        <div class="obs-meta">
          <div class="title">${label}</div>
          <div class="small">Estimated age: <strong>${age}</strong></div>
          <div class="small">Confidence: <strong>${confidence}</strong></div>
          <div class="small">Captured: <em>${time}</em></div>
        </div>
      `;
      container.appendChild(item);

      // if this is the highlighted item, scroll and highlight it
      if (highlightId && String(r.id) === String(highlightId)) {
        // give the DOM a moment to render the image
        setTimeout(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          item.classList.add('highlight');
          // remove highlight after a short delay
          setTimeout(() => item.classList.remove('highlight'), 4000);
        }, 200);
      }
    }
  } catch (err) {
    console.error('fetchObservations error', err);
    container.innerHTML = `<div class="small">Network error: ${err.message}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', fetchObservations);