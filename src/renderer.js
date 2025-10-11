const $ = (sel) => document.querySelector(sel);

const state = {
  texts: [],
  filteredTexts: [],
  textIndex: 0,
  images: [],
  settings: null
};

const IMAGE_PLACEHOLDER_RE = /^\[image \d+x\d+\]$/i;

function render() {
  const container = $('#list');
  container.innerHTML = '';
  const items = state.filteredTexts.slice(0, 10); // show up to 10 text items
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'item' + (i === state.textIndex ? ' active' : '');
    li.textContent = summarise(item.text);
    li.title = item.text;
    li.addEventListener('mouseenter', () => { state.textIndex = i; highlight(); });
    li.addEventListener('click', () => pick(i));
    container.appendChild(li);
  });
}

function highlight() {
  [...document.querySelectorAll('#list .item')].forEach((el, i) => {
    if (i === state.textIndex) el.classList.add('active'); else el.classList.remove('active');
  });
}

function summarise(s) {
  // compress newlines + trim
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 200) s = s.slice(0, 200) + '…';
  return s || '(blank)';
}

function filter() {
  const q = $('#search').value.toLowerCase();
  if (!q) {
    state.filteredTexts = state.texts.slice();
  } else {
    state.filteredTexts = state.texts.filter(item => item.text.toLowerCase().includes(q));
  }
  state.textIndex = 0;
  render();
}

function pick(idx) {
  const items = state.filteredTexts.slice(0, 10);
  const item = items[idx ?? state.textIndex];
  if (!item) return;
  window.clipAPI.setClip(item);
  window.clipAPI.hideWindow(); // hide after selection; you paste with Cmd+V
}

async function bootstrap() {
  const hist = await window.clipAPI.getHistory();
  console.log('[renderer] initial history length=', hist?.length);
  applyHistory(hist);
  filter();
  renderImages();
  await loadSettings();
  $('#search').focus();
}

window.clipAPI.onHistoryUpdated((hist) => {
  console.log('[renderer] onHistoryUpdated length=', hist?.length);
  applyHistory(hist);
  filter();
  renderImages();
});

window.clipAPI.onSettingsUpdated((settings) => {
  state.settings = settings;
  applySettingsToForm();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const maxIndex = Math.min(9, state.filteredTexts.length - 1);
    state.textIndex = Math.min(state.textIndex + 1, Math.max(0, maxIndex));
    highlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.textIndex = Math.max(state.textIndex - 1, 0);
    highlight();
  }
  else if (e.key === 'Enter') { e.preventDefault(); pick(); }
  else if (e.key === 'Escape') { window.clipAPI.hideWindow(); }
});

$('#search').addEventListener('input', filter);

bootstrap();

async function loadSettings() {
  try {
    const settings = await window.clipAPI.getSettings();
    state.settings = settings;
    applySettingsToForm();
  } catch (err) {
    console.error('Failed to load settings', err);
    showSettingsStatus('Failed to load settings', true);
  }
}

function applyHistory(hist) {
  const items = Array.isArray(hist) ? hist : [];
  state.texts = items.filter(item => item?.kind !== 'image' && !IMAGE_PLACEHOLDER_RE.test(item?.text ?? ''));
  state.images = items.filter(item => item?.kind === 'image');
  state.filteredTexts = state.texts.slice();
  state.textIndex = 0;
}

function renderImages() {
  const container = $('#img-list');
  if (!container) return;
  container.innerHTML = '';

  const items = state.images.slice(0, 10);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'img-empty';
    empty.textContent = 'No images yet';
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'img-item';

    if (item.data?.dataUrl) {
      const img = document.createElement('img');
      img.src = item.data.dataUrl;
      img.alt = item.text;
      img.draggable = false;
      button.appendChild(img);
    }

    const caption = document.createElement('span');
    caption.textContent = item.text;
    button.appendChild(caption);

    button.addEventListener('click', () => {
      window.clipAPI.setClip(item);
      window.clipAPI.hideWindow();
    });

    container.appendChild(button);
  });
}

function applySettingsToForm() {
  const settings = state.settings;
  if (!settings) return;
  $('#hotkeyInput').value = settings.hotkey ?? '';
  $('#captureScreenshots').checked = !!settings.captureScreenshots;
  $('#captureImages').checked = !!settings.captureImages;
}

function showSettingsStatus(msg, isError = false) {
  const el = $('#settingsStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
  if (msg) {
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = '';
        el.classList.remove('error');
      }
    }, 2200);
  }
}

$('#settingsSave').addEventListener('click', async (e) => {
  e.preventDefault();
  const patch = {
    hotkey: $('#hotkeyInput').value.trim(),
    captureScreenshots: $('#captureScreenshots').checked,
    captureImages: $('#captureImages').checked
  };

  try {
    const result = await window.clipAPI.setSettings(patch);
    state.settings = result.settings;
    applySettingsToForm();
    if (!result.hotkeyRegistered) {
      showSettingsStatus('Hotkey unavailable', true);
    } else {
      showSettingsStatus('Settings saved');
    }
  } catch (err) {
    console.error('Failed to save settings', err);
    showSettingsStatus('Save failed', true);
  }
});
