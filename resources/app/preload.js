// Preload script - currently minimal, injection is done via executeJavaScript
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('arcadeCustom', {
    version: '1.0.0',
    features: ['error-copy', 'memory-display', 'image-import', 'extended-buttons']
});
