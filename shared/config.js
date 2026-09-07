/**
 * Gemini Polish · shared config schema
 *
 * Loaded as a plain script in all three contexts (content script via manifest,
 * popup via <script>, service worker via importScripts) and published on
 * globalThis so each reads the same schema.
 *
 * The central modelling decision is that a setting belongs to exactly one AXIS:
 *   structure — how much of Gemini's layout/chrome we replace  (the 风格 control)
 *   colour    — what it looks like                             (the 配色 control)
 * `toggles` is nested by axis rather than being one flat map, because the flat
 * shape let write paths cross axes: applying a preset wholesale cleared the
 * user's colours, and judging preset identity across all keys demoted
 * "舒适阅读 + Nord" to Custom on every load. Nested, neither is expressible —
 * `toggles.structure = {...}` cannot reach colour.
 */
(function (root) {
  'use strict';

  /* Toggle ids are persisted, so they are append-only: renaming one silently
     resets that setting for everyone. The `gp-a-*` / `gp-bg-tint` names predate
     the axis split and are kept for that reason. */
  const STRUCTURE_KEYS = [
    'gp-r-font', 'gp-r-size', 'gp-r-leading', 'gp-r-para', 'gp-r-width',
    'gp-r-align', 'gp-r-headings',
    'gp-s-custom',
    'gp-m-disclaimer', 'gp-m-fade',
  ];

  const COLOUR_KEYS = [
    'gp-c-text', 'gp-c-link', 'gp-a-bold', 'gp-a-quote', 'gp-a-code',
    'gp-c-codeblock', 'gp-c-border',
    'gp-s-active', 'gp-bg-tint', 'gp-a-system', 'gp-a-bubble',
  ];

  const TOGGLE_KEYS = [...STRUCTURE_KEYS, ...COLOUR_KEYS];
  const AXES = { structure: STRUCTURE_KEYS, colour: COLOUR_KEYS };
  const axisOf = (key) => (COLOUR_KEYS.includes(key) ? 'colour' : 'structure');

  /* chrome.i18n resolves against the browser's locale and falls back to
     default_locale on its own. The literal second argument is only for contexts
     with no extension API at all — the test runner — so it never diverges from
     what users see. */
  function t(key, fallback, subs) {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        const s = chrome.i18n.getMessage(key, subs);
        if (s) return s;
      }
    } catch (e) { /* not an extension context */ }
    let out = fallback;
    (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(v); });
    return out;
  }

  const PALETTE_KEYS = ['accent', 'text', 'bg', 'surface', 'link', 'codeText', 'codeBg', 'border'];

  const COLOR_SCHEMES = {
    /* Pass-through. Its palette is NOT emitted — it exists only to seed Custom
       and to give the accent-only rules a fallback. Shipping copied hex values
       here was a guess that had already drifted: Gemini's real
       --gem-sys-color--outline-variant is #c4c7c5, this table said #dadce0.
       Anywhere we ADD colour Gemini does not have (bold, blockquote rule,
       active nav) the engine uses var(--gem-sys-color--primary) instead, so
       the accent tracks Google's rather than freezing a copy of it. */
    native: {
      label: t('scheme_native', "Native Gemini"),
      passthrough: true,
      /* Reproduces Gemini's own colours, so it is exempt from the contrast bar
         for the same reason as the other reproductions: Google's blue scores
         4.51 on white, so no tinted surface can clear 4.5 without changing the
         very colour this scheme exists to preserve. The palette is a seed for
         Custom anyway — pass-through emits none of it. */
      faithful: true,
      light: { accent: '#1a73e8', text: '#1f1f1f', bg: '#ffffff', surface: '#f0f4f9',
               link: '#1a73e8', codeText: '#b31412', codeBg: '#f1f3f4', border: '#dadce0' },
      dark:  { accent: '#8ab4f8', text: '#e3e3e3', bg: '#1b1c1d', surface: '#1e1f20',
               link: '#8ab4f8', codeText: '#f28b82', codeBg: '#2d2e30', border: '#3c4043' },
    },
    solarized: {
      /* Faithful reproduction of the published palette — its low
         contrast is the palette's own design, not an oversight. Changing the
         values to pass a ratio would mean it is no longer that palette. */
      faithful: true,
      label: 'Solarized',
      light: { accent: '#268bd2', text: '#657b83', bg: '#fdf6e3', surface: '#eee8d5',
               link: '#2aa198', codeText: '#d33682', codeBg: '#eee8d5', border: '#93a1a1' },
      dark:  { accent: '#268bd2', text: '#839496', bg: '#002b36', surface: '#073642',
               link: '#2aa198', codeText: '#d33682', codeBg: '#073642', border: '#586e75' },
    },
    nord: {
      /* Faithful reproduction of the published palette — its low
         contrast is the palette's own design, not an oversight. Changing the
         values to pass a ratio would mean it is no longer that palette. */
      faithful: true,
      label: 'Nord',
      light: { accent: '#5e81ac', text: '#2e3440', bg: '#eceff4', surface: '#e5e9f0',
               link: '#5e81ac', codeText: '#bf616a', codeBg: '#e5e9f0', border: '#d8dee9' },
      dark:  { accent: '#88c0d0', text: '#d8dee9', bg: '#2e3440', surface: '#3b4252',
               link: '#88c0d0', codeText: '#bf616a', codeBg: '#3b4252', border: '#4c566a' },
    },
    gruvbox: {
      /* Faithful reproduction of the published palette — its low
         contrast is the palette's own design, not an oversight. Changing the
         values to pass a ratio would mean it is no longer that palette. */
      faithful: true,
      label: 'Gruvbox',
      light: { accent: '#d65d0e', text: '#3c3836', bg: '#fbf1c7', surface: '#ebdbb2',
               link: '#076678', codeText: '#9d0006', codeBg: '#ebdbb2', border: '#d5c4a1' },
      dark:  { accent: '#fe8019', text: '#ebdbb2', bg: '#282828', surface: '#3c3836',
               link: '#83a598', codeText: '#fb4934', codeBg: '#3c3836', border: '#504945' },
    },
    /* White ground, warm accent — the one combination the other schemes cannot
       express, since all of them tint the background. Gruvbox's orange is not
       reusable here: #d65d0e scores 3.87 on white, below the 4.5 a colour used
       for body bold and links has to clear.

       The binding pair is NOT white but `surface`: the sidebar, code blocks and
       table headers sit on it, and the accent lands there too (current-chat
       label). A brighter orange that clears white can still fail on a tinted
       surface, so the two were tuned together — #d0400b is the brightest,
       most saturated orange clearing 4.5 on BOTH (4.75 / 4.53), with `surface`
       lifted to #fcf9f7 to buy the headroom. */
    amber: {
      label: t('scheme_amber', 'Amber'),
      light: { accent: '#d0400b', text: '#1f1f1f', bg: '#ffffff', surface: '#fcf9f7',
               link: '#d0400b', codeText: '#a83408', codeBg: '#faf6f2', border: '#ece3dc' },
      dark:  { accent: '#ff9a45', text: '#e9e5e1', bg: '#1a1816', surface: '#24211e',
               link: '#ff9a45', codeText: '#fdba74', codeBg: '#24211e', border: '#38332e' },
    },
    sepia: {
      label: t('scheme_sepia', "Sepia"),
      light: { accent: '#7d5229', text: '#5b4636', bg: '#f4ecd8', surface: '#eae0c8',
               link: '#7d5229', codeText: '#8f4620', codeBg: '#eae0c8', border: '#d9cbb0' },
      dark:  { accent: '#d0996a', text: '#d8c9b0', bg: '#2b2622', surface: '#3a332c',
               link: '#d0996a', codeText: '#e0a184', codeBg: '#3a332c', border: '#4a4137' },
    },
  };

  const TYPO_KEYS = ['gp-r-size', 'gp-r-leading', 'gp-r-para', 'gp-r-width', 'gp-r-headings'];
  const DECLUTTER_KEYS = ['gp-m-disclaimer', 'gp-m-fade'];

  const structureSet = (...keys) => {
    const on = new Set(keys.flat());
    return STRUCTURE_KEYS.reduce((acc, k) => (acc[k] = on.has(k), acc), {});
  };

  /* One object per preset: the toggles it owns AND the values it imposes.
     These were two parallel maps, with nothing requiring a preset to appear in
     both — a preset that moved toggles but not values switched typography on
     and changed nothing visible. A preset's `toggles` covers STRUCTURE ONLY,
     by construction. */
  const PRESETS = {
    native: {
      label: t('preset_native', "Native Gemini"),
      toggles: structureSet(),
      values: null,                 // applies no typography, so imposes nothing
    },
    comfort: {
      label: t('preset_comfort', "Comfortable"),
      toggles: structureSet(TYPO_KEYS),
      values: { fontSize: 17, lineHeight: 1.7, paragraphSpacing: 1.2, maxWidth: 860 },
    },
    focus: {
      label: t('preset_focus', "Focus"),
      toggles: structureSet(TYPO_KEYS, DECLUTTER_KEYS),
      /* Deliberately further from `comfort` than the toggles alone make it: when
         both shipped identical numbers they differed only by two small chrome
         elements and felt like the same thing. A narrower measure, more leading
         and a larger size are what actually read as "immersive". */
      values: { fontSize: 18, lineHeight: 1.9, paragraphSpacing: 1.5, maxWidth: 700 },
    },
  };

  /* Old preset ids, kept only to translate a stored config. */
  const LEGACY_PRESETS = { classic: 'native', reading: 'comfort', minimal: 'focus', power: 'focus' };

  const SLIDERS = {
    fontSize:         { label: t('slider_fontSize', "Size"),     min: 10,  max: 30,   step: 1,   unit: 'px' },
    lineHeight:       { label: t('slider_lineHeight', "Line height"),     min: 1.0, max: 3.0,  step: 0.1, unit: ''   },
    paragraphSpacing: { label: t('slider_paragraphSpacing', "Paragraph gap"),   min: 0.0, max: 4.0,  step: 0.1, unit: 'em' },
    maxWidth:         { label: t('slider_maxWidth', "Width"),     min: 400, max: 1800, step: 50,  unit: 'px' },
    navFontSize:      { label: t('slider_navFontSize', "Sidebar size"), min: 10,  max: 24,   step: 1,   unit: 'px' },
    navSpacing:       { label: t('slider_navSpacing', "Sidebar spacing"), min: 0,   max: 40,   step: 1,   unit: 'px' },
  };

  const UI_SECTIONS = [
    {
      id: 'reading', label: t('section_reading', "Reading (content)"),
      rows: [
        { type: 'font',   label: t('row_font', "Font"),   toggle: 'gp-r-font' },
        { type: 'slider', pref: 'fontSize',         toggle: 'gp-r-size' },
        { type: 'slider', pref: 'lineHeight',       toggle: 'gp-r-leading' },
        { type: 'slider', pref: 'paragraphSpacing', toggle: 'gp-r-para' },
        { type: 'slider', pref: 'maxWidth',         toggle: 'gp-r-width' },
        { type: 'switch', label: t('row_justify', "Justify"), desc: t('row_justify_desc', "Tidier CJK line breaks"), toggle: 'gp-r-align' },
        { type: 'switch', label: t('row_headings', "Heading scale"), toggle: 'gp-r-headings' },
        { type: 'color',  label: t('row_text', "Body text colour"), toggle: 'gp-c-text',  swatches: ['text'] },
        { type: 'color',  label: t('row_link', "Link colour"),     toggle: 'gp-c-link',  swatches: ['link'] },
        { type: 'color',  label: t('row_emphasis', "Accent"),     desc: t('row_emphasis_desc', "Bold and blockquotes"),
          toggle: ['gp-a-bold', 'gp-a-quote'], swatches: ['accent'] },
        { type: 'color',  label: t('row_code', "Code colours"),   desc: t('row_code_desc', "Inline code and code blocks"),
          toggle: ['gp-a-code', 'gp-c-codeblock'], swatches: ['codeText', 'codeBg'] },
        { type: 'color',  label: t('row_border', "Tables & rules"), toggle: 'gp-c-border', swatches: ['border'] },
      ],
    },
    {
      id: 'interface', label: t('section_interface', "Interface (chrome)"),
      rows: [
        { type: 'slider', pref: 'navFontSize', toggle: 'gp-s-custom' },
        // Same toggle as 侧栏字号 — dims with it, but must not draw a second switch.
        { type: 'slider', pref: 'navSpacing', governedBy: 'gp-s-custom' },
        { type: 'color',  label: t('row_bg', "Page background"), toggle: 'gp-bg-tint', swatches: ['bg', 'surface'] },
        { type: 'color',  label: t('row_uiAccent', "Interface accent"), desc: t('row_uiAccent_desc', "Buttons, current chat, query bubble"),
          toggle: ['gp-a-system', 'gp-s-active', 'gp-a-bubble'], swatches: ['accent'] },
        { type: 'switch', label: t('row_disclaimer', "Hide disclaimer"), toggle: 'gp-m-disclaimer' },
        { type: 'switch', label: t('row_fade', "Reveal actions on hover"), desc: t('row_fade_desc', "Like, share, copy\u2026"), toggle: 'gp-m-fade' },
      ],
    },
    {
      id: 'enhance', label: t('section_enhance', "Enhancements"),
      rows: [
        { type: 'switch', label: t('row_mermaid', "Mermaid diagrams"), desc: t('row_mermaid_desc', "Split-view diagram viewer"), pref: 'enableGraph' },
        { type: 'switch', label: t('row_copymd', "Copy as Markdown"), desc: t('row_copymd_desc', "Adds a button that bypasses Gemini's own copy"), pref: 'enableCopyMd' },
      ],
    },
  ];

  /* Shown without expanding Advanced — the settings worth reaching in one click. */
  const DEFAULT_VIEW = {
    sliders: ['fontSize', 'lineHeight', 'maxWidth'],
    switches: [
      { label: t('row_disclaimer', "Hide disclaimer"), toggle: 'gp-m-disclaimer' },
      { label: t('row_mermaid', "Mermaid diagrams"), pref: 'enableGraph' },
    ],
  };

  /* Picking a scheme is a reskin, so it owns EVERY colour bit. A shorter list
     orphans the rest: once presets stopped carrying colour, nothing switched on
     bold/quote/code/border and choosing Nord left bold text plain black.
     Picking the pass-through scheme is the reverse gesture, switching them off. */
  const SCHEME_ACTIVATES = COLOUR_KEYS;

  const emptyToggles = () => ({
    structure: STRUCTURE_KEYS.reduce((a, k) => (a[k] = false, a), {}),
    colour: COLOUR_KEYS.reduce((a, k) => (a[k] = false, a), {}),
  });

  const SCHEMA_VERSION = 2;

  const DEFAULT_CONFIG = {
    schemaVersion: SCHEMA_VERSION,
    preset: 'comfort',
    polishOnboarded: false,
    enableGraph: true,
    enableCopyMd: true,
    toggles: { structure: { ...PRESETS.comfort.toggles }, colour: emptyToggles().colour },
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    customFontName: '',
    fontSize: 17,
    lineHeight: 1.7,
    paragraphSpacing: 1.2,
    maxWidth: 860,
    navFontSize: 13,
    navSpacing: 10,
    colorScheme: 'native',
    colors: { light: { ...COLOR_SCHEMES.native.light }, dark: { ...COLOR_SCHEMES.native.dark } },
    customCSS: '',
  };

  // ---------------------------------------------------------------- helpers

  /** '#rrggbb' + alpha -> '#rrggbbaa'; anything unparseable passes through. */
  function hexToAlpha(hex, alpha) {
    const h = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
    return `#${h}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }

  /** Read a toggle without the caller needing to know its axis. */
  function isOn(toggles, key) {
    const t = toggles || {};
    return !!((t.structure && t.structure[key]) || (t.colour && t.colour[key]));
  }

  /** Flat view, for anything that genuinely does not care about axes. */
  function flatToggles(toggles) {
    return TOGGLE_KEYS.reduce((acc, k) => (acc[k] = isOn(toggles, k), acc), {});
  }

  function setToggle(toggles, key, on) {
    toggles[axisOf(key)][key] = !!on;
  }

  /** True when the scheme means "leave Gemini's own colours alone". */
  function isPassthrough(name) {
    return !!(COLOR_SCHEMES[name] && COLOR_SCHEMES[name].passthrough);
  }

  /* Preset identity is judged on the STRUCTURE axis only. Comparing colour too
     would demote any config carrying a real scheme to Custom on every load. */
  function matchesPreset(toggles, presetName) {
    const p = PRESETS[presetName];
    if (!p) return false;
    return STRUCTURE_KEYS.every(k => !!(toggles.structure || {})[k] === !!p.toggles[k]);
  }

  function normalizePalette(palette, fallback) {
    return PALETTE_KEYS.reduce((out, k) => {
      out[k] = isHex((palette || {})[k]) ? palette[k] : fallback[k];
      return out;
    }, {});
  }

  // -------------------------------------------------------------- migrations

  /* Ordered, run once each, from the config's stored version to the current
     one. Before this there were three ad-hoc `if`s inside the merge with no way
     to tell which had already been applied, so each had to stay correct
     forever. None of these may rewrite what the user SEES — they translate
     shape and labels only. */
  const MIGRATIONS = [
    // v0 -> v1 · a single accent + a three-option background became a palette,
    // and the copied-hex "Gemini Default" scheme became a pass-through.
    function toV1(c) {
      if (!c.colors) {
        const seed = {};
        if (isHex(c.accentColor)) { seed.accent = c.accentColor; seed.link = c.accentColor; }
        if (isHex(c.bgColor)) seed.bg = c.bgColor;
        if (Object.keys(seed).length) c.colors = { light: seed, dark: {} };
      }
      delete c.accentColor;
      delete c.bgColor;
      if (c.colorScheme === 'default') c.colorScheme = 'native';
      if (LEGACY_PRESETS[c.preset]) c.preset = LEGACY_PRESETS[c.preset];
    },
    // v1 -> v2 · toggles split by axis. Membership decides the bucket, so the
    // user's on/off state survives exactly.
    function toV2(c) {
      if (c.toggles) c.toggles = normalizeToggles(c.toggles);
    },
  ];

  /* Accepts either shape and returns a SPARSE nested one: only keys the caller
     actually mentioned. Tolerating the flat shape at any version matters
     because partial updates (the popup's live push) are merged onto a config
     that already reports the current version, so the migrations would not run
     on them. */
  function normalizeToggles(t) {
    if (!t) return { structure: {}, colour: {} };
    if (t.structure || t.colour) return { structure: t.structure || {}, colour: t.colour || {} };
    const out = { structure: {}, colour: {} };
    Object.keys(t).forEach(k => { if (TOGGLE_KEYS.includes(k)) out[axisOf(k)][k] = !!t[k]; });
    return out;
  }

  function mergeConfig(items) {
    const src = { ...(items || {}) };

    let from = Number.isInteger(src.schemaVersion) ? src.schemaVersion : 0;
    for (let v = from; v < MIGRATIONS.length; v++) MIGRATIONS[v](src);

    // Absent means "say nothing", not "everything off" — emptyToggles() spells
    // out every key as false, so spreading it would zero the defaults.
    const stored = normalizeToggles(src.toggles);
    const cfg = {
      ...DEFAULT_CONFIG,
      ...src,
      schemaVersion: SCHEMA_VERSION,
      toggles: {
        structure: { ...DEFAULT_CONFIG.toggles.structure, ...stored.structure },
        colour: { ...DEFAULT_CONFIG.toggles.colour, ...stored.colour },
      },
    };

    if (PRESETS[cfg.preset] && !matchesPreset(cfg.toggles, cfg.preset)) cfg.preset = 'custom';
    if (cfg.preset !== 'custom' && !PRESETS[cfg.preset]) cfg.preset = 'custom';

    const scheme = COLOR_SCHEMES[cfg.colorScheme] ? cfg.colorScheme : 'native';
    const pal = COLOR_SCHEMES[scheme];
    cfg.colorScheme = scheme;
    cfg.colors = {
      light: normalizePalette((src.colors || {}).light, pal.light),
      dark: normalizePalette((src.colors || {}).dark, pal.dark),
    };
    return cfg;
  }

  /** Toggle keys a UI row drives, as an array (rows may drive several). */
  function togglesOf(row) {
    if (!row.toggle) return [];
    return Array.isArray(row.toggle) ? row.toggle : [row.toggle];
  }

  root.GeminiPolishConfig = {
    SCHEMA_VERSION, TOGGLE_KEYS, STRUCTURE_KEYS, COLOUR_KEYS, AXES, axisOf,
    PALETTE_KEYS, COLOR_SCHEMES, PRESETS, LEGACY_PRESETS, DEFAULT_CONFIG,
    TYPO_KEYS, DECLUTTER_KEYS,
    SLIDERS, UI_SECTIONS, DEFAULT_VIEW, SCHEME_ACTIVATES,
    t, hexToAlpha, isHex, isOn, flatToggles, setToggle, emptyToggles,
    mergeConfig, togglesOf, matchesPreset, isPassthrough,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
