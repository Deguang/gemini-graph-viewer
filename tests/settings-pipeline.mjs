/**
 * Gemini Polish · settings pipeline + CSS engine tests
 *
 * Covers the three things most likely to silently regress:
 *   1. Write batching — a slider drag must produce O(1) storage writes.
 *      chrome.storage.sync caps at 120 writes/minute and fails silently past it,
 *      which is what made settings appear not to save.
 *   2. The generated stylesheet — only enabled toggles emit rules, both palettes
 *      ship together, and every declaration is !important so Gemini cannot win.
 *   3. Cross-device merge — newest `updatedAt` wins across local/sync.
 *
 * Run: npm test   (Node >= 20.19 — jsdom 27 pulls an ESM-only dep that older
 *      Node cannot require. The repo pins 24 via .node-version.)
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function checkThat(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
}

const allOn = (C) => ({
  structure: Object.fromEntries(C.STRUCTURE_KEYS.map(k => [k, true])),
  colour: Object.fromEntries(C.COLOUR_KEYS.map(k => [k, true])),
});
const withToggle = (C, key) => {
  const t = C.emptyToggles();
  C.setToggle(t, key, true);
  return t;
};

/** Load the shared scripts into a bare context — no DOM needed. */
function loadShared() {
  const sandbox = vm.createContext({});
  vm.runInContext(read('shared/config.js'), sandbox);
  vm.runInContext(read('shared/css-engine.js'), sandbox);
  return sandbox;
}

function makeChromeMock(seed = {}, opts = {}) {
  const stats = { localWrites: 0, syncWrites: 0, messages: [] };
  const area = (name, counterKey) => {
    const store = { ...(seed[name] || {}) };
    return {
      _store: store,
      get(_keys, cb) { cb({ ...store }); },
      set(items, cb) { stats[counterKey]++; Object.assign(store, items); if (cb) cb(); },
    };
  };
  const chrome = {
    storage: { local: area('local', 'localWrites'), sync: area('sync', 'syncWrites'), onChanged: { addListener() {} } },
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: '0.0.0-test' }),
      onMessage: { _listeners: [], addListener(fn) { this._listeners.push(fn); } },
    },
    tabs: {
      query(_q, cb) { cb([{ id: 1, active: true }]); },
      sendMessage(_id, msg, cb) {
        stats.messages.push(msg);
        // The popup asks the page which theme Gemini is in before deciding
        // which palette the swatches edit.
        if (cb) cb(msg && msg.type === 'polish:theme' ? { dark: !!opts.darkPage } : undefined);
      },
    },
  };
  return { chrome, stats };
}

// ============================================================== CSS engine

function testEngine() {
  console.log('\ncss-engine · generated stylesheet');

  const { GeminiPolishConfig: C, GeminiPolishCSS: E } = loadShared();
  const cfg = (over = {}) => C.mergeConfig(over);

  const ALL_ON = allOn(C);
  const allOff = cfg({ toggles: C.emptyToggles() });
  const cssOff = E.buildCSS(allOff);

  checkThat('with every toggle off, only the token block is emitted',
    cssOff.includes('--gp-accent:') && !cssOff.includes('font-family: var(--gp-font)'));

  const full = cfg({ colorScheme: 'nord', colors: C.COLOR_SCHEMES.nord, toggles: ALL_ON });
  const cssFull = E.buildCSS(full);

  checkThat('braces balance', (cssFull.match(/{/g) || []).length === (cssFull.match(/}/g) || []).length);
  checkThat('no selector left dangling on a combinator', !/[>+~,]\s*{/.test(cssFull));
  checkThat('every rule is scoped by the specificity prefix',
    cssFull.split('\n').filter(l => l.trim().endsWith('{') && !l.startsWith(':root'))
      .every(l => l.includes('html body:not(#_gp)')));

  /* The whole point of the rewrite: Gemini must not be able to win a tie.
     Our own --gp-* tokens are exempt — nothing else defines them, so there is
     no cascade to win. Everything else, including the --mdc-* vars we override
     out from under Angular Material, must be !important. */
  const decls = cssFull.split('\n')
    .filter(l => /^\s{2}[A-Za-z-]+:/.test(l))
    .filter(l => !l.trim().startsWith('--gp-'));
  checkThat('every declaration that competes with Gemini carries !important',
    decls.length > 0 && decls.every(l => l.includes('!important')));

  // Both palettes ship together and Gemini's own class selects between them,
  // so a theme switch needs no JS and cannot flash.
  checkThat('light palette bound on the prefix', cssFull.includes(':root,\nhtml body:not(#_gp) {'));
  checkThat('dark palette bound under Gemini dark-theme class',
    cssFull.includes('html body:not(#_gp).dark-theme {'));

  // Regression: the old build set font-size on span/div, which pinned headings
  // whose text Gemini wraps in a span to body size.
  checkThat('inline children of headings are told to inherit, not take body size',
    /\.markdown :is\(h1,h2,h3,h4,h5,h6\) :is\(span[^)]*\)/.test(cssFull) && cssFull.includes('font-size: inherit'));
  checkThat('font-size is never applied to bare span/div selectors',
    !/\.markdown :is\([^)]*\bdiv\b[^)]*\) \{\n\s*font-size:/.test(cssFull));

  // Per-toggle gating
  // Colour rules need a real scheme; the pass-through one starves them by design.
  const only = (key) => E.buildCSS(cfg({ colorScheme: 'nord', colors: C.COLOR_SCHEMES.nord,
    toggles: withToggle(C, key) }));
  /* A margin on the query CONTAINER renders as dead space inside the bubble,
     and a margin on the final line does the same — both were shipped once. */
  const para = only('gp-r-para');
  checkThat('paragraph spacing never lands on the query container',
    !/user-query-content[^{]*\{[^}]*margin-bottom/s.test(para));
  checkThat('and never after the last line of a query',
    para.includes('.query-text-line:not(:last-child)'));
  checkThat('the trailing gap before the action bar is collapsed',
    para.includes('.markdown > :last-child') && /margin-bottom: 0 !important/.test(para));
  checkThat('but spacing between blocks is left alone',
    para.includes('.markdown :is(p, li)') && !para.includes(':is(p, li):not(:last-child)'));

  checkThat('gp-c-text emits the body text colour', only('gp-c-text').includes('color: var(--gp-text)'));
  checkThat('gp-c-link emits the link colour', only('gp-c-link').includes('color: var(--gp-link)'));
  const block = only('gp-c-codeblock');
  checkThat('gp-c-codeblock targets pre, not inline code', block.includes('.markdown pre'));
  /* The header is a separate child with its own near-black fill, so recolouring
     only the container leaves a black bar on a light block — and its label and
     icons are white, so the bar and its contents have to move together. */
  checkThat('…and the code block header, which carries its own dark fill',
    block.includes('.code-block-decoration'));
  checkThat('…recolouring its label and icons too, not just the bar',
    /\.code-block-decoration \*/.test(block));
  checkThat('gp-c-border colours tables and rules', only('gp-c-border').includes('--gp-border'));
  checkThat('gp-m-disclaimer hides the footer', only('gp-m-disclaimer').includes('display: none'));
  checkThat('gp-bg-tint seeds surface tokens and paints wrappers',
    only('gp-bg-tint').includes('--gem-sys-color--surface') && only('gp-bg-tint').includes('background-color: var(--gp-bg)'));

  /* Gemini hardcodes a few surfaces, so token seeding alone leaves white
     patches when the background is tinted. Verified against live Gemini. */
  const tint = only('gp-bg-tint');
  checkThat('tint covers the composer and sidebar tab strip',
    tint.includes('input-area-v2') && tint.includes('.app-tabs'));
  checkThat('tint colours the scrollbars — the browser paints those, so a sweep of computed backgrounds cannot find them',
    tint.includes('::-webkit-scrollbar') && tint.includes('::-webkit-scrollbar-thumb'));
  checkThat('tint rebuilds the scroll fades instead of leaving them white',
    tint.includes('.top-gradient') && tint.includes('.bottom-gradient')
    && tint.includes('linear-gradient(var(--gp-surface), transparent)'));
  checkThat('the nav-row fill reset spares the active row for gp-s-active',
    /\.gem-nav-list-item:not\(\[aria-current="page"\]\):not\(\.mdc-list-item--activated\)/.test(tint));
  checkThat('a disabled toggle emits nothing for itself', !only('gp-c-text').includes('var(--gp-link)'));

  // Colour schemes
  const nord = E.buildCSS(cfg({ colorScheme: 'nord', colors: C.COLOR_SCHEMES.nord }));
  checkThat('scheme light value reaches the light token block',
    nord.split('.dark-theme')[0].includes(C.COLOR_SCHEMES.nord.light.accent));
  checkThat('scheme dark value reaches the dark token block',
    nord.split('.dark-theme')[1].includes(C.COLOR_SCHEMES.nord.dark.accent));

  // Custom CSS is last so a user rule of equal weight wins.
  const withCustom = E.buildCSS(cfg({ customCSS: '.mine { color: red !important; }' }));
  checkThat('custom CSS is appended at the very end',
    withCustom.trimEnd().endsWith('.mine { color: red !important; }'));
}

