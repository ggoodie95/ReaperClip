import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {app} from 'electron';

const IMAGE_PLACEHOLDER_RE = /^\[image \d+x\d+\]$/i;

export class Store {
  constructor({ maxItems = 20 } = {}) {
    this.maxItems = maxItems;
    const base = app.getPath('userData');
    this.file = path.join(base, 'history.json');
    this.items = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (Array.isArray(raw)) {
          this.items = raw.map(entry => this._coerce(entry))
                          .filter(Boolean)
                          .slice(0, this.maxItems);
        }
      }
    } catch (e) {
      this.items = [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
    } catch {}
  }

  push(payload) {
    const item = this._coerce(payload);
    if (!item) return;

    this.items = [
      item,
      ...this.items.filter(existing => !this._isDuplicate(existing, item))
    ];

    if (this.items.length > this.maxItems) this.items.length = this.maxItems;
    this._save();
  }

  peek(n = 20) {
    return this.items.slice(0, n);
  }

  _coerce(entry) {
    if (!entry) return null;

    if (typeof entry === 'string') {
      const raw = entry;
      if (!raw.trim()) return null;
      if (IMAGE_PLACEHOLDER_RE.test(raw)) return null;
      return {
        kind: 'text',
        text: raw,
        source: 'legacy',
        fmts: ['text/plain'],
        data: { text: raw },
        digest: this._digest('text', raw, ['text/plain']),
        createdAt: new Date().toISOString()
      };
    }

    if (typeof entry !== 'object') return null;

    const kind = entry.kind === 'image' ? 'image' : 'text';
    const fmts = Array.isArray(entry.fmts) ? entry.fmts : (kind === 'image' ? ['image/png'] : ['text/plain']);
    const createdAt = entry.createdAt || new Date().toISOString();

    if (kind === 'image') {
      const dataUrl = entry.data?.dataUrl || entry.image?.dataUrl;
      if (!dataUrl) return null;
      const width = entry.data?.width ?? entry.image?.width ?? 0;
      const height = entry.data?.height ?? entry.image?.height ?? 0;
      const text = entry.text || `[Image ${width}x${height}]`;
      return {
        kind: 'image',
        text,
        source: entry.source || 'image',
        fmts,
        data: { dataUrl, width, height },
        digest: entry.digest || this._digest('image', dataUrl, fmts),
        createdAt
      };
    }

    const originalText = entry.data?.text ?? entry.text ?? '';
    const raw = typeof originalText === 'string' ? originalText : String(originalText ?? '');
    if (!raw.trim()) return null;
    if (IMAGE_PLACEHOLDER_RE.test(raw) && entry.kind !== 'image') return null;

    const html = entry.data?.html || entry.html || '';
    const rtf = entry.data?.rtf || entry.rtf || '';

    return {
      kind: 'text',
      text: raw,
      source: entry.source || 'text',
      fmts,
      data: {
        text: raw,
        html,
        rtf
      },
      digest: entry.digest || this._digest('text', raw, fmts),
      createdAt
    };
  }

  _isDuplicate(prev, next) {
    if (!prev || !next) return false;
    if (prev.kind !== next.kind) return false;

    if (prev.kind === 'image') {
      return prev.data?.dataUrl === next.data?.dataUrl;
    }

    const a = prev.text?.toLocaleLowerCase?.() ?? '';
    const b = next.text?.toLocaleLowerCase?.() ?? '';
    return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
  }

  _digest(kind, value, fmts) {
    const hash = createHash('sha1');
    hash.update(kind || '');
    hash.update('\0');
    hash.update(value || '');
    hash.update('\0');
    hash.update(Array.isArray(fmts) ? fmts.join(',') : '');
    return hash.digest('hex');
  }
}
