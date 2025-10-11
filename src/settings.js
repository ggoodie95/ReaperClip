import fs from 'fs';
import path from 'path';
import {app} from 'electron';

const DEFAULTS = {
  hotkey: 'Command+Shift+C',
  captureScreenshots: true,
  captureImages: true
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

export class SettingsStore {
  constructor() {
    const base = app.getPath('userData');
    this.file = path.join(base, 'settings.json');
    this.data = {};
    this._load();
  }

  get() {
    return {...DEFAULTS, ...this.data};
  }

  set(update) {
    if (!update || typeof update !== 'object') return this.get();
    const merged = {...this.get()};
    for (const [key, value] of Object.entries(update)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      if (value === undefined) continue;
      merged[key] = value;
    }
    this.data = merged;
    this._save();
    return this.get();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this.data = {...DEFAULTS, ...parsed};
        }
      }
    } catch {
      this.data = {...DEFAULTS};
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {}
  }
}

export function getDefaultSettings() {
  return {...DEFAULTS};
}
