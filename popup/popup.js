/**
 * Gemini Polish · popup controller
 *
 * The UI is rendered from GeminiPolishConfig.UI_SECTIONS rather than written
 * out as HTML, so adding a setting means adding one spec entry. Grouping is by
 * what a setting acts on (prose / app shell), not by property type.
 */
const C = globalThis.GeminiPolishConfig;
const { SLIDERS, UI_SECTIONS, DEFAULT_VIEW, SCHEME_ACTIVATES, COLOR_SCHEMES,
        PALETTE_KEYS, PRESETS,
        mergeConfig, togglesOf, isPassthrough, isOn, setToggle, t } = C;
const { inertKeys } = globalThis.GeminiPolishCSS;

/* chrome.storage.sync limits we have to design around:
   QUOTA_BYTES_PER_ITEM 8192 · MAX_WRITE_OPERATIONS_PER_MINUTE 120.
   A slider drag emits an `input` event per pixel, so writing sync straight from
   the handler blows the write cap in seconds and every later write fails
   silently. local is authoritative and debounced short; sync is a best-effort
   mirror debounced long. */
const SYNC_ITEM_LIMIT = 8192;
const LOCAL_DEBOUNCE_MS = 150;
const SYNC_DEBOUNCE_MS = 1500;

const FONTS = [
  [t('font_group_sans', "Sans-serif"), [
    ['system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', 'System Default'],
    ["'PingFang SC', 'San Francisco', sans-serif", 'Apple PingFang (苹方)'],
    ["'Microsoft YaHei', 'SimHei', sans-serif", 'Microsoft YaHei (微软雅黑)'],
    ["'HarmonyOS Sans SC', 'HarmonyOS Sans', sans-serif", 'HarmonyOS Sans (鸿蒙)'],
    ["'MiSans', sans-serif", 'MiSans (小米)'],
    ["'Inter', 'Roboto', 'Helvetica Neue', 'Arial', sans-serif", 'Inter / Helvetica'],
  ]],
  [t('font_group_serif', "Serif"), [
    ["'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif", 'Source Han Serif (思源宋体)'],
    ["'Georgia', 'Palatino', 'Songti SC', serif", 'Georgia & Songti'],
  ]],
  [t('font_group_mono', "Calligraphy & Mono"), [
    ["'LXGW WenKai', 'Kaiti SC', 'STKaiti', serif", 'LXGW WenKai (霞鹜文楷)'],
    ["'FangSong', 'STFangsong', serif", 'FangSong (仿宋)'],
    ["'JetBrains Mono', 'Fira Code', 'Consolas', monospace", 'Developer Mono'],
  ]],
  ['Custom', [['custom', t('font_custom_option', "\u2014 Custom font name \u2014")]]],
];

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  let cfg = mergeConfig({});
  /* Which palette the swatches edit. Follows the live Gemini theme instead of
     being a control: a sun/moon pair in a settings panel reads as a theme
     switch, which this never was, and judging dark colours from a light page
     does not work anyway. To tune the other palette, switch Gemini's theme. */
  let editMode = 'light';
  const syncers = [];              // every built control registers a refresher

  // ---------------------------------------------------------------- helpers

  function h(tag, cls, props = {}) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.assign(n, props);
    return n;
  }

  function makeSwitch(isOn, onChange, hook) {
    const label = h('label', 'switch');
    const input = h('input', null, { type: 'checkbox', checked: isOn });
    if (hook) input.dataset.toggle = hook;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, h('span', 'slider'));
    return { label, input };
  }

  /** A row's switch drives every toggle key it owns; "any on" reads as on. */
  const rowIsOn = (keys) => keys.some(k => isOn(cfg.toggles, k));
  function setToggles(keys, on) {
    let changed = false;
    keys.forEach(k => {
      if (isOn(cfg.toggles, k) !== on) { setToggle(cfg.toggles, k, on); changed = true; }
    });
    return changed;
  }

  /* Writes only the bits the preset owns. Assigning the whole toggle object
     would switch every colour off, because presets are defined colour-free. */
  function applyPreset(name) {
    cfg.preset = name;
    // Writes one axis; the nesting makes the user's colours unreachable here.
    cfg.toggles.structure = { ...PRESETS[name].toggles };
    // A preset imposes its values too, or switching typography on can change
    // nothing visible for someone whose numbers already match Gemini's.
    Object.assign(cfg, PRESETS[name].values || {});
  }

  function markCustomPreset() {
    if (cfg.preset !== 'custom') { cfg.preset = 'custom'; return true; }
    return false;
  }

  // ------------------------------------------------------------ row builders

  function sliderRow(pref, keys, governedBy) {
    const spec = SLIDERS[pref];
    // A governed row follows another row's switch; it dims with it but shows none.
    const dimKeys = keys.length ? keys : (governedBy ? [governedBy] : []);
    const row = h('div', 'ctl-row');
    const head = h('div', 'ctl-head');
    const name = h('span', 'ctl-label', { textContent: spec.label });
    const val = h('span', 'ctl-val');
    head.append(name, val);

    const input = h('input', null, { type: 'range', min: spec.min, max: spec.max, step: spec.step });
    input.dataset.pref = pref;
    input.addEventListener('input', () => {
      update(() => {
        cfg[pref] = spec.step < 1 ? parseFloat(input.value) : parseInt(input.value, 10);
      });
    });

    const body = h('div', 'ctl-body');
    body.append(input);
    if (keys.length) {
      const sw = makeSwitch(false, (on) => {
        update(() => { setToggles(keys, on); markCustomPreset(); });
      }, keys.join(' '));
      head.append(sw.label);
      syncers.push(() => { sw.input.checked = rowIsOn(keys); });
    } else {
      // Hold the column so every row's name line ends at the same x.
      head.append(h('span', 'switch-spacer'));
    }
    row.append(head, body);

    syncers.push(() => {
      input.value = cfg[pref];
      val.textContent = cfg[pref] + spec.unit;
      row.classList.toggle('is-off', dimKeys.length > 0 && !rowIsOn(dimKeys));
    });
    return row;
  }

  function switchRow(label, desc, keys, pref) {
    const row = h('div', 'ctl-row toggle-row');
    const nameWrap = h('div', 'toggle-name', { textContent: label });
    if (desc) nameWrap.append(h('div', 'toggle-desc', { textContent: desc }));
    const sw = makeSwitch(false, (on) => {
      update(() => {
        if (pref) cfg[pref] = on;
        else { setToggles(keys, on); markCustomPreset(); }
      });
    }, pref || keys.join(' '));
    row.append(nameWrap, sw.label);
    syncers.push(() => { sw.input.checked = pref ? !!cfg[pref] : rowIsOn(keys); });
    return row;
  }

  /* Swatches sit on the same row as the switch that applies them, so "this
     colour repaints that thing" is readable without cross-referencing. */
  function colorRow(spec) {
    const keys = togglesOf(spec);
    const row = h('div', 'ctl-row toggle-row');
    const swatches = h('div', 'swatches');
    const inputs = spec.swatches.map(key => {
      const inp = h('input', null, { type: 'color' });
      inp.dataset.color = key;
      inp.title = key;
      inp.addEventListener('input', () => {
        update(() => {
          cfg.colors[editMode][key] = inp.value;
          cfg.colorScheme = 'custom';   // hand-picked colours are no named scheme
        });
      });
      swatches.append(inp);
      return [key, inp];
    });
    const nameWrap = h('div', 'toggle-name', { textContent: spec.label });
    if (spec.desc) nameWrap.append(h('div', 'toggle-desc', { textContent: spec.desc }));
    const sw = makeSwitch(false, (on) => {
      update(() => { setToggles(keys, on); markCustomPreset(); });
    }, keys.join(' '));
    const hint = h('div', 'toggle-desc', { textContent: t('inert_hint', "\u201cNative\u201d colours leave this to Gemini") });
    hint.style.display = 'none';
    nameWrap.append(hint);
    row.append(swatches, nameWrap, sw.label);
    syncers.push(() => {
      inputs.forEach(([key, inp]) => { inp.value = cfg.colors[editMode][key]; });
      // Inert only when EVERY key it drives is one the pass-through scheme
      // starves; a row that also carries an accent-only rule still works.
      const dead = isPassthrough(cfg.colorScheme)
        && keys.length > 0 && keys.every(k => inertKeys().has(k));
      sw.input.checked = rowIsOn(keys) && !dead;
      sw.input.disabled = dead;
      inputs.forEach(([, inp]) => { inp.disabled = dead; });
      hint.style.display = dead ? 'block' : 'none';
      row.classList.toggle('is-off', dead || !rowIsOn(keys));
    });
    return row;
  }

  function fontRow(spec) {
    const keys = togglesOf(spec);
    const row = h('div', 'ctl-row');
    const head = h('div', 'ctl-head');
    head.append(h('span', 'ctl-label', { textContent: spec.label }));

    const sel = h('select');
    FONTS.forEach(([groupLabel, opts]) => {
      const g = h('optgroup'); g.label = groupLabel;
      opts.forEach(([v, t]) => g.append(h('option', null, { value: v, textContent: t })));
      sel.append(g);
    });
    const custom = h('input', 'font-custom', { type: 'text',
      placeholder: t('font_custom_placeholder', "e.g. 'Alibaba PuHuiTi'") });

    sel.addEventListener('change', () => update(() => { cfg.fontFamily = sel.value; }));
    custom.addEventListener('input', () => { cfg.customFontName = custom.value; commit(); });

    const sw = makeSwitch(false, (on) => {
      update(() => { setToggles(keys, on); markCustomPreset(); });
    }, keys.join(' '));
    head.append(sw.label);

    const body = h('div', 'ctl-body ctl-body--stack');
    body.append(sel, custom);
    row.append(head, body);

    syncers.push(() => {
      sel.value = cfg.fontFamily;
      custom.value = cfg.customFontName || '';
      custom.style.display = cfg.fontFamily === 'custom' ? 'block' : 'none';
      sw.input.checked = rowIsOn(keys);
      row.classList.toggle('is-off', !rowIsOn(keys));
    });
    return row;
  }

  function buildRow(spec) {
    const keys = togglesOf(spec);
    switch (spec.type) {
      case 'slider': return sliderRow(spec.pref, keys, spec.governedBy);
      case 'switch': return switchRow(spec.label, spec.desc, keys, spec.pref);
      case 'color':  return colorRow(spec);
      case 'font':   return fontRow(spec);
    }
  }

  // -------------------------------------------------------------- rendering

  function fillSelect(sel, entries) {
    entries.forEach(([value, label]) => sel.append(h('option', null, { value, textContent: label })));
    sel.append(h('option', null, { value: 'custom', textContent: t('custom', 'Custom') }));
  }

  /* Static markup carries data-i18n instead of literals, so popup.html stays
     declarative and no string lives in two places. */
  function localizeStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n, el.textContent);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder, el.placeholder);
    });
  }

  function render() {
    localizeStatic();
    fillSelect($('preset'), Object.entries(PRESETS).map(([k, p]) => [k, p.label]));
    fillSelect($('colorScheme'), Object.entries(COLOR_SCHEMES).map(([k, v]) => [k, v.label]));

    const adv = $('advanced');
    UI_SECTIONS.forEach(section => {
      adv.append(h('div', 'section-hint', { textContent: section.label }));
      section.rows.forEach(spec => adv.append(buildRow(spec)));
    });

    const quickS = $('quickSliders');
    DEFAULT_VIEW.sliders.forEach(pref => {
      // Same pref as the Advanced row; both refresh from cfg, so they stay in step.
      const owner = UI_SECTIONS.flatMap(s => s.rows).find(r => r.pref === pref) || {};
      quickS.append(sliderRow(pref, togglesOf(owner), owner.governedBy));
    });

    const quickW = $('quickSwitches');
    DEFAULT_VIEW.switches.forEach(s => quickW.append(switchRow(s.label, null, togglesOf(s), s.pref)));

    const strip = $('paletteStrip');
    const cells = PALETTE_KEYS.map(k => {
      const c = h('i'); c.title = k; strip.append(c); return [k, c];
    });
    syncers.push(() => cells.forEach(([k, c]) => { c.style.background = cfg.colors[editMode][k]; }));
  }

  function syncAll() {
    $('preset').value = cfg.preset || 'custom';
    $('colorScheme').value = cfg.colorScheme;
    $('customCSS').value = cfg.customCSS || '';
    $('paletteMode').textContent =
      (editMode === 'dark' ? t('palette_dark', "Dark palette") : t('palette_light', "Light palette"))
      + ' · ' + t('palette_follows', "follows Gemini");
    /* The panel wears the accent it is editing — a theming tool whose own
       chrome ignores your palette looks like it is not connected to anything. */
    document.documentElement.style.setProperty('--ui-accent', cfg.colors[editMode].accent);
    syncers.forEach(fn => fn());
  }

  // --------------------------------------------------------- storage plumbing

  let statusTimer = null;
  function setStatus(text, kind = 'ok') {
    clearTimeout(statusTimer);
    const el = $('status');
    el.textContent = text;
    el.className = 'status status--' + kind;
    if (kind === 'ok') statusTimer = setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 1600);
  }

  const readArea = (area) => new Promise(res =>
    chrome.storage[area].get(null, (i) => res(chrome.runtime.lastError ? {} : (i || {}))));

  /* Newest `updatedAt` wins, so an edit from another device beats a stale local
     copy and vice versa. Mirrors the same logic in content.js. */
  async function loadConfig() {
    const [local, sync] = await Promise.all([readArea('local'), readArea('sync')]);
    const hasL = Object.keys(local).length, hasS = Object.keys(sync).length;
    let base;
    if (!hasL) base = sync;
    else if (!hasS) base = local;
    else base = (local.updatedAt || 0) >= (sync.updatedAt || 0) ? { ...sync, ...local } : { ...local, ...sync };
    return mergeConfig(base);
  }

  let liveFrame = null;
  function pushLive() {
    const snapshot = JSON.parse(JSON.stringify(cfg));
    chrome.tabs.query({ url: '*://gemini.google.com/*' }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      tabs.forEach(t => chrome.tabs.sendMessage(
        t.id, { type: 'polish:apply', config: snapshot }, () => void chrome.runtime.lastError));
    });
  }

  let localTimer = null, syncTimer = null, dirty = false;

  function writeLocal(stamp) {
    chrome.storage.local.set({ ...cfg, updatedAt: stamp }, () => {
      if (chrome.runtime.lastError) {
        setStatus(t('save_failed', "Save failed: $1", [chrome.runtime.lastError.message]), 'err');
      }
    });
  }

  /* Best-effort mirror; failures are reported but never block the setting —
     local already holds the authoritative copy. */
  function writeSync(stamp) {
    const payload = { ...cfg, updatedAt: stamp };
    let dropped = false;
    if (new TextEncoder().encode(JSON.stringify(payload.customCSS || '')).length > SYNC_ITEM_LIMIT - 512) {
      delete payload.customCSS; dropped = true;
    }
    chrome.storage.sync.set(payload, () => {
      if (chrome.runtime.lastError) {
        setStatus(t('sync_failed', "Saved on this device (cloud sync failed: $1)", [chrome.runtime.lastError.message]), 'warn');
      } else if (dropped) setStatus(t('css_too_big', "Saved \u00b7 Custom CSS over 8KB, this device only"), 'warn');
    });
  }

  /* Every control mutates through here. Handlers used to mutate and then each
     remember to commit and re-sync; the ones that forgot part of that are where
     the wholesale-overwrite bugs got in. */
  function update(mutate) {
    mutate();
    commit();
    syncAll();
  }

  /** Preview now, persist when settled. */
  function commit() {
    dirty = true;
    if (!liveFrame) liveFrame = requestAnimationFrame(() => { liveFrame = null; pushLive(); });
    clearTimeout(localTimer);
    localTimer = setTimeout(() => writeLocal(Date.now()), LOCAL_DEBOUNCE_MS);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { const s = Date.now(); writeLocal(s); writeSync(s); }, SYNC_DEBOUNCE_MS);
  }

  // ------------------------------------------------------------------ wiring

  render();

  $('preset').addEventListener('change', () => {
    const name = $('preset').value;
    update(() => { if (PRESETS[name]) applyPreset(name); else cfg.preset = 'custom'; });
  });

  /* A scheme is a matched light/dark pair, and picking one means "reskin" — so
     both palettes are replaced and the toggles that carry a scheme's identity
     are switched on. Without that, choosing Nord only moves accents and reads
     as "配色不生效". */
  $('colorScheme').addEventListener('change', () => {
    const name = $('colorScheme').value;
    update(() => {
      cfg.colorScheme = name;
      const scheme = COLOR_SCHEMES[name];
      if (!scheme) return;
      cfg.colors = { light: { ...scheme.light }, dark: { ...scheme.dark } };
      // "原生" hands the colours back to Gemini, so it switches the overrides
      // OFF — the opposite gesture from picking a real scheme.
      setToggles(SCHEME_ACTIVATES, !isPassthrough(name));
    });
  });

  $('customCSS').addEventListener('input', () => update(() => { cfg.customCSS = $('customCSS').value; }));

  $('resetPreset').addEventListener('click', () => {
    if (PRESETS[cfg.preset]) update(() => applyPreset(cfg.preset));
  });

  /* The popup is torn down the moment it loses focus, so flush any pending
     debounce on the way out. */
  window.addEventListener('pagehide', () => {
    if (!dirty) return;
    clearTimeout(localTimer); clearTimeout(syncTimer);
    const s = Date.now(); writeLocal(s); writeSync(s);
  });

  /* Ask the page which theme it is in; fall back to the OS preference when no
     Gemini tab can answer. Both palettes ship either way — this only decides
     which one the swatches show. */
  function detectTheme() {
    return new Promise(resolve => {
      const os = () => resolve(
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      chrome.tabs.query({ url: '*://gemini.google.com/*' }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || !tabs.length) return os();
        const active = tabs.find(t => t.active) || tabs[0];
        chrome.tabs.sendMessage(active.id, { type: 'polish:theme' }, (res) => {
          if (chrome.runtime.lastError || !res) return os();
          resolve(res.dark ? 'dark' : 'light');
        });
      });
    });
  }

  Promise.all([loadConfig(), detectTheme()]).then(([loaded, mode]) => {
    cfg = loaded;
    editMode = mode;
    syncAll();
  });
});
