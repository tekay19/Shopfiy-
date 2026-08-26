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

  let body;
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopDomain, accessToken }),
    });
    body = await res.json();
  } catch (err) {
    connectStatus.textContent = `✗ Bağlanamadı: ${err.message || 'ağ hatası'}`;
    storeFields.style.display = 'none';
    return;
  }

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

  let jobId, error;
  try {
    const res = await fetch('/api/create-store', { method: 'POST', body: form });
    ({ jobId, error } = await res.json());
  } catch (err) {
    appendLog(`✗ İstek başarısız: ${err.message || 'ağ hatası'}`);
    return;
  }
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
      if (event.summary) {
        const s = event.summary;
        appendLog(`Özet: ${s.productsCreated} ürün, ${s.collectionsCreated} koleksiyon, ${s.pagesCreated} sayfa oluşturuldu. Yayınlandı: ${s.published ? 'evet' : 'hayır'}${s.themeFilesFailed ? ` (${s.themeFilesFailed} tema dosyası yüklenemedi)` : ''}`);
      }
      source.close();
    }
  };
});
