/**
 * Gemini Polish · Anchor liveness check
 *
 * Paste into the DevTools console on an open gemini.google.com tab before each
 * release, or after Google ships a UI rollout.
 *
 * IMPORTANT — run it on a *desktop-width window with a conversation open*.
 * Below ~700px Gemini serves a mobile layout with no chat-history list, and on
 * an empty /app page none of the content anchors exist. Both look identical to
 * "Gemini renamed everything" if you do not control for them.
 *
 * Last verified against live Gemini: 2026-09-04.
 */

(() => {
  // Confirmed present on 2026-09-04 with a conversation open at 1600px.
  const LIVE = {
    content: ['.markdown', '.markdown p', 'message-content', '.response-content',
              'model-response', 'user-query', 'user-query-content', '.query-text-line',
              '.user-query-bubble-with-background'],
    shell: ['[data-test-id*="sidenav"]', 'bard-sidenav-container', 'bard-sidenav-content',
            '.mdc-list-item', '.mat-mdc-list-item', '[aria-current="page"]',
            '.mdc-list-item--activated', 'hallucination-disclaimer', 'message-actions',
            'chat-window', '.chat-history', 'infinite-scroller', '.response-container-footer'],
  };

  /* Present in the DOM but absent from the conversation used for verification,
     so a 0 here is inconclusive — retest on a response that actually contains
     headings, links, quotes, tables and a fenced code block. */
  const CONTENT_DEPENDENT = ['.markdown h1', '.markdown h2', '.markdown a', '.markdown blockquote',
                             '.markdown table', '.markdown pre', 'code-block', '.code-block',
                             '.code-block-decoration', '.formatted-code-block-internal-container',
                             '[data-test-id="code-content"]', 'pre code'];

  // Confirmed GONE on 2026-09-04. If one comes back alive, Gemini reverted
  // something and the note in shared/css-engine.js should be revisited.
  const RETIRED = ['.user-message-text', 'user-query .text', 'mat-sidenav', 'mat-list-item',
                   '[aria-selected="true"]', '.conversation-item', 'conversation-container',
                   '[data-test-id="message-actions"]', '.message-content'];

  const count = (s) => { try { return document.querySelectorAll(s).length; } catch (e) { return -1; } };
  const mobile = document.body.classList.contains('enable-lm-mobile-tokens')
              || !!document.querySelector('.is-mobile');
  const hasConvo = count('.markdown') > 0;

  console.group('%cGemini Polish · Anchor Check', 'font-weight:600;color:#1a73e8');
  if (mobile)     console.warn('Mobile layout detected — sidebar anchors will under-report.');
  if (!hasConvo)  console.warn('No conversation open — every content anchor will read 0.');

  const dead = [];
  for (const [group, list] of Object.entries(LIVE)) {
    console.table(list.map(s => {
      const n = count(s);
      if (n === 0) dead.push(`${group}: ${s}`);
      return { anchor: s, count: n };
    }));
  }

  console.log('%cContent-dependent (0 is inconclusive):', 'color:#80868b');
  console.table(CONTENT_DEPENDENT.map(s => ({ anchor: s, count: count(s) })));

  const revived = RETIRED.filter(s => count(s) > 0);
  if (revived.length) console.warn('Retired anchors are alive again:', revived);

  if (dead.length === 0) console.log('%cAll known-live anchors still alive ✓', 'color:#188038;font-weight:600');
  else console.error(`${dead.length} anchor(s) died — update shared/css-engine.js:`, dead);

  /* Background-tint leak sweep.
     Token seeding only recolours components that actually read the token, so
     anywhere Gemini writes a literal colour stays white while the rest of the
     app is tinted. Rather than wait for someone to notice a white patch, list
     every sizeable element still painting opaque near-white (or fading to it).
     Run with gp-bg-tint ON and a strongly tinted scheme such as Sepia.
     Known and already handled: .app-tabs, input-area-v2, .top-gradient,
     .bottom-gradient, .gem-nav-list-item. Anything else is a new leak. */
  const nearWhite = (rgb) => {
    const m = String(rgb).match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    const a = m[3] === undefined ? 1 : Number(m[3]);
    return a > 0.5 && r > 235 && g > 235 && b > 235;
  };
  /* A tint leak is not always WHITE: Gemini's code-block header ships a
     near-black fill, which stayed a black bar over a light-tinted block. Sweep
     both ends of the range. */
  const nearBlack = (rgb) => {
    const m = String(rgb).match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    const a = m[3] === undefined ? 1 : Number(m[3]);
    return a > 0.5 && r < 70 && g < 70 && b < 70;
  };

  const HANDLED = /app-tabs|input-area-v2|top-gradient|bottom-gradient|gem-nav-list-item|gradient-strip|code-block-decoration/;
  const leaks = new Set();
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 6) return;
    const cs = getComputedStyle(el);
    const solid = nearWhite(cs.backgroundColor) || nearBlack(cs.backgroundColor);
    const fade = cs.backgroundImage.includes('gradient') && /255,\s*255,\s*255|#fff/i.test(cs.backgroundImage);
    if (!solid && !fade) return;
    const cls = (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/).filter(c => c && !/^ng-|^lr26|^mat-|^cdk-/.test(c)).slice(0, 3).join('.');
    const name = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    if (!HANDLED.test(name)) leaks.add(name + (fade ? ' [gradient]' : ' [solid]'));
  });
  if (leaks.size) {
    console.warn('Background-tint leaks not yet handled by gp-bg-tint:', [...leaks]);
    console.warn('(Ignore unless gp-bg-tint is on with a tinted scheme.)');
  } else {
    console.log('%cNo new background-tint leaks ✓', 'color:#188038');
  }

  console.groupEnd();
  return { dead, revived, leaks: [...leaks], mobile, hasConvo };
})();
