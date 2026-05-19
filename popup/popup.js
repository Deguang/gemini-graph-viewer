document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const enableGraph = document.getElementById('enableGraph');
  const enableMinimal = document.getElementById('enableMinimal');
  const enableTypography = document.getElementById('enableTypography');
  const typographyControls = document.getElementById('typography-controls');
  
  const lineHeight = document.getElementById('lineHeight');
  const lineHeightVal = document.getElementById('lineHeightVal');
  const fontSize = document.getElementById('fontSize');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const maxWidth = document.getElementById('maxWidth');
  const maxWidthVal = document.getElementById('maxWidthVal');
  const customCSS = document.getElementById('customCSS');

  // Load saved config
  chrome.storage.sync.get({
    enableGraph: true,
    enableMinimal: false,
    enableTypography: false,
    lineHeight: 1.7,
    fontSize: 16,
    maxWidth: 850,
    customCSS: ''
  }, (items) => {
    enableGraph.checked = items.enableGraph;
    enableMinimal.checked = items.enableMinimal;
    enableTypography.checked = items.enableTypography;
    
    lineHeight.value = items.lineHeight;
    lineHeightVal.textContent = items.lineHeight;
    
    fontSize.value = items.fontSize;
    fontSizeVal.textContent = items.fontSize;
    
    maxWidth.value = items.maxWidth;
    maxWidthVal.textContent = items.maxWidth;

    customCSS.value = items.customCSS;

    updateTypographyState();
  });

  function updateTypographyState() {
    if (enableTypography.checked) {
      typographyControls.classList.remove('disabled');
    } else {
      typographyControls.classList.add('disabled');
    }
  }

  // Save Config
  function saveConfig() {
    const config = {
      enableGraph: enableGraph.checked,
      enableMinimal: enableMinimal.checked,
      enableTypography: enableTypography.checked,
      lineHeight: lineHeight.value,
      fontSize: fontSize.value,
      maxWidth: maxWidth.value,
      customCSS: customCSS.value
    };
    chrome.storage.sync.set(config, () => {
      // Notify content script
      chrome.tabs.query({url: "https://gemini.google.com/*"}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: "updateConfig", config });
        });
      });
    });
  }

  // Event Listeners
  [enableGraph, enableMinimal, enableTypography].forEach(el => {
    el.addEventListener('change', () => {
      updateTypographyState();
      saveConfig();
    });
  });

  lineHeight.addEventListener('input', (e) => {
    lineHeightVal.textContent = e.target.value;
    saveConfig();
  });

  fontSize.addEventListener('input', (e) => {
    fontSizeVal.textContent = e.target.value;
    saveConfig();
  });

  maxWidth.addEventListener('input', (e) => {
    maxWidthVal.textContent = e.target.value;
    saveConfig();
  });

  customCSS.addEventListener('input', () => {
    saveConfig();
  });
});
