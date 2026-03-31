# Gemini Graph (Flowchart) Split-Viewer

一款专业、高性能的浏览器扩展，专为在 Google Gemini 界面中实时渲染 Mermaid 图表而设计。它提供流畅的分栏体验和强大的交互功能。

![版本](https://img.shields.io/badge/版本-1.0-blue)
![平台](https://img.shields.io/badge/平台-Chrome%20|%20Edge-lightgrey)
![许可](https://img.shields.io/badge/许可-MIT-green)

## ✨ 核心特性

- **专业分栏视图**：支持源代码与渲染图表左右并排或上下堆叠展示。
- **极致清晰渲染**：以 1:1 原始矢量精度进行绘制。即便在高分屏或全屏模式下，线条和文字也绝不模糊。
- **交互式工作台**：
  - **缩放与平移**：支持鼠标滚轮或触摸板自由缩放，可鼠标拖拽平移查看超大图表。
  - **动态自适应**：在图表生成过程中自动计算比例，始终保持最大化可见。
  - **一键折叠**：可瞬间隐藏代码区或预览区，聚焦核心内容。
- **顶级全屏模式**：采用“传送门”技术打破 Gemini 布局限制，提供真正的沉浸式大屏体验（支持 `ESC` 键退出）。
- **原生视觉融合**：
  - **智能深色模式**：完美适配 Gemini 官方深/浅色主题，包含精致的暗色滚动条。
  - **精致排版**：使用 11px JetBrains Mono 字体展示代码，极具质感。
- **实用生产力工具**：
  - **导出 SVG**：一键保存高质量矢量图文件。
  - **复制代码**：快速复制 Mermaid 源代码。
- **即装即用**：安装或刷新插件后自动激活，无需刷新已打开的 Gemini 标签页。

## 🚀 安装指南

1.  **从 Chrome 网上应用店安装 (推荐)**: [Gemini Graph (Flowchart) Split-Viewer](https://chromewebstore.google.com/detail/ajboihpfgkpcpeibiahobpdogdbbmfpn)
2.  **开发者手动安装**:
    - 下载或克隆本仓库到本地。
    - 打开浏览器，进入 `chrome://extensions/`（扩展程序）。
    - 开启右上角的 **“开发者模式”**。
    - 点击 **“加载已解压的扩展程序”**，选择项目目录。

## 🌐 项目官网 (Landing Page)
您可以访问我们的 [GitHub Pages 官网](https://your-username.github.io/gemini_mermarid/) 查看更多预览和隐私政策。

## 🛠 自动化工具
本项目内置了工程化脚本：
- `npm run zip`: 自动打包插件到 `release/` 目录。
- `npm run release`: 一键发布到 GitHub Release（需安装 gh cli）。

## 🛠 支持的图表类型

完美支持 Gemini 常输出的所有主流 Mermaid 语法：
- `graph TD/LR/BT/RL` (流程图)
- `flowchart` (逻辑图)
- `erDiagram` (实体关系图)
- `sequenceDiagram` (时序图)
- `classDiagram` (类图)
- `stateDiagram` (状态图)
- `mindmap` (思维导图), `timeline`, `gantt`, `pie` 等。

## 🔒 安全与兼容性

- **Trusted Types 兼容**：完全符合 Google 严苛的安全策略，杜绝脚本注入报错。
- **智能语法修正**：后台自动修复 Gemini 输出中常见的语法冲突（如包含括号的标签未加引号等）。

## 📄 许可

MIT License. 欢迎使用、反馈或贡献代码！
