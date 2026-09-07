/**
 * Gemini Polish · DOM → Markdown
 *
 * Gemini's own "Copy response" hangs the tab on long answers (confirmed with
 * the extension disabled, so it is their conversion, not ours). This is an
 * independent serialiser over the rendered response DOM: a single depth-first
 * walk, no regex passes over accumulated strings, no reflow-forcing reads.
 *
 * It handles the element vocabulary Gemini actually emits. Anything unknown
 * degrades to its text rather than being dropped, so an unrecognised wrapper
 * costs formatting, never content.
 */
(function (root) {
  'use strict';

  /* Inline is the CLOSED set; everything else is a container to recurse into.
     The reverse (listing known block tags) flattened Gemini's custom elements —
     `code-block` is not a div, so a whole fenced block came out as inline code
     with the header's language label and button text glued to the front. */
  const INLINE_TAGS = new Set([
    'A', 'B', 'STRONG', 'I', 'EM', 'CODE', 'SPAN', 'SMALL', 'SUP', 'SUB',
    'MARK', 'U', 'S', 'DEL', 'INS', 'IMG', 'BR', 'KBD', 'ABBR', 'CITE',
    'Q', 'TIME', 'VAR', 'SAMP', 'FONT', 'LABEL',
  ]);

  const BLOCK_SELECTOR =
    'p,div,pre,ul,ol,li,table,blockquote,h1,h2,h3,h4,h5,h6,hr,section,article';

  /* Chrome that belongs to the viewer, not to the answer. */
  const SKIP_SELECTOR = '.code-block-decoration,button,mat-icon,gem-icon,gem-icon-button';

  /** Characters that would otherwise be read as Markdown syntax. */
  function escapeText(s) {
    return s.replace(/([\\`*_[\]])/g, '\\$1');
  }

  function inline(node) {
    if (node.nodeType === 3) return escapeText(node.nodeValue);
    if (node.nodeType !== 1) return '';
    if (node.matches && node.matches(SKIP_SELECTOR)) return '';

    const kids = () => Array.from(node.childNodes).map(inline).join('');
    switch (node.tagName) {
      case 'BR':     return '  \n';
      case 'STRONG':
      case 'B':      return wrap(kids(), '**');
      case 'EM':
      case 'I':      return wrap(kids(), '*');
      case 'DEL':
      case 'S':      return wrap(kids(), '~~');
      case 'CODE': {
        // Inline code takes the raw text; escaping inside it would be wrong.
        const t = node.textContent;
        const fence = '`'.repeat(longestRun(t, '`') + 1);
        return t.includes('`') ? `${fence} ${t} ${fence}` : `\`${t}\``;
      }
      case 'A': {
        const href = node.getAttribute('href') || '';
        const text = kids().trim() || href;
        return href && !href.startsWith('javascript:') ? `[${text}](${href})` : text;
      }
      case 'IMG': {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return src.startsWith('data:') ? (alt && `![${alt}]`) : `![${alt}](${src})`;
      }
      default:       return kids();
    }
  }

  /* Markdown emphasis will not bind across its own leading/trailing spaces, so
     the marks go inside them. */
  function wrap(text, mark) {
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m || !m[2]) return text;
    return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
  }

  function longestRun(s, ch) {
    let best = 0, run = 0;
    for (const c of s) { run = c === ch ? run + 1 : 0; if (run > best) best = run; }
    return best;
  }

  /** Language label for a fenced block, from Gemini's code-block header. */
  function languageOf(pre) {
    const host = pre.closest('code-block, .code-block');
    const label = host && host.querySelector('.code-block-decoration');
    const raw = label ? (label.firstChild && label.firstChild.textContent || '') : '';
    return raw.trim().toLowerCase().replace(/[^a-z0-9+#-]/g, '');
  }

  function fence(pre) {
    const code = pre.querySelector('code') || pre;
    const body = code.textContent.replace(/\n+$/, '');
    const ticks = '`'.repeat(Math.max(3, longestRun(body, '`') + 1));
    return `${ticks}${languageOf(pre)}\n${body}\n${ticks}`;
  }

  function table(el) {
    const rows = Array.from(el.querySelectorAll('tr'))
      .map(tr => Array.from(tr.children)
        .map(c => inline(c).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()));
    if (!rows.length) return '';
    const width = Math.max(...rows.map(r => r.length));
    const pad = (r) => { const c = r.slice(); while (c.length < width) c.push(''); return c; };
    const head = pad(rows[0]);
    const rest = rows.slice(1).map(pad);
    return [
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rest.map(r => `| ${r.join(' | ')} |`),
    ].join('\n');
  }

  function list(el, depth) {
    const ordered = el.tagName === 'OL';
    let n = Number(el.getAttribute('start') || 1);
    return Array.from(el.children)
      .filter(li => li.tagName === 'LI')
      .map(li => {
        const marker = ordered ? `${n++}. ` : '- ';
        const indent = '  '.repeat(depth);
        // A nested list is a child of the <li>; render it below its own item.
        const own = Array.from(li.childNodes).filter(c => !isList(c));
        const nested = Array.from(li.children).filter(isList);
        const text = own.map(inline).join('').trim();
        const sub = nested.map(sl => list(sl, depth + 1)).filter(Boolean).join('\n');
        return indent + marker + text + (sub ? '\n' + sub : '');
      })
      .join('\n');
  }

  const isList = (n) => n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL');

  function block(node, out) {
    if (node.nodeType === 3) {
      const t = node.nodeValue.trim();
      if (t) out.push(escapeText(t));
      return;
    }
    if (node.nodeType !== 1) return;

    switch (node.tagName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        out.push('#'.repeat(+node.tagName[1]) + ' ' + inline(node).trim());
        return;
      case 'P':
        { const t = inline(node).trim(); if (t) out.push(t); }
        return;
      case 'PRE':
        out.push(fence(node));
        return;
      case 'UL': case 'OL':
        out.push(list(node, 0));
        return;
      case 'BLOCKQUOTE': {
        const inner = [];
        Array.from(node.childNodes).forEach(c => block(c, inner));
        out.push(inner.join('\n\n').split('\n').map(l => '> ' + l).join('\n'));
        return;
      }
      case 'TABLE':
        out.push(table(node));
        return;
      case 'HR':
        out.push('---');
        return;
      case 'BR':
        return;
      default: {
        if (node.matches && node.matches(SKIP_SELECTOR)) return;
        if (INLINE_TAGS.has(node.tagName)) {
          const t = inline(node).trim();
          if (t) out.push(t);
          return;
        }
        /* A container whose content is entirely inline is one paragraph;
           splitting its children would break a sentence across blocks. */
        if (node.querySelector && node.querySelector(BLOCK_SELECTOR)) {
          Array.from(node.childNodes).forEach(c => block(c, out));
        } else {
          const t = inline(node).trim();
          if (t) out.push(t);
        }
      }
    }
  }

  /** Serialise one rendered response element to Markdown. */
  function fromElement(el) {
    if (!el) return '';
    // Prefer the markdown body; a response also carries chrome we do not want.
    const root_ = el.querySelector('.markdown') || el;
    const out = [];
    Array.from(root_.childNodes).forEach(n => block(n, out));
    return out.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  root.GeminiPolishMarkdown = { fromElement, escapeText };
})(typeof globalThis !== 'undefined' ? globalThis : self);
