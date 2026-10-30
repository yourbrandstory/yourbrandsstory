// <media-slot> — user-fillable image OR video placeholder.
// Sibling of image-slot.js: accepts image/* and video/* via drag-drop or
// click-to-browse, renders an <img> or a looping muted <video>, and persists
// the dropped file to a .media-slots.state.json sidecar via
// window.omelette.writeFile (session-only fallback when unavailable).
// Fills its container; use shape/radius for corners. object-fit:cover.
(() => {
  const STATE_FILE = '.media-slots.state.json';
  const IMG = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
  const VID = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  const MAX_IMG_DIM = 1400;
  const MAX_BYTES = 40 * 1024 * 1024; // guard: huge clips bloat the sidecar

  // ── shared sidecar store ────────────────────────────────────────────────
  const subs = new Set();
  let slots = {};
  const tombstones = new Set();
  let loaded = false, loadP = null;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j === 'object') {
          const merged = Object.assign({}, j, slots);
          for (const id of tombstones) delete merged[id];
          slots = merged;
        }
        tombstones.clear();
      })
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }

  let saving = false, saveDirty = false;
  function save() {
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    if (saving) { saveDirty = true; return; }
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(slots)))
      .catch(() => {})
      .then(() => { saving = false; if (saveDirty) { saveDirty = false; save(); } });
  }

  function setSlot(id, val) {
    if (!id) return;
    if (val) { slots[id] = val; tombstones.delete(id); }
    else { delete slots[id]; if (!loaded) tombstones.add(id); }
    subs.forEach((fn) => fn());
    if (loaded) save(); else load().then(save);
  }
  function getSlot(id) { return (id && slots[id]) || null; }

  // Downscale images through a canvas (webp). Videos are read raw as a
  // data URL — no re-encode possible in-browser.
  async function imgToDataUrl(file, targetW) {
    const bmp = await createImageBitmap(file);
    try {
      const cap = Math.min(MAX_IMG_DIM, Math.max(1, Math.round(targetW * 2)) || MAX_IMG_DIM);
      const scale = Math.min(1, cap / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.85);
    } finally { bmp.close && bmp.close(); }
  }
  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  const css =
    ':host{display:block;position:relative;width:100%;height:100%;aspect-ratio:3/2;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(255,255,255,.7)}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(255,255,255,.06)}' +
    '.frame img,.frame video{position:absolute;inset:0;width:100%;height:100%;' +
    '  object-fit:cover;display:block}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  cursor:pointer;user-select:none}' +
    '.empty svg{opacity:.5}' +
    '.empty .cap{max-width:90%;font-weight:500}' +
    '.empty .sub{font-size:11px;opacity:.8}' +
    '.empty .sub u{text-underline-offset:2px}' +
    '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(255,255,255,.28)}' +
    ':host([data-filled]) .ring{display:none}' +
    ':host([data-over]) .frame{outline:2px solid #9CE069;outline-offset:-2px;' +
    '  background:rgba(156,224,105,.12)}' +
    ':host([data-over]) .ring{border-color:#9CE069}' +
    '.ctl{position:absolute;top:8px;right:8px;display:flex;gap:6px;opacity:0;' +
    '  pointer-events:none;transition:opacity .12s;z-index:2}' +
    ':host([data-filled][data-editable]:hover) .ctl{opacity:1;pointer-events:auto}' +
    '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;' +
    '  background:rgba(0,0,0,.65);color:#fff;font:11px/1 system-ui,sans-serif;backdrop-filter:blur(6px)}' +
    '.ctl button:hover{background:rgba(0,0,0,.82)}' +
    '.err{position:absolute;left:8px;bottom:8px;right:8px;color:#fff;font-size:11px;' +
    '  background:rgba(179,38,30,.92);padding:4px 6px;border-radius:5px;pointer-events:none}';

  const icon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="4" width="14" height="16" rx="2"/><path d="m16 9 6-3v12l-6-3"/>' +
    '<circle cx="7" cy="9" r="1.4"/></svg>';

  class MediaSlot extends HTMLElement {
    static get observedAttributes() { return ['shape', 'radius', 'placeholder', 'id']; }
    constructor() {
      super();
      const root = this.shadowRoot || this.attachShadow({ mode: 'open', clonable: true });
      root.innerHTML =
        '<style>' + css + '</style>' +
        '<div class="frame" part="frame">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div><div class="sub">or <u>browse files</u></div></div>' +
        '  <div class="ring" part="ring"></div>' +
        '</div>' +
        '<div class="ctl"><button data-act="replace">Replace</button>' +
        '  <button data-act="clear">Clear</button></div>' +
        '<input type="file" accept="' + IMG.concat(VID).join(',') + '" hidden>';
      this._frame = root.querySelector('.frame');
      this._ring = root.querySelector('.ring');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._ctl = root.querySelector('.ctl');
      this._input = root.querySelector('input');
      this._media = null;
      this._local = null;
      this._depth = 0;
      this._gen = 0;
      this._err = null;
      this._subFn = () => this._render();
      this._empty.addEventListener('click', () => this._input.click());
      root.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act || !this.hasAttribute('data-editable')) return;
        if (act === 'replace') this._input.click();
        if (act === 'clear') { this._local = null; setSlot(this.id || '', null); if (!this.id) this._render(); }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
    }
    connectedCallback() {
      if (!this.id && !MediaSlot._warned) {
        MediaSlot._warned = true;
        console.warn('<media-slot> without an id will not persist its dropped media.');
      }
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((t) => this.addEventListener(t, this));
      subs.add(this._subFn);
      this.addEventListener('pointerenter', this._subFn);
      load();
      this._render();
    }
    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('pointerenter', this._subFn);
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((t) => this.removeEventListener(t, this));
    }
    attributeChangedCallback() { if (this.shadowRoot) this._render(); }
    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault(); e.stopPropagation();
        this._depth = 0; this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }
    async _ingest(file) {
      this._setError(null);
      const isImg = IMG.indexOf(file.type) >= 0;
      const isVid = VID.indexOf(file.type) >= 0;
      if (!isImg && !isVid) { this._setError('Drop an image or a video file.'); return; }
      if (file.size > MAX_BYTES) { this._setError('File too large (max 40MB).'); return; }
      const gen = ++this._gen;
      try {
        let val;
        if (isImg) {
          const w = this.clientWidth || this.offsetWidth || MAX_IMG_DIM;
          val = { u: await imgToDataUrl(file, w), t: 'image' };
        } else {
          val = { u: await fileToDataUrl(file), t: 'video' };
        }
        if (gen !== this._gen) return;
        setSlot(this.id || '', val);
        if (!this.id) { this._local = val; this._render(); }
      } catch (err) {
        if (gen !== this._gen) return;
        this._setError('Could not read that file.');
        console.warn('<media-slot> ingest failed:', err);
      }
    }
    _setError(msg) {
      if (this._err) { this._err.remove(); this._err = null; }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err'; d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => { if (this._err === d) { d.remove(); this._err = null; } }, 3000);
    }
    _render() {
      const shape = (this.getAttribute('shape') || 'rounded').toLowerCase();
      let radius = '';
      if (shape === 'circle') radius = '50%';
      else if (shape === 'pill') radius = '9999px';
      else if (shape === 'rounded') {
        const n = parseFloat(this.getAttribute('radius'));
        radius = (Number.isFinite(n) ? n : 12) + 'px';
      }
      this._frame.style.borderRadius = radius;
      this._ring.style.borderRadius = radius;
      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._sub.style.display = editable ? '' : 'none';
      this._cap.textContent = this.getAttribute('placeholder') || 'Drop image or video';

      let stored = this.id ? getSlot(this.id) : this._local;
      if (stored && stored.u && !/^data:(image|video)\//i.test(stored.u)) stored = null;

      // (Re)build the media element only when the source/type changes.
      const wantType = stored ? stored.t : null;
      const wantUrl = stored ? stored.u : null;
      if (!stored) {
        if (this._media) { this._media.remove(); this._media = null; }
        this._curUrl = null;
        this._empty.style.display = 'flex';
        this.removeAttribute('data-filled');
        return;
      }
      if (!this._media || this._media.tagName.toLowerCase() !== (wantType === 'video' ? 'video' : 'img')) {
        if (this._media) this._media.remove();
        if (wantType === 'video') {
          this._media = document.createElement('video');
          this._media.muted = true; this._media.loop = true;
          this._media.autoplay = true; this._media.playsInline = true;
          this._media.setAttribute('muted', ''); this._media.setAttribute('playsinline', '');
        } else {
          this._media = document.createElement('img');
          this._media.setAttribute('draggable', 'false');
        }
        this._frame.insertBefore(this._media, this._empty);
        this._curUrl = null;
      }
      if (this._curUrl !== wantUrl) {
        this._media.src = wantUrl;
        this._curUrl = wantUrl;
        if (wantType === 'video') { const p = this._media.play && this._media.play(); if (p && p.catch) p.catch(() => {}); }
      }
      this._empty.style.display = 'none';
      this.setAttribute('data-filled', '');
    }
  }

  if (!customElements.get('media-slot')) customElements.define('media-slot', MediaSlot);
})();
