# 30s · 1920×1080 · 字幕驱动，无配音

录的是真实的 1.3.0 在真实 Gemini 上运行，不是合成动画。

| 时间 | 画面 | 字幕 |
|---|---|---|
| 0:00–0:04 | Gemini 原生状态，一段长回答，密排小字 | Gemini answers are dense by default. |
| 0:04–0:09 | 面板里 Style 切到 Comfortable，页面**实时重排**（不刷新） | One control changes the typography. |
| 0:09–0:15 | 配色轮播 Amber → Nord → Sepia，明暗跟随 | Six colour schemes. Light and dark, matched. |
| 0:15–0:22 | 滚到 mermaid 代码块，图表在源码旁渲染出来 | Diagrams render beside their source. |
| 0:22–0:27 | 点操作栏最前面的 MD 按钮，出现 Copied | Copy any answer as clean Markdown. |
| 0:27–0:30 | 尾板：名称 + Free on the Chrome Web Store | — |

## 技术路线

- CDP `Page.startScreencast` 抓真实渲染帧（含 CSS 过渡动画），不是逐帧截图
- 帧带时间戳 → 生成 ffconcat 清单 → ffmpeg 按 30fps 重采样编码
- 设置面板是独立的 extension popup 上下文，页面 screencast 抓不到：
  单独录一路 popup，用 ffmpeg overlay 叠成画中画
- 输出 H.264 MP4，YouTube 首选格式

## 隐私

侧边栏会露出真实会话标题 —— 录制前折叠侧边栏，或只取正文区域裁切。
