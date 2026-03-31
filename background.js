/**
 * Gemini Graph TD (Mermaid) Previewer
 * 后台服务：实现安装即生效
 */

chrome.runtime.onInstalled.addListener(async () => {
  // 查找所有符合条件的 Gemini 标签页
  const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
  
  for (const tab of tabs) {
    // 只有在标签页已加载且拥有权限的情况下注入
    if (tab.url.startsWith("http")) {
      try {
        // 1. 注入 CSS 样式
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["styles.css"]
        });

        // 2. 注入 Mermaid 库 (按顺序注入)
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/mermaid.min.js"]
        });

        // 3. 注入插件主逻辑
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });

        console.log(`Successfully injected into tab: ${tab.id} (${tab.url})`);
      } catch (err) {
        // 静默处理无法访问的系统页面或正在加载的页面
        console.warn(`Skipping injection for tab ${tab.id}:`, err.message);
      }
    }
  }
});