// ================================================================== config

function testConfigMigration() {
  console.log('\nconfig · schema migration');

  const { GeminiPolishConfig: C } = loadShared();

  // Pre-colour-rework configs stored a single accent and a 3-option background.
  const migrated = C.mergeConfig({ accentColor: '#ff0000', bgColor: '#fdf6e3' });
  check('legacy accentColor folds into the light palette', migrated.colors.light.accent, '#ff0000');
  check('legacy accentColor also seeds the link colour', migrated.colors.light.link, '#ff0000');
  check('legacy bgColor folds into the light background', migrated.colors.light.bg, '#fdf6e3');
  checkThat('legacy keys are dropped from the new config',
    !('accentColor' in migrated) && !('bgColor' in migrated));
  check('dark palette falls back to the scheme default',
    migrated.colors.dark.accent, C.COLOR_SCHEMES.native.dark.accent);

  // Toggle ids are append-only; unknown/missing ones must not blow up.
  const partial = C.mergeConfig({ toggles: { colour: { 'gp-c-text': true } } });
  check('unspecified toggles fall back to the preset default',
    C.isOn(partial.toggles, 'gp-r-size'), C.PRESETS.comfort.toggles['gp-r-size']);
  check('specified toggle is honoured', C.isOn(partial.toggles, 'gp-c-text'), true);

  const junk = C.mergeConfig({ colorScheme: 'nope', colors: { light: { accent: 'not-a-colour' } } });
  check('unknown scheme falls back to the pass-through one', junk.colorScheme, 'native');
  check('invalid colour falls back to the scheme value',
    junk.colors.light.accent, C.COLOR_SCHEMES.native.light.accent);
}

// ============================================================== copy button

async function testCopyButton() {
  console.log('\ncontent.js · Copy as Markdown button');

  const { window, mock } = await bootContent();
  /* Gemini's real shape: `message-actions` is a block-level host and the buttons
     sit in a nested flex row. The old fixture was a bare host, which is why a
     misplacement shipped — appending to the host renders the button on its own
     line below Gemini's row. The second bar keeps the bare shape so the
     outward fallback stays covered. */
  window.document.body.innerHTML = `
    <model-response><div class="markdown"><p>Hello <b>there</b></p></div>
      <message-actions>
        <div class="actions-container-v2">
          <div class="buttons-container-v2"><copy-button></copy-button><div class="spacer"></div></div>
        </div>
      </message-actions></model-response>
    <user-query><message-actions></message-actions></user-query>`;
  await sleep(400);          // the observer-driven scan is debounced

  const bars = window.document.querySelectorAll('message-actions');
  const row = bars[0].querySelector('.buttons-container-v2');
  const onResponse = bars[0].querySelector('.gp-copy-md');
  const onQuery = bars[1].querySelector('.gp-copy-md');

  checkThat('a button is injected into the answer\'s action bar', !!onResponse);
  /* The user's own turn has an action bar too, and there is nothing to copy
     there — injecting into it would put a dead control on every question. */
  checkThat('but not into the user\'s own turn', !onQuery);

  checkThat('it joins Gemini\'s flex button row', !!row.querySelector('.gp-copy-md'));
  /* The row ends with a flex spacer; appending would strand the button at the
     far right, visually divorced from Gemini's own cluster. */
  checkThat('and leads the row rather than trailing the flex spacer',
    row.firstElementChild && row.firstElementChild.classList.contains('gp-copy-md'));
  check('and never becomes a block-level child of the host',
    bars[0].querySelectorAll(':scope > .gp-copy-md').length, 0);

  // Re-running the scan must not stack duplicates.
  window.document.body.appendChild(window.document.createElement('div'));
  await sleep(400);
  check('re-scanning does not add a second button',
    bars[0].querySelectorAll('.gp-copy-md').length, 1);

  let copied = null;
  window.navigator.clipboard = { writeText: (t) => { copied = t; return Promise.resolve(); } };
  onResponse.click();
  await sleep(50);
  checkThat('clicking copies the response as Markdown',
    copied && copied.includes('Hello **there**'));
  checkThat('and reports success on the button', onResponse.classList.contains('is-done'));

  /* Angular can replace the inner row while keeping the host element. A dataset
     flag on the host would claim the button is still there after it was wiped,
     so presence of the button is the guard instead. */
  row.innerHTML = '<copy-button></copy-button>';
  window.document.body.appendChild(window.document.createElement('div'));
  await sleep(400);
  check('a re-rendered row gets its button back',
    bars[0].querySelectorAll('.gp-copy-md').length, 1);

  window.close();
}

// ================================================================== mermaid

/* A blanket `"` -> `#quot;` replacement used to run over the whole source. It
   was meant to escape quotes inside labels, but it also replaced the quotes
   that DELIMIT a label, so
       subgraph Local_Workspace ["📦 本地开发环境 (Node.js)"]
   became an unquoted label containing parentheses and the parser stopped on the
   first `(`. Verified against real mermaid: the old rule broke this valid
   diagram AND failed to repair the broken one. */
