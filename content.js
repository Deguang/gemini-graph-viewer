(function() {
  'use strict';

  function getTheme() {
    return document.body.classList.contains('dark-theme') ? 'dark' : 'default';
  }

  function getMermaidConfig() {
    const theme = getTheme();
    return {
      startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'loose',
      suppressErrorRendering: true,
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
      themeVariables: theme === 'dark' ? {
        primaryColor: '#1e1f20', primaryTextColor: '#e3e3e3', primaryBorderColor: '#8ab4f8',
        lineColor: '#c4c7c5', secondaryColor: '#3c4043', tertiaryColor: '#131314'
      } : {},
    };
  }

  function initMermaid() {
    if (window.mermaid) {
      window.mermaid.initialize(getMermaidConfig());
    } else {
      setTimeout(initMermaid, 100);
    }
  }
  initMermaid();

  function cleanMermaidCode(text) {
    let cleaned = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    
    // 修复 subgraph 标题中包含特殊字符导致解析错误的问题
    let subGraphCounter = 0;
    cleaned = cleaned.replace(/(\bsubgraph\s+)([^\n\r\u2028\u2029\{]+)/g, (match, p1, p2) => {
      let title = p2.trim();
      if (title.includes('[') || title.includes('"')) {
        return match; // 已经使用了新语法，跳过
      }
      if (/[\(\)\{\}\<\>:]/.test(title)) {
        subGraphCounter++;
        return `${p1}subgraph_fix_${subGraphCounter} ["${title}"]`;
      }
      return match;
    });

    return cleaned;
  }

  function safeInjectHTML(container, htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const svg = doc.querySelector('svg');
    if (svg) {
      // 保持原始 viewBox 比例，不强制 100% 宽度，由 zoomContainer 处理
      svg.style.display = 'block';
      const vb = svg.viewBox.baseVal;
      if (vb && vb.width > 0) {
        svg.setAttribute('width', vb.width);
        svg.setAttribute('height', vb.height);
      }
      container.replaceChildren(svg);
      return true;
    }
    return false;
  }

  function createSide(isCode) {
    const side = document.createElement('div');
    side.className = `mermaid-side ${isCode ? 'mermaid-code-side' : 'mermaid-preview-side'}`;
    const content = document.createElement('div');
    content.className = 'mermaid-side-content';
    side.append(content);
    return { side, content };
  }

  async function processCodeBlock(codeEl) {
    if (codeEl.dataset.mermaidProcessed) return;
    const rawCode = codeEl.innerText;
    const mermaidKeywords = ['graph ', 'graph\n', 'graph\r', 'graph LR', 'graph TD', 'sequenceDiagram', 'erDiagram', 'flowchart ', 'mindmap', 'timeline', 'gantt', 'pie', 'classDiagram', 'stateDiagram'];
    if (!mermaidKeywords.some(k => rawCode.trim().startsWith(k))) return;

    codeEl.dataset.mermaidProcessed = 'true';
    const preEl = codeEl.closest('pre');
    if (!preEl) return;
    preEl.style.display = 'none';

    const nativeCodeBlock = preEl.closest('.code-block');
    if (nativeCodeBlock) {
      const nativeHeader = nativeCodeBlock.querySelector('.code-block-decoration');
      if (nativeHeader) nativeHeader.classList.add('mermaid-hidden-native');
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';
    if (rawCode.includes('graph LR') || rawCode.includes('flowchart LR')) {
      wrapper.classList.add('mermaid-vertical');
    }

    const codeSideObj = createSide(true);
    const previewSideObj = createSide(false);
    const mainToolbar = document.createElement('div');
    mainToolbar.className = 'mermaid-main-toolbar';

    const createBtn = (text, onClick, isActive = false) => {
      const btn = document.createElement('button');
      btn.className = `mermaid-toolbar-btn ${isActive ? 'active' : ''}`;
      btn.textContent = text;
      btn.onclick = (e) => { e.stopPropagation(); onClick(btn); };
      return btn;
    };

    const btnCode = createBtn('CODE', (btn) => {
      const isHidden = codeSideObj.side.classList.toggle('mermaid-side-hidden');
      btn.classList.toggle('active', !isHidden);
      if (isHidden && previewSideObj.side.classList.contains('mermaid-side-hidden')) {
        previewSideObj.side.classList.remove('mermaid-side-hidden');
        btnPreview.classList.add('active');
      }
      setTimeout(autoFit, 450);
    }, true);

    const btnPreview = createBtn('PREVIEW', (btn) => {
      const isHidden = previewSideObj.side.classList.toggle('mermaid-side-hidden');
      btn.classList.toggle('active', !isHidden);
      if (isHidden && codeSideObj.side.classList.contains('mermaid-side-hidden')) {
        codeSideObj.side.classList.remove('mermaid-side-hidden');
        btnCode.classList.add('active');
      }
      setTimeout(autoFit, 450);
    }, true);

    const btnLayout = createBtn(wrapper.classList.contains('mermaid-vertical') ? 'VERTICAL' : 'SIDE-BY-SIDE', (btn) => {
      const isVert = wrapper.classList.toggle('mermaid-vertical');
      btn.textContent = isVert ? 'VERTICAL' : 'SIDE-BY-SIDE';
      setTimeout(autoFit, 450);
    });

    let placeholder = null;
    const toggleFullscreen = () => {
      const isFull = wrapper.classList.toggle('mermaid-fullscreen');
      btnFull.classList.toggle('active', isFull);
      btnFull.textContent = isFull ? 'EXIT FULL' : 'FULLSCREEN';
      if (isFull) {
        placeholder = document.createElement('div');
        wrapper.after(placeholder);
        document.body.appendChild(wrapper);
      } else {
        if (placeholder) {
          placeholder.after(wrapper);
          placeholder.remove();
          placeholder = null;
        }
      }
      setTimeout(() => render(codePre.textContent), 350);
    };
    const btnFull = createBtn('FULLSCREEN', toggleFullscreen);

    mainToolbar.append(btnCode, btnPreview, btnLayout, btnFull);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'mermaid-copy-btn';
    copyBtn.textContent = 'Copy Code';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(codePre.textContent).then(() => {
        const old = copyBtn.textContent; copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = old, 2000);
      });
    };
    codeSideObj.side.appendChild(copyBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'mermaid-export-btn';
    exportBtn.textContent = 'Export SVG';
    exportBtn.onclick = () => {
      const svg = zoomContainer.querySelector('svg');
      if (svg) {
        const blob = new Blob([svg.outerHTML], {type: 'image/svg+xml'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mermaid-${Date.now()}.svg`;
        a.click();
      }
    };
    previewSideObj.side.appendChild(exportBtn);

    const codePre = document.createElement('pre');
    codeSideObj.content.appendChild(codePre);

    const zoomArea = document.createElement('div');
    zoomArea.className = 'mermaid-zoom-area';
    const zoomContainer = document.createElement('div');
    zoomContainer.className = 'mermaid-zoom-container';
    zoomArea.appendChild(zoomContainer);
    previewSideObj.content.appendChild(zoomArea);

    wrapper.append(codeSideObj.side, previewSideObj.side, mainToolbar);
    preEl.after(wrapper);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrapper.classList.contains('mermaid-fullscreen')) toggleFullscreen();
    });

    let scale = 1, tx = 0, ty = 0;
    const update = () => zoomContainer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

    zoomArea.onwheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.min(Math.max(0.1, scale * delta), 15);
      update();
    };

    let isDrag = false, sx, sy;
    zoomArea.onmousedown = (e) => { isDrag = true; sx = e.clientX - tx; sy = e.clientY - ty; };
    window.addEventListener('mousemove', (e) => { if (!isDrag) return; tx = e.clientX - sx; ty = e.clientY - sy; update(); });
    window.addEventListener('mouseup', () => isDrag = false);

    const autoFit = () => {
      const svg = zoomContainer.querySelector('svg');
      if (!svg || !wrapper.isConnected) return;
      
      const vbAttr = svg.getAttribute('viewBox');
      let naturalW, naturalH;
      if (vbAttr) {
        const parts = vbAttr.split(/[\s,]+/).map(Number);
        if (parts.length === 4) { naturalW = parts[2]; naturalH = parts[3]; }
      }
      naturalW = naturalW || svg.viewBox.baseVal.width || 800;
      naturalH = naturalH || svg.viewBox.baseVal.height || 600;
      
      const containerRect = zoomArea.getBoundingClientRect();
      if (containerRect.width === 0) return;
      
      const padding = 80;
      scale = Math.min((containerRect.width - padding) / naturalW, (containerRect.height - padding) / naturalH, 4.0);
      tx = 0; ty = 0;
      update();
    };

    const previewId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
    const renderDiv = document.createElement('div');
    renderDiv.id = previewId;
    zoomContainer.appendChild(renderDiv);

    const render = async (code) => {
      if (!code.trim()) return;
      try {
        window.mermaid.initialize(getMermaidConfig());
        codePre.textContent = code; 
        const { svg } = await window.mermaid.render(previewId + '-svg', cleanMermaidCode(code));
        if (safeInjectHTML(renderDiv, svg)) {
          requestAnimationFrame(() => setTimeout(autoFit, 50));
        }
      } catch (err) {
        const stray = document.getElementById('d' + previewId + '-svg');
        if (stray) stray.remove();
        renderDiv.replaceChildren(Object.assign(document.createElement('pre'), {className:'mermaid-error', textContent:err.message || String(err)}));
      }
    };

    render(rawCode);
    new MutationObserver(() => render(codeEl.innerText)).observe(codeEl, { characterData: true, childList: true, subtree: true });
  }

  setInterval(() => {
    document.querySelectorAll('code[data-test-id="code-content"]').forEach(processCodeBlock);
    document.querySelectorAll('pre code').forEach(processCodeBlock);
  }, 1000);
})();
