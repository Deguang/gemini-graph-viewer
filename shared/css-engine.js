/**
 * Gemini Polish · runtime stylesheet generator
 *
 * Replaces the old static polish-*.css files, which gated every rule behind a
 * `body.gp-*` class that JS had to add after storage resolved. Two problems with
 * that: the classes landed after first paint (visible flash), and the plain
 * selectors lost to Gemini on specificity or to its `!important` resets, so
 * settings appeared to "not take effect".
 *
 * Here the config *is* the stylesheet: only enabled toggles emit rules at all,
 * so no body classes and no timing window. Selectors are built on a prefix that
 * outranks anything Gemini ships, and every declaration is `!important` —
 * overriding a hostile SPA is what `!important` is actually for.
 */
(function (root) {
  'use strict';

  const { PALETTE_KEYS, COLOUR_KEYS, DEFAULT_CONFIG, hexToAlpha, isPassthrough, isOn } =
    root.GeminiPolishConfig;

  /* Tokens the pass-through scheme deliberately does not emit. A rule that
     references one resolves to an invalid var() and silently blanks the
     property, so such rules are skipped wholesale instead. */
  const STARVED = /var\(--gp-(text|bg|surface|link|codeText|codeBg|border)\)/;

  /* One toggle is inert for a different reason and cannot be derived: seeding
     Gemini's own --gem-sys-color--primary while --gp-accent reads FROM it is a
     circular var() reference, which resolves to nothing. */
  const CYCLE_KEYS = ['gp-a-system'];

  let inertCache = null;
  const NONE = new Set();

  /* Derived, not hand-listed. The old list drifted the moment a rule started
     using a new token: adding one and forgetting the list blanks the property
     with no error anywhere. */
  function inertKeys() {
    if (inertCache) return inertCache;
    inertCache = new Set(CYCLE_KEYS);
    COLOUR_KEYS.forEach(key => {
      const probe = {
        ...DEFAULT_CONFIG,
        colorScheme: 'probe',                       // never pass-through
        toggles: { structure: {}, colour: { [key]: true } },
        customCSS: '',
      };
      if (STARVED.test(buildCSS(probe, { probe: true }))) inertCache.add(key);
    });
    return inertCache;
  }

  /* `:not(#_gp)` matches every body (no element carries that id) while adding an
     id-level unit to specificity. `html body:not(#_gp)` is (1,0,2), so even
     Gemini's Angular-encapsulated selectors — which pick up an extra attribute
     unit each from `_ngcontent-*` — cannot outrank a rule built on it. */
  const B = 'html body:not(#_gp)';

  /* Prose containers. Gemini has shipped several of these across redesigns; all
     are listed so a rollout that renames one degrades instead of going blank. */
  const PROSE = '.markdown, message-content, .message-content, .response-content';
  const BLOCKS = 'p, li, td, th, blockquote';
  const INLINE = 'span, a, em, i, b, strong, mark, u';
  const NOT_MONO = 'code, pre, kbd, samp, .material-symbols-outlined, mat-icon, [class*="icon"]';
  /* Anchors below were checked against live gemini.google.com on 2026-09-04
     (desktop layout, conversation open). Dead ones found and replaced:
       .user-message-text  -> .query-text-line / user-query-content
       user-query .text    -> .query-text-line
       mat-sidenav         -> bard-sidenav-container
       [aria-selected]     -> [aria-current="page"] / .mdc-list-item--activated
       .conversation-item, conversation-container -> gone; chat-window is live
     Superseded names are kept only where they cost nothing and might return. */
  const USER = 'user-query, user-query-content, .query-text-line, .user-query-bubble-with-background';
  const USER_TEXT = '.query-text-line, user-query-content';
  const NAV = '[data-test-id*="sidenav"], bard-sidenav-container, [role="navigation"]';
  const ACTIONS = 'message-actions, response-actions, model-response-actions';
  /* Scroll regions, from the live DOM: the sidebar history list and the
     conversation column both live in an infinite-scroller. */
  const SCROLLERS = 'infinite-scroller, .overflow-container, chat-window, .chat-history';

  const px = (v) => `${v}px`;

  /** Each entry is scoped under the prefix; '' means the prefix itself (body). */
  function rule(selectors, body) {
    const sel = selectors.map(s => (s ? `${B} ${s}` : B)).join(',\n');
    return `${sel} {\n${body.map(d => `  ${d} !important;`).join('\n')}\n}`;
  }

  function paletteVars(palette) {
    const lines = PALETTE_KEYS.map(k => `  --gp-${k}: ${palette[k]};`);
    // Derived tints, so the popup only has to expose eight real colours.
    lines.push(`  --gp-accent-soft: ${hexToAlpha(palette.accent, 0.15)};`);
    lines.push(`  --gp-accent-faint: ${hexToAlpha(palette.accent, 0.08)};`);
    return lines.join('\n');
  }

  /* Pass-through emits ONE token: the accent, resolved from Gemini's own
     primary so it tracks Google's palette (and its own light/dark switch)
     instead of freezing a copied hex. Every other palette entry is deliberately
     absent — the rules that would need one are skipped, which is what "leave
     Gemini's colours alone" has to mean. The tints use color-mix because there
     is no hex to run hexToAlpha against. */
  function passthroughVars(fallback) {
    return [
      `  --gp-accent: var(--gem-sys-color--primary, ${fallback.accent});`,
      '  --gp-accent-soft: color-mix(in srgb, var(--gp-accent) 15%, transparent);',
      '  --gp-accent-faint: color-mix(in srgb, var(--gp-accent) 8%, transparent);',
    ].join('\n');
  }

  function buildCSS(cfg, opts = {}) {
    const t = cfg.toggles || {};
    const out = [];
    // `probe` is the inert-derivation pass; it must see the full palette.
    const pass = !opts.probe && isPassthrough(cfg.colorScheme);
    const inert = pass ? inertKeys() : NONE;
    const on = (key, fn) => { if (isOn(t, key) && !inert.has(key)) out.push(fn()); };

    // ---------------------------------------------------------------- tokens
    // Both palettes are bound up front and Gemini's own `dark-theme` class picks
    // between them, so theme switches need no JS and cannot flash.
    out.push(`/* palette tokens */
:root,
${B} {
${pass ? passthroughVars(cfg.colors.light) : paletteVars(cfg.colors.light)}
  --gp-font: ${resolveFont(cfg)};
  --gp-size: ${px(cfg.fontSize)};
  --gp-leading: ${cfg.lineHeight};
  --gp-para: ${cfg.paragraphSpacing}em;
  --gp-width: ${px(cfg.maxWidth)};
  --gp-nav-size: ${px(cfg.navFontSize)};
  --gp-nav-gap: ${px(cfg.navSpacing)};
}${pass ? '' : `
${B}.dark-theme {
${paletteVars(cfg.colors.dark)}
}`}`);

    // --------------------------------------------------------------- reading
    on('gp-r-font', () => rule(
      [`:is(${PROSE}, ${USER})`, `:is(${PROSE}, ${USER}) *:not(${NOT_MONO})`],
      ['font-family: var(--gp-font)']
    ));

    /* Size is set on block elements only. The old build also set it on `span`
       and `div`, which meant a heading whose text Gemini wrapped in a span was
       pinned to body size — the "headings ignore my settings" bug. Inline
       elements are told to inherit instead, which fixes Gemini's own inline
       sizing without overriding the heading scale. */
    on('gp-r-size', () => [
      rule([`.markdown :is(${BLOCKS})`, `:is(${USER_TEXT})`, `.user-query-bubble-with-background p`],
        ['font-size: var(--gp-size)']),
      rule([`.markdown :is(${BLOCKS}) :is(${INLINE})`, `.markdown :is(h1,h2,h3,h4,h5,h6) :is(${INLINE})`],
        ['font-size: inherit']),
    ].join('\n\n'));

    on('gp-r-leading', () => rule(
      [`:is(${PROSE})`, `.markdown :is(${BLOCKS})`],
      ['line-height: var(--gp-leading)', 'letter-spacing: 0.02em']
    ));

    on('gp-r-para', () => [
      /* Paragraph spacing goes BETWEEN lines of the query, never after the last
         one, and never on `user-query-content` — that is the container, so a
         margin there lands inside the bubble as a block of dead space under the
         text. Font size above can safely target both; margin cannot. */
      rule([`.markdown :is(p, li)`, `.query-text-line:not(:last-child)`],
        ['margin-bottom: var(--gp-para)']),
      /* Collapse the trailing margin at the very end of a response, which
         otherwise pushes the action bar down by a full paragraph gap. Scoped to
         the final block and the last-child chain inside it, so spacing BETWEEN
         blocks — including between list items — is untouched. A blanket
         :not(:last-child) on p/li would also strip the gap between a list and
         whatever follows it. */
      rule([`.markdown > :last-child`, `.markdown > :last-child :last-child`],
        ['margin-bottom: 0']),
      rule([`.markdown li`], ['padding-left: 1em']),
      rule([`.markdown :is(ul, ol)`], ['padding-inline-start: 1.8em']),
    ].join('\n\n'));

    on('gp-r-width', () => rule(
      [`:is(user-query, model-response)`],
      ['max-width: var(--gp-width)', 'margin-left: auto', 'margin-right: auto']
    ));

    on('gp-r-align', () => rule(
      [`.markdown :is(p, li, blockquote)`],
      ['text-align: justify', 'text-justify: inter-character']
    ));

    on('gp-r-headings', () => [
      rule([`.markdown :is(h1,h2,h3,h4,h5,h6)`],
        ['line-height: 1.4', 'margin-top: 1.5em', 'margin-bottom: 0.5em']),
      rule([`.markdown :is(h1,h2)`], ['font-weight: 700']),
      rule([`.markdown :is(h3,h4)`], ['font-weight: 600']),
      rule([`.markdown h1`], ['font-size: calc(var(--gp-size) * 1.75)']),
      rule([`.markdown h2`], ['font-size: calc(var(--gp-size) * 1.5)']),
      rule([`.markdown h3`], ['font-size: calc(var(--gp-size) * 1.25)']),
      rule([`.markdown h4`], ['font-size: calc(var(--gp-size) * 1.1)']),
      rule([`.markdown :is(h5,h6)`], ['font-size: var(--gp-size)']),
    ].join('\n\n'));

    // --------------------------------------------------------------- sidebar
    on('gp-s-custom', () => [
      rule([`:is(${NAV}) :is(a, button, [role="button"])`,
            `:is(${NAV}) :is(a, button, [role="button"]) *:not(${NOT_MONO})`],
        ['font-size: var(--gp-nav-size)']),
      // Neutralise MDC's fixed row height via its own vars, then set padding.
      // These compete with Angular Material's own definitions, so they need
      // !important just like the rest — unlike our private --gp-* tokens.
      `${B} :is(${NAV}) {
  --mdc-list-list-item-one-line-container-height: auto !important;
  --mdc-list-list-item-two-line-container-height: auto !important;
  --mdc-list-list-item-three-line-container-height: auto !important;
}`,
      rule([`:is(${NAV}) :is(a, .mdc-list-item, .mat-mdc-list-item)`],
        ['padding-top: var(--gp-nav-gap)', 'padding-bottom: var(--gp-nav-gap)',
         'min-height: auto', 'height: auto', 'line-height: 1.4']),
    ].join('\n\n'));

    const ACTIVE = `:is(${NAV}) :is([aria-current="page"], .mdc-list-item--activated)`;
    on('gp-s-active', () => [
      rule([ACTIVE], ['background-color: var(--gp-accent-soft)', 'border-radius: 8px']),
      rule([`${ACTIVE} :is(span, .title, .label, .mdc-list-item__primary-text)`],
        ['color: var(--gp-accent)', 'font-weight: 600']),
    ].join('\n\n'));

    // ---------------------------------------------------------------- colour
    /* Custom properties cascade on their own, so seeding Gemini's design tokens
       recolours components we never wrote a selector for (buttons, FABs, focus
       rings). Cheap and broad — but only reaches components that read the token,
       hence the explicit rules below for everything that hardcodes a colour. */
    on('gp-a-system', () => `${B} {
  --gem-sys-color--primary: var(--gp-accent) !important;
  --gem-sys-color--primary-container: var(--gp-accent-soft) !important;
  --gem-sys-color--on-primary-container: var(--gp-accent) !important;
  --lumi-sys-color--primary: var(--gp-accent) !important;
  --lumi-sys-color--primary-container: var(--gp-accent-soft) !important;
  --mat-sys-primary: var(--gp-accent) !important;
  --mat-sys-primary-container: var(--gp-accent-soft) !important;
  --mdc-theme-primary: var(--gp-accent) !important;
}`);

    on('gp-c-text', () => rule(
      [`:is(${PROSE})`, `.markdown :is(${BLOCKS}, h1, h2, h3, h4, h5, h6)`,
       `.markdown :is(${BLOCKS}) :is(span, em, i, u)`, `:is(${USER})`],
      ['color: var(--gp-text)']
    ));

    on('gp-bg-tint', () => [
      `${B} {
  --gem-sys-color--surface: var(--gp-bg) !important;
  --gem-sys-color--background: var(--gp-bg) !important;
  --gem-sys-color--surface-container: var(--gp-surface) !important;
  --gem-sys-color--surface-container-low: var(--gp-surface) !important;
  --gem-sys-color--surface-container-high: var(--gp-surface) !important;
  --gem-sys-color--surface-container-lowest: var(--gp-bg) !important;
  --gem-sys-color--surface-container-highest: var(--gp-surface) !important;
  --lumi-sys-color--surface: var(--gp-bg) !important;
  --lumi-sys-color--surface-container: var(--gp-surface) !important;
  --lumi-sys-color--background: var(--gp-bg) !important;
  --mat-sys-surface: var(--gp-bg) !important;
  --mat-sys-background: var(--gp-bg) !important;
  --mdc-theme-background: var(--gp-bg) !important;
}`,
      // Token seeding misses anywhere Gemini writes a literal colour, so paint
      // the known top-level wrappers directly as well.
      rule([''], ['background-color: var(--gp-bg)']),
      rule([`:is(bard-root, bard-sidenav-content, main, chat-window, infinite-scroller, .chat-app, .chat-history)`],
        ['background-color: var(--gp-bg)']),
      rule([`:is(${NAV})`], ['background-color: var(--gp-surface)']),

      /* Surfaces Gemini paints with a literal colour, so neither token seeding
         nor the wrapper sweep above reaches them — they stay white while the
         rest of the app is tinted. Found by sweeping computed styles on live
         Gemini (2026-09-04) for opaque near-white backgrounds:
           .app-tabs      sidebar tab strip
           input-area-v2  the composer, the largest offender at ~660x64
         The two scroll fades are gradients *to* white rather than solid fills,
         so they need the whole gradient rebuilt, not a background-color. */
      rule([`:is(.app-tabs, input-area-v2)`], ['background-color: var(--gp-surface)']),
      rule([`.top-gradient`],
        ['background-image: linear-gradient(var(--gp-surface), transparent)']),
      rule([`.bottom-gradient`],
        ['background-image: linear-gradient(to top, var(--gp-surface), transparent)']),
      /* Nav rows carry their own white fill. Clear it so the sidebar tint shows
         through, but never on the active row — gp-s-active owns that one and
         this rule is emitted later, so it would otherwise win. */
      rule([`.gem-nav-list-item:not([aria-current="page"]):not(.mdc-list-item--activated)`],
        ['background-color: transparent']),

      /* Scrollbars are painted by the browser, not by Gemini's CSS, so a sweep
         of computed background colours can never find them — against a tinted
         sidebar the default white gutter reads as a seam. Styled per scroll
         region rather than globally, so the tint never leaks onto scrollbars
         outside the app. Only emitted under a real scheme (gp-bg-tint is
         skipped wholesale under pass-through), so --gp-text always resolves. */
      `${B} :is(${SCROLLERS})::-webkit-scrollbar {
  width: 10px !important;
  height: 10px !important;
  background-color: var(--gp-surface) !important;
}
${B} :is(${SCROLLERS})::-webkit-scrollbar-track {
  background-color: var(--gp-surface) !important;
}
${B} :is(${SCROLLERS})::-webkit-scrollbar-corner {
  background-color: var(--gp-surface) !important;
}
${B} :is(${SCROLLERS})::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--gp-text) 26%, transparent) !important;
  border-radius: 8px !important;
}
${B} :is(${SCROLLERS})::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--gp-text) 42%, transparent) !important;
}`,
    ].join('\n\n'));

    on('gp-c-link', () => [
      rule([`.markdown a`, `:is(${PROSE}) a[href]`], ['color: var(--gp-link)']),
      rule([`.markdown a:hover`], ['text-decoration-color: var(--gp-link)']),
    ].join('\n\n'));

    on('gp-a-bold', () => rule([`.markdown :is(b, strong)`], ['color: var(--gp-accent)']));

    on('gp-a-code', () => rule(
      [`.markdown :is(p, li, td) > code`],
      ['color: var(--gp-codeText)', 'background-color: var(--gp-codeBg)',
       'border-radius: 4px', 'padding: 0.1em 0.3em']
    ));

    /* Fenced blocks only — the inline rule above targets `> code` inside prose,
       this one targets the `pre` wrapper Gemini renders for code blocks. */
    on('gp-c-codeblock', () => [
      rule([`.markdown pre`, `:is(code-block, .code-block) pre`, `.formatted-code-block-internal-container`],
        ['background-color: var(--gp-codeBg)', 'border-radius: 8px']),
      rule([`.markdown pre code`, `:is(code-block, .code-block) pre code`],
        ['background: transparent', 'color: var(--gp-text)']),

      /* The code block's HEADER is a separate child with its own near-black
         fill (rgb(20,20,20)), so recolouring the container leaves a black bar
         sitting on top of a light block. It also holds a white language label
         and white icon buttons — repainting the bar without them would leave
         white-on-light. Both move together, tinted just off the code body so
         the header still reads as a distinct strip. */
      rule([`.code-block-decoration`],
        ['background-color: color-mix(in srgb, var(--gp-codeBg) 92%, var(--gp-text))',
         'border-bottom: 1px solid var(--gp-border)']),
      rule([`.code-block-decoration`, `.code-block-decoration *`],
        ['color: var(--gp-text)']),
    ].join('\n\n'));

    on('gp-a-quote', () => rule(
      [`.markdown blockquote`],
      ['border-left: 4px solid var(--gp-accent)', 'padding-left: 1.2em', 'margin-left: 0']
    ));

    on('gp-a-bubble', () => rule(
      [`:is(user-query .message-content, .user-query-bubble-with-background, [data-test-id="user-query"] .message-content)`],
      ['background-color: var(--gp-accent-soft)', 'border-radius: 12px', 'padding: 12px 16px']
    ));

    on('gp-c-border', () => [
      rule([`.markdown hr`], ['border-color: var(--gp-border)']),
      rule([`.markdown :is(table, th, td)`], ['border-color: var(--gp-border)']),
      rule([`.markdown th`], ['background-color: var(--gp-surface)']),
    ].join('\n\n'));

    // --------------------------------------------------------------- minimal
    on('gp-m-disclaimer', () => rule(
      [`:is(hallucination-disclaimer, chat-disclaimer, [data-test-id="disclaimer"], [data-test-id="bottom-disclaimer"])`],
      ['display: none']
    ));

    on('gp-m-fade', () => [
      rule([`:is(${ACTIONS})`], ['opacity: 0', 'transition: opacity 0.25s ease', 'pointer-events: none']),
      rule([`:is(${ACTIONS}):hover`,
            `:is(model-response, user-query, .response-container-footer):hover :is(${ACTIONS})`],
        ['opacity: 1', 'pointer-events: auto']),
    ].join('\n\n'));

    /* Last in the sheet so a user rule of equal weight wins. Note that engine
       rules are `!important`, so custom CSS must be `!important` too to beat
       them — surfaced in the popup's placeholder text. */
    if (cfg.customCSS && cfg.customCSS.trim()) {
      out.push(`/* user custom CSS */\n${cfg.customCSS}`);
    }

    return out.join('\n\n');
  }

  function resolveFont(cfg) {
    if (cfg.fontFamily === 'custom' && cfg.customFontName) return cfg.customFontName;
    return cfg.fontFamily;
  }

  root.GeminiPolishCSS = { buildCSS, inertKeys, SPECIFICITY_PREFIX: B };
})(typeof globalThis !== 'undefined' ? globalThis : self);