function testMermaidClean() {
  console.log('\nmermaid · source repair leaves valid diagrams alone');

  const sandbox = vm.createContext({});
  vm.runInContext(read('shared/mermaid-clean.js'), sandbox);
  const { cleanMermaidCode } = sandbox.GeminiPolishMermaidClean;

  const valid = read('tests/fixtures/subgraph-quoted.mmd');
  const out = cleanMermaidCode(valid);
  /* The strongest statement available without running a parser: a diagram that
     is already valid must come back byte-identical. */
  check('an already-valid diagram is returned unchanged', out === valid, true);
  checkThat('no #quot; is introduced into delimiters', !out.includes('#quot;'));
  checkThat('classDef colour values keep their #', out.includes('fill:#f0f8ff'));
  checkThat('an already-quoted edge label is not double-wrapped', !out.includes('|""'));

  const broken = read('tests/fixtures/subgraph-bare.mmd');
  const fixed = cleanMermaidCode(broken);
  checkThat('a bare subgraph title gets an id and quotes',
    /subgraph sg_1 \["Local Workspace \(Node\.js\)"\]/.test(fixed));
  checkThat('an unquoted edge label gets wrapped',
    fixed.includes('|"sends data, then waits"|'));

  // Quotes INSIDE a label we are adding delimiters to still need escaping.
  const inner = cleanMermaidCode('graph TD\n    subgraph He said "hi" (loudly)\n    end\n');
  checkThat('quotes inside a newly-quoted title are escaped',
    inner.includes('#quot;hi#quot;') && /\["He said/.test(inner));

  /* A bare bracket label CAN hold quotes that need escaping — that is the case
     the old blanket rule existed for. It has to be handled without touching
     labels where the quote is the delimiter. */
  checkThat('quotes inside a bare bracket label are escaped',
    cleanMermaidCode('graph TD\n    F[更新状态为"已支付"]\n').includes('F[更新状态为#quot;已支付#quot;]'));
  checkThat('a quote-delimited label is left alone',
    cleanMermaidCode('graph TD\n    A["已支付"]\n').includes('A["已支付"]'));

  /* Every fixture, checked for the exact corruption signature. `[#quot;` can
     only appear if a delimiting quote was replaced — which is what produced
     "Parse error on line 2" on diagrams that were valid to begin with. All of
     these were confirmed to parse with real mermaid after cleaning. */
  const fixtures = fs.readdirSync(path.join(ROOT, 'tests/fixtures')).filter(f => f.endsWith('.mmd'));
  checkThat(`${fixtures.length} diagram fixtures are checked`, fixtures.length >= 7);
  /* The signature is a label that OPENS with the entity: that can only happen
     if the delimiting quote was replaced. A label ending in one is ordinary
     inner escaping (`F[状态为#quot;已支付#quot;]`) and is correct. */
  const corrupted = fixtures.filter(f =>
    /\[\s*#quot;/.test(cleanMermaidCode(read('tests/fixtures/' + f))));
  check('no fixture has its delimiting quotes replaced', corrupted, []);
}

// ================================================================= markdown

/* Gemini's own copy hangs the tab on long answers — confirmed with the
   extension disabled — so we serialise the response ourselves. The fixture
   mirrors the markup Gemini actually renders. */
async function testMarkdown() {
  console.log('\nmarkdown · response serialisation');

  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  window.eval(read('shared/markdown.js'));
  const { fromElement } = window.GeminiPolishMarkdown;

  window.document.body.innerHTML = `
    <model-response><div class="markdown">
      <h2>Ontology <b>defined</b></h2>
      <p>It writes <b>concepts and relations</b> in a form machines read, as a
         <code>schema</code>. See <a href="https://w3.org/spec">the spec</a>.</p>
      <ul>
        <li>Disambiguation: same name, different thing</li>
        <li>Inference
          <ul><li>nested one</li><li>nested two</li></ul>
        </li>
      </ul>
      <ol start="3"><li>third</li><li>fourth</li></ol>
      <blockquote>A shared vocabulary comes first.</blockquote>
      <code-block><div class="code-block">
        <div class="code-block-decoration">YAML<div class="buttons">x</div></div>
        <pre><code>version: "1.0"
global:
  category: tools</code></pre>
      </div></code-block>
      <table><tr><th>Layer</th><th>Role</th></tr>
             <tr><td>Concept</td><td>core class</td></tr></table>
      <hr>
      <p>Escape a * star and an _underscore_ marker.</p>
    </div></model-response>`;

  const md = fromElement(window.document.querySelector('model-response'));
  const has = (t) => md.includes(t);

  checkThat('heading level and inline bold inside it',  has('## Ontology **defined**'));
  checkThat('bold and inline code in a paragraph',      has('**concepts and relations**') && has('`schema`'));
  checkThat('links keep their href',                    has('[the spec](https://w3.org/spec)'));
  checkThat('bullets',                                  has('- Disambiguation: same name, different thing'));
  checkThat('nested list is indented under its parent', /- Inference\n  - nested one\n  - nested two/.test(md));
  checkThat('ordered list honours start=',              has('3. third') && has('4. fourth'));
  checkThat('blockquote is prefixed',                   has('> A shared vocabulary comes first.'));
  checkThat('fenced block carries the language label',  has('```yaml'));
  checkThat('code body is verbatim, not escaped',       has('version: "1.0"') && has('  category: tools'));
  checkThat('table header separator row',               /\| Layer \| Role \|\n\| --- \| --- \|/.test(md));
  checkThat('horizontal rule',                          has('\n---\n'));
  checkThat('markdown syntax in prose is escaped',      has('\\*') && has('\\_'));
  checkThat('the header button label is not swept into the fence', !has('x\nversion'));
  checkThat('no run of three or more blank lines',      !/\n{3,}/.test(md));

  /* An unknown wrapper must cost formatting, never content. */
  window.document.body.innerHTML =
    '<model-response><div class="markdown"><custom-thing><p>kept</p></custom-thing></div></model-response>';
  checkThat('unknown elements degrade to their text',
    fromElement(window.document.querySelector('model-response')).includes('kept'));

  check('an empty response yields an empty string', fromElement(null), '');
  window.close();
}

// ============================================================ store listing

/* The published listing drifted three ways at once — the live page described
   only the Mermaid viewer, this file claimed 16 toggles and four presets that
   no longer exist, and the code had moved past both. Numbers in marketing copy
   rot silently because nothing reads them; these do. */
function testStoreCopy() {
  console.log('\nstore · listing copy matches the build');

  const { GeminiPolishConfig: C } = loadShared();
  const md = read('STORE_DESCRIPTION.md');
  const locales = fs.readdirSync(path.join(ROOT, '_locales'))
    .filter(d => fs.existsSync(path.join(ROOT, '_locales', d, 'messages.json')));

  const summary = (md.match(/```\n(.+)\n```/) || [])[1] || '';
  checkThat('the short summary exists and fits the 132-char store limit',
    summary.length > 0 && summary.length <= 132);

  const claims = [
    [`${C.TOGGLE_KEYS.length} individual switches`, 'toggle count'],
    [`${locales.length} languages`, 'locale count'],
  ];
  check('every counted claim matches the build',
    claims.filter(([text]) => !md.includes(text)).map(([, what]) => what), []);

  // Preset names and their headline numbers are quoted in the copy.
  Object.values(C.PRESETS).forEach(p => {
    if (!p.values) return;
    checkThat(`${p.label}'s numbers are quoted correctly`,
      md.includes(`${p.values.fontSize}px`) && md.includes(`${p.values.lineHeight}`)
      && md.includes(`${p.values.maxWidth}px`));
  });

  // Every scheme should be named, or the listing undersells what shipped.
  const unnamed = Object.values(C.COLOR_SCHEMES)
    .map(s => s.label.replace(/\s*[（(].*$/, '').trim())
    .filter(label => !md.includes(label));
  check('every colour scheme is named in the copy', unnamed, []);

  /* Using someone else's trademark in a listing without this is what gets an
     extension pulled, and it was missing from the live page. */
  checkThat('the listing carries an affiliation disclaimer',
    /not affiliated with[\s\S]{0,80}Google/i.test(md));
}

// ================================================================== contrast

/* An accent that is unreadable as body text is a real defect: the colour rows
   apply it to bold, links and inline code. Schemes we author must clear WCAG
   AA (4.5:1); the three that reproduce a PUBLISHED palette are exempt, because
   bending Solarized's numbers to pass would mean shipping something that is not
   Solarized. That exemption is declared per scheme, not assumed here. */
function testContrast() {
  console.log('\ncolour · accent readability');

  const { GeminiPolishConfig: C } = loadShared();

  const lum = (hex) => {
    const c = hex.replace('#', '').match(/../g).map(h => {
      const v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /* accent/surface matters as much as accent/bg: the sidebar's current-chat
     label is accent on surface, and a brighter accent that clears white can
     still fail there. Missing this pair is how the first Amber draft shipped a
     4.31 combination. */
  const PAIRS = [['text', 'bg'], ['accent', 'bg'], ['link', 'bg'],
                 ['codeText', 'codeBg'], ['accent', 'surface'], ['text', 'surface']];
  const failures = [];
  Object.entries(C.COLOR_SCHEMES).forEach(([name, scheme]) => {
    if (scheme.faithful) return;
    ['light', 'dark'].forEach(mode => {
      PAIRS.forEach(([a, b]) => {
        const r = ratio(scheme[mode][a], scheme[mode][b]);
        if (r < 4.5) failures.push(`${name}.${mode} ${a}/${b}=${r.toFixed(2)}`);
      });
    });
  });
  check('every authored scheme clears 4.5:1 where colour carries text', failures, []);

  checkThat('the published palettes are exempt on purpose, not by omission',
    ['solarized', 'nord', 'gruvbox'].every(n => C.COLOR_SCHEMES[n].faithful));

  /* The point of Amber: the only scheme keeping Gemini's white ground. */
  check('Amber is on white', C.COLOR_SCHEMES.amber.light.bg, '#ffffff');
  checkThat('…and no other tinted scheme is',
    Object.entries(C.COLOR_SCHEMES)
      .filter(([n, s]) => n !== 'amber' && !s.passthrough)
      .every(([, s]) => s.light.bg.toLowerCase() !== '#ffffff'));
}

// ======================================================================= i18n

function testI18n() {
  console.log('\ni18n · locale completeness');

  /* Discovered, not listed: a locale added to _locales but missing from a
     hardcoded array would ship untested. */
  const locales = fs.readdirSync(path.join(ROOT, '_locales'))
    .filter(d => fs.existsSync(path.join(ROOT, '_locales', d, 'messages.json')))
    .sort();
  checkThat(`found ${locales.length} locales`, locales.length >= 2 && locales.includes('en'));
  const msgs = Object.fromEntries(locales.map(l =>
    [l, JSON.parse(read(`_locales/${l}/messages.json`))]));

  /* A key present in one locale and missing from another is invisible until a
     user in that locale opens the panel and sees a blank label. */
  const keys = Object.keys(msgs.en).sort();
  locales.forEach(l => check(`${l} has the same key set as en`,
    Object.keys(msgs[l]).sort(), keys));
  locales.forEach(l => check(`${l} has no empty message`,
    Object.entries(msgs[l]).filter(([, v]) => !v.message).map(([k]) => k), []));

  /* The manifest description becomes the store's short description, which the
     Chrome Web Store caps at 132 characters — per locale. German and French
     shipped over the cap once; nothing in the extension surfaces that, the
     store just rejects those locales at submission. */
  const SHORT_DESC_CAP = 132;
  check('no locale exceeds the store short-description cap',
    locales.filter(l => msgs[l].extDesc.message.length > SHORT_DESC_CAP)
      .map(l => `${l}:${msgs[l].extDesc.message.length}`), []);

  /* Substitutions must line up, or a locale silently drops the error detail. */
  locales.forEach(l => check(`${l} keeps every $1 placeholder en declares`,
    keys.filter(k => msgs.en[k].message.includes('$1') && !msgs[l][k].message.includes('$1')), []));

  // Every key the source asks for must exist.
  const src = ['shared/config.js', 'popup/popup.js', 'content.js'].map(read).join('\n');
  const used = [...src.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+)'/g)].map(m => m[1]);
  checkThat('the source actually asks for messages', used.length > 20);
  check('every key used in source exists in en',
    [...new Set(used)].filter(k => !msgs.en[k]), []);

  // …and the static markup's data-i18n keys too.
  const html = read('popup/popup.html');
  const attrs = [...html.matchAll(/data-i18n(?:-placeholder)?="([a-zA-Z0-9_]+)"/g)].map(m => m[1]);
  check('every data-i18n key exists in en', attrs.filter(k => !msgs.en[k]), []);

  // manifest __MSG_*__ references
  const mf = JSON.parse(read('manifest.json'));
  const refs = [mf.name, mf.description].map(v => (v.match(/^__MSG_(.+)__$/) || [])[1]).filter(Boolean);
  check('manifest localises name and description', refs.length, 2);
  check('manifest message keys exist', refs.filter(k => !msgs.en[k]), []);
  checkThat('manifest declares a default_locale', locales.includes(mf.default_locale));

  /* Nothing user-facing may be left hardcoded in the panel's markup. Comments
     are documentation and may name the UI in any language. */
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  check('no CJK literal left in popup.html', (visible.match(/[\u4e00-\u9fff]/g) || []), []);
}

// ================================================== schema shape / migrations

function testSchema() {
  console.log('\nconfig · nested axes and versioned migration');

  const { GeminiPolishConfig: C } = loadShared();

  check('axes partition the toggle set exactly',
    [...C.STRUCTURE_KEYS, ...C.COLOUR_KEYS].sort(), [...C.TOGGLE_KEYS].sort());
  check('no key appears in both axes',
    C.STRUCTURE_KEYS.filter(k => C.COLOUR_KEYS.includes(k)), []);

  /* The nesting is the point: a preset writes one bucket, so reaching the other
     is not a mistake you can make. Three shipped bugs came from the flat shape
     letting a write cross axes. */
  check('a preset carries only structure keys',
    Object.entries(C.PRESETS)
      .flatMap(([n, p]) => Object.keys(p.toggles).filter(k => !C.STRUCTURE_KEYS.includes(k))
        .map(k => `${n}:${k}`)), []);

  // A pre-split config, exactly as it sat in storage.
  const V0 = {
    preset: 'reading',
    accentColor: '#ff0000',
    bgColor: '#fdf6e3',
    colorScheme: 'default',
    fontSize: 19,
    toggles: { 'gp-r-size': true, 'gp-r-leading': true, 'gp-a-bold': true, 'gp-bg-tint': true },
  };
  const up = C.mergeConfig(V0);

  check('stamped with the current schema version', up.schemaVersion, C.SCHEMA_VERSION);
  check('toggles are nested', Object.keys(up.toggles).sort(), ['colour', 'structure']);
  /* Migration may translate shape and labels, never what the user sees. */
  check('every stored toggle keeps its state through the migration',
    Object.keys(V0.toggles).filter(k => C.isOn(up.toggles, k) !== V0.toggles[k]), []);
  check('each toggle landed in its own axis',
    [C.isOn({ structure: up.toggles.structure }, 'gp-r-size'),
     C.isOn({ colour: up.toggles.colour }, 'gp-bg-tint')], [true, true]);
  check('the legacy accent folded into the palette', up.colors.light.accent, '#ff0000');
  check("the removed 'default' scheme became the pass-through one", up.colorScheme, 'native');
  check('unrelated values are untouched', up.fontSize, 19);
  check('legacy keys are gone', [('accentColor' in up), ('bgColor' in up)], [false, false]);

  /* Migrations run from the stored version, so a config that has already been
     through them must come out identical rather than being migrated twice. */
  check('migration is idempotent', JSON.stringify(C.mergeConfig(up)), JSON.stringify(up));
}

// ============================================== presets / pass-through split

function testPresetSplit() {
  console.log('\nconfig · presets carry no colour, "原生" overrides nothing');

  const { GeminiPolishConfig: C, GeminiPolishCSS: E } = loadShared();

  /* The whole point of the split: a preset decides how much STRUCTURE to
     replace. Any colour bit in here would duplicate the scheme dropdown. */
  const leaked = Object.entries(C.PRESETS)
    .flatMap(([n, p]) => C.COLOUR_KEYS.filter(k => p.toggles[k]).map(k => `${n}:${k}`));
  check('no preset switches on a colour toggle', leaked, []);

  const ALL_ON = allOn(C);
  const pass = E.buildCSS(C.mergeConfig({ colorScheme: 'native', toggles: ALL_ON }));

  checkThat('"原生" emits no palette entry but the accent',
    !/--gp-(text|bg|surface|link|codeText|codeBg|border):/.test(pass));
  checkThat('"原生" takes its accent from Gemini\'s own token',
    pass.includes('--gp-accent: var(--gem-sys-color--primary'));
  checkThat('"原生" emits no dark palette block (Gemini already switches)',
    !pass.includes('.dark-theme {'));

  /* A rule referencing a token that is never emitted resolves to an invalid
     var() and silently blanks the property — worse than not emitting it. */
  checkThat('no rule references a starved token',
    !/var\(--gp-(text|bg|surface|link|codeText|codeBg|border)\)/.test(pass));
  checkThat('colour-replacement rules are skipped, not emitted broken',
    !pass.includes('--gem-sys-color--surface') && !pass.includes('.top-gradient'));
  checkThat('accent-only rules survive — they resolve against Gemini\'s primary',
    pass.includes('var(--gp-accent)'));

  const nord = E.buildCSS(C.mergeConfig({ colorScheme: 'nord', colors: C.COLOR_SCHEMES.nord, toggles: ALL_ON }));
  checkThat('a real scheme still emits the full palette and dark block',
    nord.includes('--gp-text:') && nord.includes('.dark-theme {'));
}

function testLegacyMigration() {
  console.log('\nconfig · migrating a pre-split config');

  const { GeminiPolishConfig: C } = loadShared();
  const m = (o) => C.mergeConfig(o);

  check("the removed 'default' scheme becomes the pass-through one",
    m({ colorScheme: 'default' }).colorScheme, 'native');

  /* Migration translates LABELS only. Rewriting toggles would change what the
     user sees on upgrade, which is never acceptable for a cosmetic rename. */
  const READING = {   // the shipped pre-split preset, in full
    'gp-r-font': false, 'gp-r-size': true, 'gp-r-leading': true, 'gp-r-para': true,
    'gp-r-width': true, 'gp-r-align': false, 'gp-r-headings': true,
    'gp-s-custom': false, 'gp-s-active': false,
    'gp-a-system': true, 'gp-a-bold': true, 'gp-a-code': true, 'gp-a-quote': true,
    'gp-a-bubble': false, 'gp-bg-tint': false,
    'gp-c-text': false, 'gp-c-link': true, 'gp-c-codeblock': false, 'gp-c-border': false,
    'gp-m-disclaimer': false, 'gp-m-fade': false,
  };
  const got = m({ preset: 'reading', toggles: READING });
  check('stored toggles survive migration untouched',
    C.TOGGLE_KEYS.filter(k => C.isOn(got.toggles, k) !== !!READING[k]), []);

  /* Old `reading` was "typography + some colour". Its STRUCTURE is exactly
     舒适阅读, and the colour it also carried is now the scheme's business — so
     the name maps across and the colours ride along rather than being demoted. */
  check('reading keeps a real preset name because its structure matches',
    got.preset, 'comfort');
  checkThat('and the colours it carried are still on',
    C.isOn(got.toggles, 'gp-a-bold') && C.isOn(got.toggles, 'gp-c-link'));

  check('classic maps to 原生 when its toggles still match',
    m({ preset: 'classic', toggles: C.PRESETS.native.toggles }).preset, 'native');
  check('minimal maps to 沉浸 when its toggles still match',
    m({ preset: 'minimal', toggles: C.PRESETS.focus.toggles }).preset, 'focus');
  check('power has no equivalent, so it becomes custom',
    m({ preset: 'power', toggles: { 'gp-r-align': true } }).preset, 'custom');
}

// ================================================================== ui spec

function testUiSpec() {
  console.log('\nconfig · UI spec covers the schema');

  const { GeminiPolishConfig: C } = loadShared();
  const rows = C.UI_SECTIONS.flatMap(s => s.rows);
  const covered = new Set(rows.flatMap(r => C.togglesOf(r)));

  /* A toggle absent from UI_SECTIONS is unreachable in the popup — the setting
     still applies from stored config but nobody can turn it off. */
  /* A preset that moves toggles but not values is silent for anyone whose
     stored numbers already equal Gemini's own — the "风格没有改变" report. */
  const typoPresets = Object.keys(C.PRESETS).filter(n => C.PRESETS[n].toggles['gp-r-size']);
  check('every preset that switches typography on also carries values',
    typoPresets.filter(n => !C.PRESETS[n].values), []);
  check('the pass-through preset imposes no values', C.PRESETS.native.values, null);
  checkThat('preset values differ from what Gemini already does (16 / 1.4 / 0)',
    typoPresets.every(n => {
      const v = C.PRESETS[n].values;
      return v.fontSize !== 16 && v.lineHeight !== 1.4 && v.paragraphSpacing !== 0;
    }));

  /* Two presets shipping the same numbers differ only by whatever toggles they
     happen not to share, which reads as "the presets all feel the same". */
  const valueSets = Object.values(C.PRESETS).map(p => p.values).filter(Boolean).map(v => JSON.stringify(v));
  check('no two presets ship identical values', valueSets.length, new Set(valueSets).size);
  checkThat('沉浸 reads as a distinct mode: narrower, larger, airier than 舒适阅读',
    C.PRESETS.focus.values.maxWidth < C.PRESETS.comfort.values.maxWidth
    && C.PRESETS.focus.values.fontSize > C.PRESETS.comfort.values.fontSize
    && C.PRESETS.focus.values.lineHeight > C.PRESETS.comfort.values.lineHeight);

  /* The two controls are orthogonal in BOTH directions. A preset owning colour
     bits would switch the user's scheme off when selected; a preset identity
     judged on colour bits would demote "舒适阅读 + Nord" to Custom on load. */
  check('structure and colour keys partition the toggle set',
    [...C.STRUCTURE_KEYS, ...C.COLOUR_KEYS].sort(), [...C.TOGGLE_KEYS].sort());
  checkThat('a preset still matches itself once a scheme switches colours on',
    C.matchesPreset({ structure: { ...C.PRESETS.comfort.toggles },
      colour: Object.fromEntries(C.COLOUR_KEYS.map(k => [k, true])) }, 'comfort'));
  check('a config carrying a scheme keeps its preset name through a load',
    C.mergeConfig({
      preset: 'comfort',
      toggles: { structure: { ...C.PRESETS.comfort.toggles },
        colour: Object.fromEntries(C.COLOUR_KEYS.map(k => [k, true])) },
    }).preset, 'comfort');

  /* Sidebar density carries a user-set value that can be extreme (22px becomes
     44px of padding per row), so no preset may switch it on as a side effect. */
  /* Colour bits belong to the scheme dropdown. Any bit that neither a preset
     nor a scheme switches on is unreachable except by hand — that is how
     "选了配色，粗体还是黑的" happened. */
  const reachable = new Set([
    ...C.SCHEME_ACTIVATES,
    ...Object.values(C.PRESETS).flatMap(p => C.TOGGLE_KEYS.filter(k => p.toggles[k])),
  ]);
  check('every colour toggle is switched on by picking a scheme',
    C.COLOUR_KEYS.filter(k => !reachable.has(k)), []);

  check('no preset switches on sidebar density',
    Object.entries(C.PRESETS).filter(([, p]) => p.toggles['gp-s-custom']).map(([n]) => n), []);

  check('every toggle key is reachable from some UI row',
    C.TOGGLE_KEYS.filter(k => !covered.has(k)), []);
  check('no UI row references a toggle that does not exist',
    [...covered].filter(k => !C.TOGGLE_KEYS.includes(k)), []);

  check('every slider row names a known slider spec',
    rows.filter(r => r.type === 'slider' && !C.SLIDERS[r.pref]).map(r => r.pref), []);
  check('every colour row names known palette entries',
    rows.filter(r => r.type === 'color').flatMap(r => r.swatches).filter(k => !C.PALETTE_KEYS.includes(k)), []);
  check('default-view sliders all exist in the spec',
    C.DEFAULT_VIEW.sliders.filter(p => !C.SLIDERS[p]), []);

  // The point of the regrouping: fewer rows than raw toggles.
  checkThat(`colour rows (${rows.filter(r => r.type === 'color').length}) are fewer than the colour toggles they drive`,
    rows.filter(r => r.type === 'color').length
      < rows.filter(r => r.type === 'color').flatMap(r => C.togglesOf(r)).length);
}

// =================================================================== popup

async function bootPopup(seed = {}, opts = {}) {
  const dom = new JSDOM(read('popup/popup.html'), { runScripts: 'outside-only', url: 'https://localhost/' });
  const { window } = dom;
  const { chrome, stats } = makeChromeMock(seed, opts);
  window.chrome = chrome;
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.TextEncoder = TextEncoder;
  // jsdom is still parsing here, so popup.js's DOMContentLoaded listener catches
  // the natural event. Do NOT dispatch one by hand as well — that runs the whole
  // popup twice and doubles every timer and storage write.
  window.eval(read('shared/config.js'));
  window.eval(read('shared/css-engine.js'));
  window.eval(read('popup/popup.js'));
  await new Promise(r => window.document.addEventListener('DOMContentLoaded', r, { once: true }));
  await sleep(60);
  return { window, chrome, stats };
}

/* The sun/moon tabs are gone: which palette the swatches edit follows the live
   Gemini theme. Both palettes ship to the page regardless — this only decides
   what the popup shows you. */
async function testPaletteFollowsTheme() {
  console.log('\npopup.js · palette follows the live Gemini theme');

  const { GeminiPolishConfig: C } = loadShared();
  const stored = {
    colorScheme: 'nord',
    colors: { light: { ...C.COLOR_SCHEMES.nord.light }, dark: { ...C.COLOR_SCHEMES.nord.dark } },
    updatedAt: 1,
  };

  const light = await bootPopup({ local: stored });
  check('a light page shows the light palette',
    light.window.document.querySelector('input[data-color="accent"]').value,
    C.COLOR_SCHEMES.nord.light.accent);
  checkThat('the popup says which palette it is editing',
    light.window.document.getElementById('paletteMode').textContent
      .includes(C.t('palette_light', 'Light palette')));
  checkThat('no theme control is offered any more',
    light.window.document.querySelectorAll('.mode-tab').length === 0);
  light.window.close();

  const dark = await bootPopup({ local: stored }, { darkPage: true });
  const accent = dark.window.document.querySelector('input[data-color="accent"]');
  check('a dark page shows the dark palette', accent.value, C.COLOR_SCHEMES.nord.dark.accent);
  checkThat('and says so', dark.window.document.getElementById('paletteMode').textContent
    .includes(C.t('palette_dark', 'Dark palette')));

  accent.value = '#123456';
  accent.dispatchEvent(new dark.window.Event('input'));
  await sleep(1700);
  const saved = dark.chrome.storage.local._store;
  check('an edit lands in the palette that is live', saved.colors.dark.accent, '#123456');
  check('the other palette is untouched', saved.colors.light.accent, C.COLOR_SCHEMES.nord.light.accent);
  dark.window.close();
}

async function testPopup() {
  console.log('\npopup.js · write batching + live preview');

  const { window, chrome, stats } = await bootPopup();

  const before = { local: stats.localWrites, sync: stats.syncWrites };
  const { GeminiPolishConfig: C, GeminiPolishCSS: E } = loadShared();
  const all = (sel) => Array.from(window.document.querySelectorAll(sel));
  const fire = (el, type) => el.dispatchEvent(new window.Event(type));

  // Controls are generated now, so address them by their data hooks.
  const sizeSliders = all('input[data-pref="fontSize"]');
  checkThat('font size appears in both the default view and Advanced', sizeSliders.length === 2);

  // Simulate a 30-step drag — the old code wrote sync once per step.
  for (let v = 10; v < 40; v++) { sizeSliders[0].value = String(v % 30 + 10); fire(sizeSliders[0], 'input'); }

  await sleep(60);
  check('no storage write while the drag is still in flight',
    { local: stats.localWrites - before.local, sync: stats.syncWrites - before.sync },
    { local: 0, sync: 0 });
  checkThat('page already received a live preview mid-drag', stats.messages.length > 0);

  await sleep(200);
  check('one local write after the drag settles', stats.localWrites - before.local, 1);
  check('sync still untouched at this point', stats.syncWrites - before.sync, 0);

  await sleep(1600);
  check('exactly one sync write for the whole 30-step drag', stats.syncWrites - before.sync, 1);
  checkThat('live pushes were coalesced, not one per input event', stats.messages.length < 30);
  check('the settled value is what got persisted',
    chrome.storage.sync._store.fontSize, Number(sizeSliders[0].value));
  check('the duplicate control mirrors it', sizeSliders[1].value, sizeSliders[0].value);
  check('local and sync agree on the edit ordering stamp',
    chrome.storage.local._store.updatedAt, chrome.storage.sync._store.updatedAt);
  check('adjusting a slider keeps the active preset', chrome.storage.local._store.preset, 'comfort');

  // Picking a scheme means "reskin": both palettes replaced AND the toggles
  // that carry a scheme's identity switched on.
  const schemeSel = window.document.getElementById('colorScheme');
  schemeSel.value = 'gruvbox';
  fire(schemeSel, 'change');
  await sleep(1700);
  const saved = chrome.storage.local._store;
  check('scheme replaces the light palette', saved.colors.light.accent, C.COLOR_SCHEMES.gruvbox.light.accent);
  check('scheme replaces the dark palette too', saved.colors.dark.accent, C.COLOR_SCHEMES.gruvbox.dark.accent);
  check('scheme switches on every colour toggle, bold included',
    C.COLOUR_KEYS.filter(k => !C.isOn(saved.toggles, k)), []);
  check('and the emitted CSS actually accents bold text',
    E.buildCSS(C.mergeConfig(saved)).includes('color: var(--gp-accent)'), true);

  // This popup booted against a light page, so swatches edit the light palette.
  const accent = all('input[data-color="accent"]')[0];
  check('swatches show the scheme just picked', accent.value, C.COLOR_SCHEMES.gruvbox.light.accent);
  accent.value = '#123456';
  fire(accent, 'input');
  await sleep(1700);
  check('swatch edit lands in the live palette',
    chrome.storage.local._store.colors.light.accent, '#123456');
  check('the other palette is untouched',
    chrome.storage.local._store.colors.dark.accent, C.COLOR_SCHEMES.gruvbox.dark.accent);
  check('hand-picking a colour drops the named scheme', chrome.storage.local._store.colorScheme, 'custom');

  /* One switch, several toggle keys — the regrouping's core mechanic. */
  const emphasis = all('input[data-toggle="gp-a-bold gp-a-quote"]')[0];
  checkThat('the merged Emphasis row exists', !!emphasis);
  emphasis.checked = false;
  fire(emphasis, 'change');
  await sleep(1700);
  check('one switch drives every key it owns',
    ['gp-a-bold', 'gp-a-quote'].map(k => C.isOn(chrome.storage.local._store.toggles, k)),
    [false, false]);
  check('flipping a toggle moves the preset to custom', chrome.storage.local._store.preset, 'custom');

  // A preset must restore the whole toggle set in one go.
  const presetSel = window.document.getElementById('preset');
  presetSel.value = 'comfort';
  fire(presetSel, 'change');
  await sleep(1700);
  check('a preset applies its values, not just its toggles',
    [chrome.storage.local._store.fontSize, chrome.storage.local._store.lineHeight],
    [C.PRESETS.comfort.values.fontSize, C.PRESETS.comfort.values.lineHeight]);
  check('and the default-view slider shows the new value',
    Number(all('input[data-pref="fontSize"]')[0].value), C.PRESETS.comfort.values.fontSize);

  /* Switching 风格 must leave 配色 alone — assigning the whole toggle object
     here is what lost the user's colours. */
  const beforeColour = C.COLOUR_KEYS.map(k => C.isOn(chrome.storage.local._store.toggles, k));
  checkThat('colours are on before switching preset', beforeColour.some(Boolean));
  presetSel.value = 'focus';
  fire(presetSel, 'change');
  await sleep(1700);
  check('switching preset preserves every colour toggle',
    C.COLOUR_KEYS.map(k => C.isOn(chrome.storage.local._store.toggles, k)), beforeColour);
  check('and the scheme itself is untouched',
    chrome.storage.local._store.colorScheme, 'custom');
  check('choosing a preset restores its toggles',
    C.isOn(chrome.storage.local._store.toggles, 'gp-m-fade'), C.PRESETS.focus.toggles['gp-m-fade']);
  check('preset name is recorded', chrome.storage.local._store.preset, 'focus');

  window.close();
}

// ================================================================= content

/** Whichever mechanism the content script used, hand back the applied CSS. */
function appliedCSS(window) {
  const adopted = window.document.adoptedStyleSheets || [];
  if (adopted.length) {
    return Array.from(adopted[adopted.length - 1].cssRules).map(r => r.cssText).join('\n');
  }
  const styleEl = window.document.getElementById('gemini-polish-generated');
  return styleEl ? styleEl.textContent : '';
}

async function bootContent(seed = {}) {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://gemini.google.com/app' });
  const { window } = dom;
  const mock = makeChromeMock(seed);
  window.chrome = mock.chrome;
  window.mermaid = { initialize() {}, render: async () => ({ svg: '<svg></svg>' }) };
  window.eval(read('shared/config.js'));
  window.eval(read('shared/css-engine.js'));
  window.eval(read('shared/markdown.js'));
  window.eval(read('shared/mermaid-clean.js'));
  window.eval(read('content.js'));
  await sleep(60);
  return { window, mock };
}

/* A tab open across an extension update gets content.js twice — once from the
   manifest, once from background.js's retrofit — and every duplicate brings its
   own scan interval, observers, listeners and stylesheet. */
async function testDoubleInjection() {
  console.log('\ncontent.js · a second injection is a no-op');

  const { window, mock } = await bootContent();
  const listenersAfterFirst = mock.chrome.runtime.onMessage._listeners.length;
  const sheetsAfterFirst = (window.document.querySelectorAll('style').length
    + (window.document.adoptedStyleSheets || []).length);

  window.eval(read('content.js'));          // the retrofit injection
  await sleep(60);

  check('the second copy registers no extra message listener',
    mock.chrome.runtime.onMessage._listeners.length, listenersAfterFirst);
  check('and adds no second stylesheet',
    window.document.querySelectorAll('style').length
      + (window.document.adoptedStyleSheets || []).length, sheetsAfterFirst);
  checkThat('the guard flag is set', window.__geminiPolishLoaded === true);

  window.close();
}

/* The scan loop used to poll every second forever and read `innerText` on every
   code block each time — innerText is layout-dependent, so that forced a reflow
   per block per second, in background tabs and idle conversations included. */
function testManifestWiring() {
  console.log('\nmanifest · every shared module is registered everywhere');

  const mf = JSON.parse(read('manifest.json'));
  const js = mf.content_scripts[0].js;
  const shared = fs.readdirSync(path.join(ROOT, 'shared')).filter(f => f.endsWith('.js'));

  check('every shared module is a content script',
    shared.filter(f => !js.includes('shared/' + f)), []);
  check('every content script file exists',
    [...js, ...mf.content_scripts[0].css].filter(f => !fs.existsSync(path.join(ROOT, f))), []);

  /* background.js re-injects the same set into tabs open across an update; a
     module missing there means those tabs get a half-loaded extension. */
  const bg = read('background.js');
  check('background retrofit injects the same modules',
    js.filter(f => f.startsWith('shared/') && !bg.includes(f)), []);

  // Order matters: content.js destructures these at module scope.
  check('shared modules load before content.js',
    js.filter(f => f.startsWith('shared/')).every(f => js.indexOf(f) < js.indexOf('content.js')), true);
}

function testScanLoop() {
  console.log('\ncontent.js · diagram scanning does not poll or force layout');

  const src = read('content.js');
  check('no polling timer remains', (src.match(/setInterval/g) || []), []);
  checkThat('scanning is driven by a MutationObserver',
    /new MutationObserver\(queueScan\)/.test(src));
  checkThat('and debounced, since streaming mutates on nearly every frame',
    /clearTimeout\(scanTimer\)/.test(src));

  /* innerText forces a synchronous reflow; textContent does not. The keyword
     sniff and the re-render both only need the characters. */
  // Strip comments first — prose about innerText is not a use of it.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('innerText is not read in any hot path',
    code.split('\n').filter(l => l.includes('innerText')), []);

  checkThat('a block judged non-mermaid is marked so it is not re-sniffed',
    /mermaidProcessed = 'no'/.test(src));
  checkThat('but an empty (still streaming) block is left unmarked',
    /if \(!trimmed\) return;/.test(src));
  checkThat('per-diagram re-render is debounced too',
    /clearTimeout\(renderTimer\)/.test(src));

  /* Window listeners attached per diagram are never released, so N diagrams
     ran N mousemove handlers on every mouse move — a per-frame cost that grew
     with the conversation. They belong at module scope, registered once. */
  const fnStart = code.indexOf('async function processCodeBlock');
  const fnEnd = code.indexOf('\n  }', code.indexOf('new MutationObserver', fnStart));
  const body = code.slice(fnStart, fnEnd);
  check('no window listener is attached per diagram',
    body.split('\n').filter(l => /window\.addEventListener/.test(l)), []);
  checkThat('the shared drag/escape handlers exist instead',
    /let activeDrag = null/.test(code) && /let exitFullscreen = null/.test(code));

  // A library that never loads must not leave a 10-per-second retry running.
  checkThat('the mermaid load retry is bounded', /tries < 50/.test(code));
}

async function testContent() {
  console.log('\ncontent.js · stylesheet application');

  const { window, mock } = await bootContent();
  checkThat('content script registered a live-preview listener',
    mock.chrome.runtime.onMessage._listeners.length === 1);
  checkThat('a stylesheet was applied on load', appliedCSS(window).length > 0);

  let responded = null;
  // Pushes a real scheme: gp-c-text is deliberately inert under the
  // pass-through one, so it would prove nothing about the channel there.
  const { GeminiPolishConfig: CC } = loadShared();
  mock.chrome.runtime.onMessage._listeners[0](
    { type: 'polish:apply', config: { fontSize: 22, colorScheme: 'nord', colors: CC.COLOR_SCHEMES.nord,
      toggles: { 'gp-c-text': true, 'gp-r-size': true } } },
    {}, (r) => { responded = r; }
  );

  const css = appliedCSS(window);
  check('listener acknowledged the push', responded, { ok: true });
  checkThat('pushed font size reached the stylesheet', css.includes('--gp-size: 22px'));
  checkThat('pushed toggle emitted its rule', css.includes('var(--gp-text)'));
  checkThat('no gp-* classes are put on body any more', window.document.body.className === '');

  window.close();
}

// ------------------------------------------------ cross-device merge (load)

/* `local` is written on every edit; `sync` only on a long debounce and may fail
   outright. Neither can be trusted as "the" copy, so both carry `updatedAt` and
   the newer one wins. Get this wrong and either a same-device edit gets reverted
   by a stale mirror, or an edit from another device never lands. */
async function testStorageMerge() {
  console.log('\ncontent.js · newest-updatedAt wins across local/sync');

  const sizeOf = async (seed) => {
    const { window } = await bootContent(seed);
    const m = appliedCSS(window).match(/--gp-size:\s*(\d+)px/);
    window.close();
    return m ? Number(m[1]) : null;
  };

  check('local newer than sync → local wins',
    await sizeOf({ local: { fontSize: 21, updatedAt: 2000 }, sync: { fontSize: 13, updatedAt: 1000 } }), 21);
  check('sync newer than local → the other device wins',
    await sizeOf({ local: { fontSize: 21, updatedAt: 1000 }, sync: { fontSize: 13, updatedAt: 2000 } }), 13);
  check('upgrade from a sync-only build → sync config is adopted, not defaults',
    await sizeOf({ sync: { fontSize: 24, updatedAt: 500 } }), 24);
  check('empty storage → shipped defaults', await sizeOf({}), 17);
}

(async () => {
  testEngine();
  testConfigMigration();
  testMermaidClean();
  await testMarkdown();
  await testCopyButton();
  testStoreCopy();
  testContrast();
  testI18n();
  testSchema();
  testPresetSplit();
  testLegacyMigration();
  testUiSpec();
  await testPopup();
  await testPaletteFollowsTheme();
  testManifestWiring();
  testScanLoop();
  await testDoubleInjection();
  await testContent();
  await testStorageMerge();
  console.log(failures === 0 ? '\nAll checks passed ✓' : `\n${failures} check(s) failed ✗`);
  process.exit(failures === 0 ? 0 : 1);
})();
