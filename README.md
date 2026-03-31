# Gemini Graph (Flowchart) Split-Viewer

A professional, high-performance browser extension designed to render Mermaid diagrams directly within the Google Gemini interface. It provides a seamless, split-view experience with advanced interaction capabilities.

![Version](https://img.shields.io/badge/version-1.0-blue)
![Platform](https://img.shields.io/badge/platform-Chrome%20|%20Edge-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Key Features

- **Professional Split-View**: View raw code and rendered diagrams side-by-side or vertically stacked.
- **Ultra-Clear Rendering**: Renders diagrams with 1:1 vector precision. No blurriness, even on high-resolution displays or in fullscreen mode.
- **Interactive Workbench**:
  - **Zoom & Pan**: Use mouse wheel or trackpad to zoom and drag to pan through complex diagrams.
  - **Auto-Fit**: Automatically maximizes the diagram size to fit your current view during generation.
  - **One-Click Collapse**: Hide either the code or the preview to focus on what matters.
- **Deep Fullscreen Mode**: Uses "Teleportation" technology to break through Gemini's layout constraints, providing a true immersive viewing experience (Supports `ESC` to exit).
- **Gemini Native Look**:
  - **Adaptive Dark Mode**: Perfect visual integration with Gemini's official dark/light themes.
  - **Refined Typography**: 11px JetBrains Mono font for a crisp code display.
- **Utility Tools**:
  - **Export SVG**: Save your diagrams as high-quality vector files.
  - **Copy Code**: Quickly copy the original Mermaid source code.
- **Instant Activation**: Works immediately after installation/reload without needing to refresh Gemini tabs.

## 🚀 Installation

1.  **Download** the project folder to your local machine.
2.  Open your browser (Chrome, Edge, or any Chromium-based browser) and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** using the toggle in the top-right corner.
4.  Click **Load unpacked** and select the extension folder: `/Users/gztd-03-01449/Documents/mySpace/gemini_mermarid`.
5.  Navigate to [Gemini](https://gemini.google.com) and start generating diagrams!

## 🛠 Supported Diagram Types

Supports all major Mermaid syntaxes frequently used by Gemini:
- `graph TD/LR/BT/RL`
- `flowchart`
- `erDiagram` (Entity Relationship)
- `sequenceDiagram`
- `classDiagram`
- `stateDiagram`
- `mindmap`, `timeline`, `gantt`, `pie`, etc.

## 🔒 Security & Compliance

- **Trusted Types Compatible**: Fully compliant with Google's strict security policies. No `innerHTML` usage, preventing script injection errors.
- **Auto-Fix Logic**: Background logic automatically corrects common Gemini output issues like unquoted labels containing parentheses.

## 📄 License

MIT License. Feel free to use and contribute!
