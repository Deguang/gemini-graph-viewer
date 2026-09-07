/**
 * Gemini Polish · Mermaid source repair
 *
 * Model output is frequently *almost* valid Mermaid: an unquoted subgraph title
 * containing parentheses, an edge label with a comma. This nudges those into
 * shape before rendering.
 *
 * The one rule that matters: a quote that DELIMITS a label is syntax, and must
 * survive. An earlier version replaced every `"` in the source with `#quot;`,
 * which turned the perfectly valid
 *     subgraph Local_Workspace ["📦 本地开发环境 (Node.js)"]
 * into an unquoted label containing parentheses, and the parser stopped on the
 * first `(`. Only quotes *inside* a label are escaped, and only where this
 * function is the one adding the delimiters.
 */
(function (root) {
  'use strict';

  /* Characters Mermaid cannot take in a bare (unquoted) label. */
  const NEEDS_QUOTING = /[()[\]{}<>:;#"|]/;

  /** Escape for the inside of a Mermaid double-quoted string. */
  const escapeLabel = (s) => s.replace(/"/g, '#quot;');

  /** Does this subgraph header already carry a bracketed label? */
  const hasBracketLabel = (title) => /\[/.test(title);

  function cleanMermaidCode(text) {
    // Entities can survive extraction from HTML; decode them to real characters.
    let out = String(text)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');

    /* `subgraph Some Title (with parens)` — give it an id and a quoted label.
       Headers that already have `[...]` are valid as written and left alone. */
    let n = 0;
    out = out.replace(/^([ \t]*subgraph[ \t]+)([^\n\r]+)$/gm, (match, keyword, rest) => {
      const title = rest.trim();
      if (!title || hasBracketLabel(title) || !NEEDS_QUOTING.test(title)) return match;
      n += 1;
      return `${keyword}sg_${n} ["${escapeLabel(title)}"]`;
    });

    /* Edge labels: `A -->|text, with comma| B`. Already-quoted labels are
       syntax and stay untouched. */
    out = out.replace(
      /(-{1,3}>|={2,3}>|\.-+>|-{2,3}|\.-+)([ \t]*)\|([^|\n]+)\|/g,
      (match, arrow, gap, label) => {
        const t = label.trim();
        if (/^".*"$/.test(t)) return match;
        return `${arrow}${gap}|"${escapeLabel(t)}"|`;
      }
    );

    /* A bare bracket label containing quotes — `F[状态为"已支付"]` — cannot
       parse: the quotes are inside an unquoted label. Escape those, and ONLY
       those. A label that opens with `"` is quote-delimited and is syntax we
       must not touch; this distinction is exactly what the old blanket rule
       lost. `[(...)]`, `[[...]]` and the like carry no quotes and are unaffected. */
    out = out.replace(/\[([^\]\n]*)\]/g, (match, inner) => {
      if (!inner.includes('"') || inner.trimStart().startsWith('"')) return match;
      return `[${escapeLabel(inner)}]`;
    });

    return out;
  }

  root.GeminiPolishMermaidClean = { cleanMermaidCode, NEEDS_QUOTING };
})(typeof globalThis !== 'undefined' ? globalThis : self);
