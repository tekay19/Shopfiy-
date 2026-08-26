const connectStatus = document.getElementById('connectStatus');
const storeFields = document.getElementById('storeFields');
const logEl = document.getElementById('log');

function appendLog(line) {
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById('connectBtn').addEventListener('click', async () => {
  const shopDomain = document.getElementById('shopDomain').value.trim();
  const accessToken = document.getElementById('accessToken').value.trim();
  connectStatus.textContent = 'Bağlanıyor...';

  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain, accessToken }),
  });
  const body = await res.json();

  if (body.ok) {
    connectStatus.textContent = `✓ Bağlandı: ${body.shopName}`;
    storeFields.style.display = 'block';
  } else {
    connectStatus.textContent = `✗ Bağlanamadı: ${body.error || 'bilinmeyen hata'}`;
    storeFields.style.display = 'none';
  }
});

document.getElementById('createBtn').addEventListener('click', async () => {
  const form = new FormData();
  form.append('shopDomain', document.getElementById('shopDomain').value.trim());
  form.append('accessToken', document.getElementById('accessToken').value.trim());
  form.append('storeName', document.getElementById('storeName').value.trim());
  form.append('primaryColorHex', document.getElementById('primaryColorHex').value);
  form.append('logo', document.getElementById('logo').files[0]);
  form.append('productsCsv', document.getElementById('productsCsv').files[0]);

  logEl.textContent = '';
  appendLog('Mağaza oluşturma başlatılıyor...');

  const res = await fetch('/api/create-store', { method: 'POST', body: form });
  const { jobId, error } = await res.json();
  if (error) {
    appendLog(`✗ ${error}`);
    return;
  }

  const source = new EventSource(`/api/progress/${jobId}`);
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    const icon = event.status === 'error' ? '✗' : event.status === 'ok' ? '✓' : '…';
    appendLog(`${icon} [${event.step}] ${event.message}`);
    if (event.step === 'done') {
      source.close();
    }
  };
});
