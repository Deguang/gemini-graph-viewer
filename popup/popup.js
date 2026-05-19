document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const enableGraph = document.getElementById('enableGraph');
  const enableMinimal = document.getElementById('enableMinimal');
  const enableTypography = document.getElementById('enableTypography');
  const typographyControls = document.getElementById('typography-controls');
  
  const fontFamily = document.getElementById('fontFamily');
  const customFontName = document.getElementById('customFontName');
  const lineHeight = document.getElementById('lineHeight');
  const lineHeightVal = document.getElementById('lineHeightVal');
  const paragraphSpacing = document.getElementById('paragraphSpacing');
  const paragraphSpacingVal = document.getElementById('paragraphSpacingVal');
  const fontSize = document.getElementById('fontSize');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const maxWidth = document.getElementById('maxWidth');
  const maxWidthVal = document.getElementById('maxWidthVal');
  const accentColor = document.getElementById('accentColor');
  const customCSS = document.getElementById('customCSS');

  // Load saved config
  chrome.storage.sync.get({
    enableGraph: true,
    enableMinimal: false,
    enableTypography: false,
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    customFontName: '',
    lineHeight: 1.7,
    paragraphSpacing: 1.2,
    fontSize: 16,
    maxWidth: 850,
    accentColor: '#1a73e8',
    customCSS: ''
  }, (items) => {
    enableGraph.checked = items.enableGraph;
    enableMinimal.checked = items.enableMinimal;
    enableTypography.checked = items.enableTypography;
    
    fontFamily.value = items.fontFamily;
    customFontName.value = items.customFontName;
    
    lineHeight.value = items.lineHeight;
    lineHeightVal.textContent = items.lineHeight;
    
    paragraphSpacing.value = items.paragraphSpacing;
    paragraphSpacingVal.textContent = items.paragraphSpacing;
    
    fontSize.value = items.fontSize;
    fontSizeVal.textContent = items.fontSize;
    
    maxWidth.value = items.maxWidth;
    maxWidthVal.textContent = items.maxWidth;

    accentColor.value = items.accentColor;

    customCSS.value = items.customCSS;

    updateTypographyState();
    updateFontFamilyState();
  });

  function updateTypographyState() {
    if (enableTypography.checked) {
      typographyControls.classList.remove('disabled');
    } else {
      typographyControls.classList.add('disabled');
    }
  }

  function updateFontFamilyState() {
    if (fontFamily.value === 'custom') {
      customFontName.style.display = 'block';
    } else {
      customFontName.style.display = 'none';
    }
  }

  // Save Config
  function saveConfig() {
    const config = {
      enableGraph: enableGraph.checked,
      enableMinimal: enableMinimal.checked,
      enableTypography: enableTypography.checked,
      fontFamily: fontFamily.value,
      customFontName: customFontName.value,
      lineHeight: lineHeight.value,
      paragraphSpacing: paragraphSpacing.value,
      fontSize: fontSize.value,
      maxWidth: maxWidth.value,
      accentColor: accentColor.value,
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

  fontFamily.addEventListener('change', () => {
    updateFontFamilyState();
    saveConfig();
  });

  customFontName.addEventListener('input', () => {
    saveConfig();
  });

  lineHeight.addEventListener('input', (e) => {
    lineHeightVal.textContent = e.target.value;
    saveConfig();
  });

  paragraphSpacing.addEventListener('input', (e) => {
    paragraphSpacingVal.textContent = e.target.value;
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

  accentColor.addEventListener('input', () => {
    saveConfig();
  });

  customCSS.addEventListener('input', () => {
    saveConfig();
  });
});
