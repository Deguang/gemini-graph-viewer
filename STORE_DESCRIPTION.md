# Chrome Web Store Listing Assets

> Regenerated for 1.2.0. Every number below is taken from `shared/config.js`
> — if you change the presets, toggles, schemes or locales, update this file
> in the same commit or the listing goes stale again.

---

## 1. Short summary (max 132 chars)

```
Reading typography, colour schemes and a split-view Mermaid renderer for Google Gemini.
```
*(86 characters)*

The **name** and **short description** are localised automatically: the manifest
uses `__MSG_extName__` / `__MSG_extDesc__`, so the Web Store serves whichever of
the 7 bundled locales matches the viewer. Only this long description has to be
entered per-language in the developer dashboard.

---

## 2. Detailed description

**Gemini Polish turns Google Gemini into a reading surface you actually want to
spend time in — and keeps the diagram viewer you already know.**

Long answers from Gemini are dense: tight line height, no paragraph spacing, a
column that runs the full width of your monitor. Gemini Polish fixes the reading
experience without replacing the app you already know how to use.

### Pick a style, pick a palette

Two controls, and they do not overlap. **Style** decides how much of Gemini's
layout gets replaced. **Colour** decides what it looks like. Any combination
works.

**Styles**
- **Native Gemini** — changes nothing. Your escape hatch.
- **Comfortable** — 17px type, 1.7 line height, real paragraph spacing, a
  readable 860px column, proper heading scale.
- **Focus** — the above, larger and airier (18px / 1.9 / 700px column), with the
  disclaimer footer hidden and the action buttons revealed only on hover.

**Colour schemes** — six, each shipping a matched light *and* dark palette of
eight colours:
- **Native Gemini** — a true pass-through. Not a copy of Gemini's colours: it
  emits no colour rules at all, so Google's own palette shows through and keeps
  tracking their updates.
- **Solarized**, **Nord**, **Gruvbox** — faithful reproductions of the published
  palettes.
- **Amber** — the only scheme that keeps Gemini's white ground and warms just
  the accent.
- **Sepia** — a warm paper tone for long reading sessions.

Gemini's own light/dark switch drives which palette is live — nothing to toggle
twice, and no flash when you change theme.

### Split-view Mermaid renderer

The original feature, unchanged. Any `graph`, `flowchart`, `sequenceDiagram`,
`mindmap`, `erDiagram`, `classDiagram`, `stateDiagram`, `gantt`, `timeline` or
`pie` block in a Gemini answer renders next to its source. Pan, zoom, auto-fit,
switch between side-by-side and stacked, go fullscreen, copy the code, export
SVG, or copy the diagram as a 2× PNG.

### A copy button that does not hang the tab

Gemini's own "Copy response" can lock the page on long answers. This adds an
**MD** button beside it that serialises the answer itself — headings, nested
lists, blockquotes, tables, and fenced code blocks with their language label —
in a single pass over the rendered content. Same clipboard, none of the wait.

### When you want the knobs

Advanced opens 21 individual switches, grouped by **what they act on** rather
than by property type — Reading (content), Interface (chrome), Enhancements.
Every colour swatch sits on the same row as the switch that applies it, so you
can always tell what a colour will repaint. Six sliders cover size, line height,
paragraph gap, column width and sidebar density. A Custom CSS box is there when
you want something the toggles do not cover.

### Built to survive Gemini's redesigns

Selectors are anchored to the parts of Gemini's DOM that change least — Angular
custom element tags, `data-test-id` attributes, and Google's own design tokens —
and every anchor was verified against the live site. When Google ships a UI
update, only the affected toggle is at risk; the rest keep working, and you can
switch the broken one off without losing the extension.

### Details that took the work

- **Contrast is checked, not eyeballed.** Every palette we author clears WCAG AA
  (4.5:1) for text, links and inline code — against the *surface* colour, not
  just the background. The three reproduced palettes keep their published values.
- **Your settings cannot be lost to a sync hiccup.** Settings are written
  locally first and mirrored to your Google account in the background, so a
  throttled or offline sync never costs you a change.
- **Changes apply as you make them** — no reload, no save button.
- **7 languages**: English, 简体中文, 繁體中文, 日本語, हिन्दी, Deutsch, Français.

### Privacy

No analytics, no tracking, no remote code, no network requests of its own. The
extension runs only on `gemini.google.com` and stores your settings in Chrome's
own storage. Nothing about your conversations is read, collected or transmitted.

---

*Gemini Polish is an independent project. It is not affiliated with, endorsed
by, or sponsored by Google. "Google" and "Gemini" are trademarks of Google LLC,
used here only to describe what this extension works with.*

---

## 3. Notes for whoever updates the listing

- The published listing is still **1.0.3 — "Gemini Graph (Flowchart)
  Split-Viewer"**, which describes only the Mermaid renderer. Everything above
  is new to the listing.
- **The name change is a judgement call, not a formality.** The existing
  installs came for a diagram viewer; the store URL slug
  (`gemini-graph-flowchart-sp`) is permanent and will keep saying "graph"
  regardless. Keeping "Graph Viewer" in the name is what the current manifest
  does, and it is the safer read for existing users.
- Screenshots need reshooting — the current ones predate the settings panel.
- Add the affiliation disclaimer above to the listing body; it is not on the
  live page today.
