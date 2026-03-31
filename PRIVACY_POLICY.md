# Privacy Policy & Permission Justification

## Permissions Overview

Our extension follows the principle of **Least Privilege**. We only request the minimum permissions necessary to provide the diagram rendering functionality.

### 1. Scripting (`scripting`)
**Justification**: This permission is the core of the extension. It allows us to inject the Mermaid.js library and our split-view logic into the Google Gemini page. Without this, the extension cannot read the text-based diagram code or render it into a visual graph.

### 2. Tabs (`tabs`)
**Justification**: We use this permission to detect if you have any open Google Gemini tabs when the extension is first installed or updated. This allows us to "Instant Activate" the viewer so you don't have to refresh your pages to start seeing diagrams. We do not track your browsing history.

### 3. Storage (`storage`)
**Justification**: This is used solely to remember your preferred settings, such as your choice between "Side-by-Side" or "Vertical" layout and whether you prefer to have the code panel collapsed by default. No personal data is stored.

### 4. Host Permissions (`*://gemini.google.com/*`)
**Justification**: This restricts the extension's power to ONLY the Google Gemini website. The extension will not run, read, or modify any other websites you visit.

## Data Privacy
- **Local Rendering**: All diagram processing and rendering happen locally on your computer. Your chat content and diagram data are never sent to our servers or any third-party services.
- **No Tracking**: We do not collect, store, or transmit any personal information, browsing history, or Gemini conversations.
