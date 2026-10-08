/**
 * Custom Arcade Editor Inject Script - Step 1+2 (v5)
 * Features:
 * 1. Error text selectable + copy all errors button
 * 2. FLASH usage estimate from UF2 file size
 */

(function () {
    'use strict';

    console.log('[ArcadeCustom] Step 1+2 v5 loaded');

    // Custom dialogs (Electron doesn't support alert/prompt/confirm)
    function showAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;';
            dialog.innerHTML = '<div style="margin-bottom:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;">' + message + '</div>';
            const btn = document.createElement('button');
            btn.textContent = '确定';
            btn.style.cssText = 'padding:8px 24px;background:#2185d0;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
            btn.onclick = () => { document.body.removeChild(overlay); resolve(); };
            dialog.appendChild(btn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        });
    }

    function showPrompt(message, defaultValue) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;';
            dialog.innerHTML = '<div style="margin-bottom:12px;font-size:14px;">' + message + '</div>';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue || '';
            input.style.cssText = 'width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;margin-bottom:16px;font-size:14px;box-sizing:border-box;';
            dialog.appendChild(input);
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = 'padding:8px 16px;background:#e0e0e0;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
            cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(null); };
            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.style.cssText = 'padding:8px 16px;background:#2185d0;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
            okBtn.onclick = () => { document.body.removeChild(overlay); resolve(input.value); };
            input.onkeydown = (e) => { if (e.key === 'Enter') okBtn.click(); };
            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(okBtn);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            input.focus();
            input.select();
        });
    }

    // ========== Feature 1: Error text selectable + copy button ==========
    function setupErrorCopy() {
        // Force-enable text selection on ALL elements via JS
        function forceSelectable() {
            const all = document.querySelectorAll('*');
            let count = 0;
            all.forEach(function (el) {
                const style = window.getComputedStyle(el);
                if (style.userSelect === 'none' || style.webkitUserSelect === 'none') {
                    el.style.setProperty('user-select', 'text', 'important');
                    el.style.setProperty('-webkit-user-select', 'text', 'important');
                    el.style.setProperty('-moz-user-select', 'text', 'important');
                    el.style.setProperty('-ms-user-select', 'text', 'important');
                    count++;
                }
            });
            return count;
        }

        // Add CSS as well
        const style = document.createElement('style');
        style.textContent = `
            /* Force text selection everywhere */
            *, *::before, *::after {
                user-select: text !important;
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
            }
            /* But keep buttons non-selectable */
            button, button *, .monaco-action-bar, .monaco-action-bar * {
                user-select: none !important;
                -webkit-user-select: none !important;
            }
            /* Error tooltip */
            .monaco-editor-hover, .monaco-editor-hover * {
                user-select: text !important;
                -webkit-user-select: text !important;
            }
        `;
        document.head.appendChild(style);

        // Run immediately and periodically
        var initialCount = forceSelectable();
        console.log('[ArcadeCustom] Force-selectable applied to', initialCount, 'elements');

        setInterval(function () {
            forceSelectable();
        }, 2000);

        // Also add a "Copy All Errors" button to the problems panel header
        function addCopyAllButton() {
            // Find problems panel header
            const headers = document.querySelectorAll('.panel-header, .panel-title, [class*="panel-header"], [class*="problems"]');
            headers.forEach(function (header) {
                if (header.querySelector('.arcade-copy-all-btn')) return;
                const text = header.textContent || '';
                if (text.includes('问题') || text.includes('Problems') || text.includes('错误') || text.includes('存在问题')) {
                    const btn = document.createElement('button');
                    btn.className = 'arcade-copy-all-btn';
                    btn.textContent = '复制全部';
                    btn.style.cssText = 'margin-left:auto;padding:2px 10px;font-size:11px;background:#2185d0;color:#fff;border:none;border-radius:3px;cursor:pointer;';
                    btn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        // Collect all error text
                        const errors = [];
                        document.querySelectorAll('.monaco-list-row, .monaco-tree-row').forEach(function (row) {
                            const rowText = (row.textContent || '').trim();
                            if (rowText && rowText.length > 3 && rowText.length < 500) {
                                // Only include rows that look like errors
                                if (row.querySelector('.error, .warning, [class*="error"], [class*="warning"]') ||
                                    row.classList.contains('error') || row.classList.contains('warning')) {
                                    errors.push(rowText);
                                }
                            }
                        });
                        const text = errors.join('\n');
                        if (text) {
                            navigator.clipboard.writeText(text).then(function () {
                                btn.textContent = '已复制(' + errors.length + ')';
                                setTimeout(function () { btn.textContent = '复制全部'; }, 2000);
                            });
                        } else {
                            btn.textContent = '无错误';
                            setTimeout(function () { btn.textContent = '复制全部'; }, 1500);
                        }
                    });
                    header.style.display = 'flex';
                    header.style.alignItems = 'center';
                    header.appendChild(btn);
                }
            });
        }

        setInterval(addCopyAllButton, 2000);
        console.log('[ArcadeCustom] Error copy feature enabled');
    }

    // ========== Feature 2: FLASH usage estimate ==========
    let memoryBar = null;

    function createMemoryBar() {
        // Remove any existing memory bars first
        const existing = document.getElementById('arcade-memory-bar');
        if (existing) existing.remove();
        memoryBar = document.createElement('div');
        memoryBar.id = 'arcade-memory-bar';
        memoryBar.style.cssText = `
            position: fixed; bottom: 0; left: 0; right: 0; height: 24px;
            background: #252526; color: #ccc; font-family: monospace; font-size: 12px;
            display: flex; align-items: center; padding: 0 12px; z-index: 99999;
            border-top: 1px solid #3c3c3c; gap: 20px;
        `;
        memoryBar.innerHTML = `
            <span id="mem-flash" style="color:#dcdcaa;">FLASH: --</span>
            <span id="mem-ram" style="color:#4ec9b0;">RAM: 256 KB (F412)</span>
            <span id="mem-status" style="color:#808080; margin-left:auto;">就绪</span>
        `;
        document.body.appendChild(memoryBar);
        console.log('[ArcadeCustom] Memory bar created at bottom');
    }

    function formatBytes(bytes) {
        if (bytes == null) return '--';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function updateMemory(flashUsed, flashTotal) {
        createMemoryBar();
        const flashEl = document.getElementById('mem-flash');
        const ramEl = document.getElementById('mem-ram');
        const statusEl = document.getElementById('mem-status');
        console.log('[ArcadeCustom] updateMemory called, flashEl:', flashEl, 'flashUsed:', flashUsed);
        if (flashEl && flashUsed != null) {
            const pct = flashTotal ? ((flashUsed / flashTotal) * 100).toFixed(1) : '?';
            const text = `FLASH: ${formatBytes(flashUsed)} / ${formatBytes(flashTotal)} (${pct}%)`;
            flashEl.textContent = text;
            flashEl.style.color = pct > 80 ? '#f44747' : (pct > 60 ? '#dcdcaa' : '#4ec9b0');
            console.log('[ArcadeCustom] FLASH updated:', text);
        } else {
            console.log('[ArcadeCustom] flashEl not found, recreating...');
            // Force recreate memory bar
            memoryBar = null;
            createMemoryBar();
            const flashEl2 = document.getElementById('mem-flash');
            if (flashEl2 && flashUsed != null) {
                const pct = flashTotal ? ((flashUsed / flashTotal) * 100).toFixed(1) : '?';
                const text = `FLASH: ${formatBytes(flashUsed)} / ${formatBytes(flashTotal)} (${pct}%)`;
                flashEl2.textContent = text;
                flashEl2.style.color = pct > 80 ? '#f44747' : (pct > 60 ? '#dcdcaa' : '#4ec9b0');
                console.log('[ArcadeCustom] FLASH updated after recreate:', text);
            }
        }
        if (ramEl) {
            ramEl.textContent = 'RAM: 256 KB (F412)';
        }
        if (statusEl) {
            statusEl.textContent = '编译完成';
            setTimeout(() => { statusEl.textContent = '就绪'; }, 3000);
        }
    }

    function setupMemoryDisplay() {
        createMemoryBar();

        // Intercept URL.createObjectURL to capture UF2 file size
        const originalCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            try {
                if (blob && blob.size && blob.size > 1000) {
                    console.log('[ArcadeCustom] createObjectURL size:', blob.size, 'type:', blob.type);
                    // UF2 files: each 512-byte block contains 256 bytes of data
                    // So FLASH usage ≈ blob.size / 2
                    if (blob.size > 10000) {
                        const flashUsed = Math.floor(blob.size / 2);
                        const flashTotal = 1024 * 1024; // STM32F412: 1MB Flash
                        console.log('[ArcadeCustom] Estimated FLASH usage:', flashUsed, 'bytes');
                        updateMemory(flashUsed, flashTotal);
                    }
                }
            } catch (e) { }
            return originalCreateObjectURL.apply(this, arguments);
        };

        // Also intercept click on download button
        document.addEventListener('click', function (e) {
            const btn = e.target.closest('button, [role="button"], a');
            if (!btn) return;
            const text = btn.textContent || '';
            if (text.includes('下载') || text.includes('Download')) {
                console.log('[ArcadeCustom] Download clicked, waiting for UF2...');
                const statusEl = document.getElementById('mem-status');
                if (statusEl) statusEl.textContent = '编译中...';
                
                // Poll for UF2 blob creation
                let pollCount = 0;
                const pollInterval = setInterval(() => {
                    pollCount++;
                    if (pollCount > 30) { // 30 seconds timeout
                        clearInterval(pollInterval);
                        return;
                    }
                    // Check if memory bar has been updated
                    const flashEl = document.getElementById('mem-flash');
                    if (flashEl && flashEl.textContent !== 'FLASH: --') {
                        clearInterval(pollInterval);
                    }
                }, 1000);
            }
        }, true);

        // Also try to intercept anchor element clicks for direct downloads
        document.addEventListener('click', function (e) {
            const link = e.target.closest('a[download]');
            if (link && link.href && link.href.startsWith('blob:')) {
                console.log('[ArcadeCustom] Download link clicked:', link.href);
                // Try to fetch the blob to get size
                fetch(link.href).then(r => r.blob()).then(blob => {
                    if (blob.size > 10000) {
                        const flashUsed = Math.floor(blob.size / 2);
                        const flashTotal = 1024 * 1024;
                        updateMemory(flashUsed, flashTotal);
                    }
                }).catch(() => {});
            }
        }, true);

        console.log('[ArcadeCustom] FLASH display enabled (estimate from UF2 size)');
    }

    // ========== Feature 3: Image import ==========
    function setupImageImport() {
        // Get palette at runtime
        function getPalette() {
            // Try to get from pxt.appTarget.runtime.palette
            if (window.pxt && window.pxt.appTarget && window.pxt.appTarget.runtime &&
                window.pxt.appTarget.runtime.palette && window.pxt.appTarget.runtime.palette.length >= 16) {
                const pal = window.pxt.appTarget.runtime.palette.map(c => {
                    const hex = c.replace('#', '');
                    return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
                });
                console.log('[ArcadeCustom] Using runtime palette:', pal);
                return pal;
            }
            // Fallback: MakeCode Arcade default palette (Matte order)
            console.log('[ArcadeCustom] Using default Matte palette');
            return [
                [0, 0, 0],          // 0: black (transparent)
                [0xFF, 0xF1, 0xE8], // 1: white
                [0xFF, 0x00, 0x4D], // 2: red
                [0xFF, 0x77, 0xA8], // 3: pink
                [0xFF, 0xA3, 0x00], // 4: orange
                [0xFF, 0xEC, 0x27], // 5: yellow
                [0x00, 0x87, 0x51], // 6: dark green
                [0x00, 0xE4, 0x36], // 7: green
                [0x29, 0xAD, 0xFF], // 8: blue
                [0xC2, 0xC3, 0xC7], // 9: light gray
                [0x7E, 0x25, 0x53], // a: dark purple
                [0x83, 0x76, 0x9C], // b: purple gray
                [0x5F, 0x57, 0x4F], // c: dark gray
                [0xFF, 0xCC, 0xAA], // d: skin
                [0xAB, 0x52, 0x36], // e: brown
                [0x1D, 0x2B, 0x53]  // f: dark blue
            ];
        }

        const PALETTE = getPalette();

        // img literal characters for each palette index
        const PALETTE_CHARS = ['.', '#', 'T', 't', 'N', 'n', 'G', 'g', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

        function findClosestColor(r, g, b, a) {
            if (a < 128) return 0; // transparent
            let minDist = Infinity;
            let closest = 0;
            for (let i = 1; i < PALETTE.length; i++) {
                const dr = r - PALETTE[i][0];
                const dg = g - PALETTE[i][1];
                const db = b - PALETTE[i][2];
                // Weighted color distance (human eye more sensitive to green)
                const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
                if (dist < minDist) {
                    minDist = dist;
                    closest = i;
                }
            }
            return closest;
        }

        function imageToImgLiteral(imageData, width, height) {
            let result = 'img`\n';
            for (let y = 0; y < height; y++) {
                let row = '';
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = imageData[idx];
                    const g = imageData[idx + 1];
                    const b = imageData[idx + 2];
                    const a = imageData[idx + 3];
                    const colorIdx = findClosestColor(r, g, b, a);
                    row += PALETTE_CHARS[colorIdx];
                    if (x < width - 1) row += ' ';
                }
                result += row + '\n';
            }
            result += '`';
            return result;
        }

        function insertAtCursor(text) {
            // Try to find Monaco editor and insert text
            if (window.monaco && window.monaco.editor) {
                const editors = window.monaco.editor.getEditors();
                if (editors.length > 0) {
                    const editor = editors[0];
                    const selection = editor.getSelection();
                    editor.executeEdits('image-import', [{
                        range: selection,
                        text: text,
                        forceMoveMarkers: true
                    }]);
                    return true;
                }
            }
            // Fallback: use clipboard
            navigator.clipboard.writeText(text).then(() => {
                showAlert('图片代码已复制到剪贴板，请在代码编辑器中粘贴 (Ctrl+V)');
            });
            return false;
        }

        function findAssetManager() {
            // Try pxt.storage first
            if (window.pxt && window.pxt.storage) {
                console.log('[ArcadeCustom] pxt.storage keys:', Object.keys(window.pxt.storage).join(','));
            }

            const root = document.getElementById('root') || document.body;
            const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            if (!fiberKey) {
                console.log('[ArcadeCustom] No React fiber key found');
                return null;
            }

            let found = null;
            let searched = 0;

            function checkObject(obj, path) {
                if (!obj || typeof obj !== 'object' || found) return;
                if (typeof obj.createNewProjectImage === 'function' && typeof obj.getAssetCollection === 'function') {
                    found = obj;
                    console.log('[ArcadeCustom] Found asset manager at:', path);
                    return;
                }
                if (path.split('.').length < 5) {
                    for (const key of Object.keys(obj)) {
                        try {
                            const val = obj[key];
                            if (val && typeof val === 'object' && !val.nodeType && !val.tagName) {
                                checkObject(val, path + '.' + key);
                            }
                        } catch (e) {}
                    }
                }
            }

            function searchFiber(fiber, depth) {
                if (!fiber || found || depth > 100) return;
                searched++;

                if (fiber.memoizedProps) checkObject(fiber.memoizedProps, 'props');
                if (fiber.stateNode) checkObject(fiber.stateNode, 'stateNode');
                if (fiber.memoizedState) {
                    let state = fiber.memoizedState;
                    let idx = 0;
                    while (state && !found) {
                        if (state.memoizedState) checkObject(state.memoizedState, 'state[' + idx + ']');
                        state = state.next;
                        idx++;
                    }
                }
                // Check React context
                if (fiber.dependencies && fiber.dependencies.firstContext) {
                    let ctx = fiber.dependencies.firstContext;
                    let idx = 0;
                    while (ctx && !found) {
                        if (ctx.memoizedValue) checkObject(ctx.memoizedValue, 'context[' + idx + ']');
                        ctx = ctx.next;
                        idx++;
                    }
                }

                let child = fiber.child;
                while (child && !found) {
                    searchFiber(child, depth + 1);
                    child = child.sibling;
                }
            }

            searchFiber(root[fiberKey], 0);
            console.log('[ArcadeCustom] Searched', searched, 'fibers, found:', !!found);
            return found;
        }

        function pngToBitmap(imageData, width, height) {
            // Use pxt.sprite.Bitmap if available for correct 4-bit packing
            if (window.pxt && window.pxt.sprite && window.pxt.sprite.Bitmap) {
                const bmp = new window.pxt.sprite.Bitmap(width, height);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const r = imageData[idx];
                        const g = imageData[idx + 1];
                        const b = imageData[idx + 2];
                        const a = imageData[idx + 3];
                        const colorIdx = findClosestColor(r, g, b, a);
                        bmp.set(x, y, colorIdx);
                    }
                }
                return bmp.data();
            }
            // Fallback: 4-bit packed, row-major
            const buf = new Uint8ClampedArray(Math.ceil(width * height / 2));
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = imageData[idx];
                    const g = imageData[idx + 1];
                    const b = imageData[idx + 2];
                    const a = imageData[idx + 3];
                    const colorIdx = findClosestColor(r, g, b, a);
                    const pixelIdx = x + y * width;
                    const byteIdx = Math.floor(pixelIdx / 2);
                    if (pixelIdx % 2 === 0) {
                        buf[byteIdx] = (buf[byteIdx] & 0xF0) | (colorIdx & 0x0F);
                    } else {
                        buf[byteIdx] = (buf[byteIdx] & 0x0F) | ((colorIdx & 0x0F) << 4);
                    }
                }
            }
            return { width: width, height: height, data: buf };
        }

        function importToAssets(bitmapData, displayName) {
            try {
                // Debug: list pxt APIs
                if (window.pxt) {
                    console.log('[ArcadeCustom] pxt keys:', Object.keys(window.pxt).join(','));
                    if (window.pxt.editor) {
                        console.log('[ArcadeCustom] pxt.editor keys:', Object.keys(window.pxt.editor).join(','));
                    }
                    if (window.pxt.workspace) {
                        console.log('[ArcadeCustom] pxt.workspace keys:', Object.keys(window.pxt.workspace).join(','));
                    }
                }

                const assetManager = findAssetManager();
                if (!assetManager) {
                    console.log('[ArcadeCustom] Asset manager not found, falling back to code insert');
                    return false;
                }
                console.log('[ArcadeCustom] Asset manager found!');

                // bitmapData is already in correct format from pngToBitmap
                const asset = assetManager.createNewProjectImage(bitmapData, displayName);
                console.log('[ArcadeCustom] Asset created:', asset);

                // Trigger UI refresh
                if (assetManager.onChange) assetManager.onChange();

                // Notify listeners
                if (assetManager.listeners) {
                    console.log('[ArcadeCustom] Notifying', assetManager.listeners.length, 'listeners');
                    assetManager.listeners.forEach(l => {
                        if (l.callback) try { l.callback(); } catch (e) {}
                    });
                }

                // Force React re-render by dispatching a custom event
                window.dispatchEvent(new CustomEvent('asset-updated'));

                // Also try to find and refresh the asset editor component
                setTimeout(() => {
                    const assetGrid = document.querySelector('[class*="asset"], [class*="Asset"]');
                    if (assetGrid) {
                        console.log('[ArcadeCustom] Found asset grid, forcing refresh');
                    }
                }, 100);

                return true;
            } catch (e) {
                console.log('[ArcadeCustom] Import to assets failed:', e);
                return false;
            }
        }

        async function handleFile(file) {
            if (!file.type.startsWith('image/')) {
                await showAlert('请选择图片文件 (PNG/JPG)');
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = async function () {
                    let w = img.width;
                    let h = img.height;
                    const maxW = 320, maxH = 240;
                    if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.floor(w * ratio);
                        h = Math.floor(h * ratio);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const imageData = ctx.getImageData(0, 0, w, h);

                    const bitmapData = pngToBitmap(imageData.data, w, h);
                    const name = file.name.replace(/\.[^/.]+$/, '');

                    // Try to import to assets first
                    if (importToAssets(bitmapData, name)) {
                        await showAlert('图片已导入到资产中！请切换到"资源"标签查看。');
                    } else {
                        // Fallback: insert as img literal
                        const imgLiteral = imageToImgLiteral(imageData.data, w, h);
                        insertAtCursor(imgLiteral);
                    }
                };
                img.onerror = async function () {
                    await showAlert('图片加载失败');
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // Animation import: load multiple images as frames
        function loadImageAsBitmap(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = new Image();
                    img.onload = function () {
                        let w = img.width;
                        let h = img.height;
                        const maxW = 320, maxH = 240;
                        if (w > maxW || h > maxH) {
                            const ratio = Math.min(maxW / w, maxH / h);
                            w = Math.floor(w * ratio);
                            h = Math.floor(h * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        const imageData = ctx.getImageData(0, 0, w, h);
                        resolve(pngToBitmap(imageData.data, w, h));
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        async function handleAnimationFiles(files) {
            if (files.length < 2) {
                await showAlert('请选择至少2张图片作为动画帧');
                return;
            }

            // Sort by filename
            const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            // Ask for frame interval
            const intervalStr = await showPrompt('请输入帧间隔（毫秒），默认 200ms：', '200');
            if (intervalStr === null) return;
            const interval = parseInt(intervalStr) || 200;

            try {
                await showAlert('正在导入 ' + sortedFiles.length + ' 帧动画...');
                const frames = [];
                for (let i = 0; i < sortedFiles.length; i++) {
                    const bmp = await loadImageAsBitmap(sortedFiles[i]);
                    frames.push(bmp);
                }

                const assetManager = findAssetManager();
                if (!assetManager || !assetManager.createNewAnimationFromData) {
                    await showAlert('动画导入失败：找不到资产管理器');
                    return;
                }

                const baseName = sortedFiles[0].name.replace(/\.[^/.]+$/, '').replace(/[_\-]?\d+$/, '');
                const animName = baseName + '_anim';
                const asset = assetManager.createNewAnimationFromData(frames, interval, animName);
                console.log('[ArcadeCustom] Animation created:', asset);

                if (assetManager.onChange) assetManager.onChange();
                await showAlert('动画已导入！共 ' + frames.length + ' 帧，间隔 ' + interval + 'ms。请在"资源"标签查看。');
            } catch (e) {
                console.error('[ArcadeCustom] Animation import failed:', e);
                await showAlert('动画导入失败：' + e.message);
            }
        }

        // Create floating import button
        const btn = document.createElement('button');
        btn.id = 'arcade-import-btn';
        btn.textContent = '导入图片';
        btn.style.cssText = `
            position: fixed; top: 60px; right: 20px; z-index: 10001;
            padding: 8px 16px; background: #2185d0; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        btn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/jpg,image/bmp';
            input.addEventListener('change', function (e) {
                if (e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                }
            });
            input.click();
        });
        document.body.appendChild(btn);

        // Create animation import button
        const animBtn = document.createElement('button');
        animBtn.id = 'arcade-import-anim-btn';
        animBtn.textContent = '导入动画';
        animBtn.style.cssText = `
            position: fixed; top: 60px; right: 110px; z-index: 10001;
            padding: 8px 16px; background: #f2711c; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        animBtn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/jpg,image/bmp';
            input.multiple = true;
            input.addEventListener('change', function (e) {
                if (e.target.files.length > 0) {
                    handleAnimationFiles(e.target.files);
                }
            });
            input.click();
        });
        document.body.appendChild(animBtn);

        // SB3 (Scratch 3.0) import
        async function loadJSZip() {
            if (window.JSZip) {
                console.log('[ArcadeCustom] JSZip already loaded');
                return window.JSZip;
            }
            return new Promise((resolve, reject) => {
                // Try multiple CDNs for reliability
                const cdns = [
                    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
                    'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
                ];
                let idx = 0;
                function tryNext() {
                    if (idx >= cdns.length) {
                        reject(new Error('无法加载JSZip库，请检查网络连接'));
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = cdns[idx++];
                    script.onload = () => {
                        if (window.JSZip) {
                            console.log('[ArcadeCustom] JSZip loaded from:', script.src);
                            resolve(window.JSZip);
                        } else {
                            console.log('[ArcadeCustom] JSZip not found after load, trying next CDN...');
                            tryNext();
                        }
                    };
                    script.onerror = () => {
                        console.log('[ArcadeCustom] CDN failed:', script.src, 'trying next...');
                        tryNext();
                    };
                    document.head.appendChild(script);
                }
                tryNext();
            });
        }

        async function loadImageFromBlob(blob, format) {
            return new Promise((resolve, reject) => {
                // Set correct MIME type based on format
                let mimeType = blob.type;
                if (!mimeType || mimeType === '') {
                    if (format === 'svg') mimeType = 'image/svg+xml';
                    else if (format === 'png') mimeType = 'image/png';
                    else if (format === 'jpg' || format === 'jpeg') mimeType = 'image/jpeg';
                    else if (format === 'gif') mimeType = 'image/gif';
                    else if (format === 'bmp') mimeType = 'image/bmp';
                    else mimeType = 'image/png';
                }
                const typedBlob = mimeType === blob.type ? blob : new Blob([blob], { type: mimeType });
                const url = URL.createObjectURL(typedBlob);
                console.log('[ArcadeCustom] Loading image, format:', format, 'size:', typedBlob.size, 'type:', mimeType);
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed: ' + format + ' ' + typedBlob.size + 'bytes')); };
                img.src = url;
            });
        }

        async function handleSB3File(file) {
            try {
                await loadJSZip();
                const JSZip = window.JSZip;
                if (!JSZip) throw new Error('JSZip未加载成功');
                const zip = await JSZip.loadAsync(file);
                const projectJson = JSON.parse(await zip.file('project.json').async('string'));

                // Collect all costumes from all sprites
                const allCostumes = [];
                for (const target of projectJson.targets) {
                    for (const costume of target.costumes) {
                        allCostumes.push({
                            sprite: target.name,
                            name: costume.name,
                            filename: costume.md5ext || costume.assetId + '.' + costume.dataFormat,
                            format: costume.dataFormat
                        });
                    }
                }

                if (allCostumes.length === 0) {
                    await showAlert('SB3 文件中没有找到图片素材');
                    return;
                }

                // Ask user which sprites to import
                const spriteNames = [...new Set(allCostumes.map(c => c.sprite))];
                // Count costumes per sprite
                const spriteInfo = spriteNames.map(name => {
                    const count = allCostumes.filter(c => c.sprite === name).length;
                    return name + ' (' + count + '个造型)';
                });

                let selectedSprites = [spriteNames[0]];
                if (spriteNames.length > 1) {
                    const choice = await showPrompt(
                        '找到 ' + spriteNames.length + ' 个角色。\n\n' +
                        '请输入要导入的角色名称（多个角色用逗号分隔），\n' +
                        '或输入"全部"导入所有角色：\n\n' +
                        spriteInfo.join('；\n'),
                        spriteNames[0]
                    );
                    if (!choice) {
                        await showAlert('已取消');
                        return;
                    }
                    const trimmed = choice.trim();
                    if (trimmed === '全部' || trimmed === 'all' || trimmed === '*') {
                        selectedSprites = spriteNames;
                    } else {
                        selectedSprites = trimmed.split(/[,，;；]/).map(s => s.trim()).filter(s => spriteNames.includes(s));
                    }
                    if (selectedSprites.length === 0) {
                        await showAlert('未找到匹配的角色');
                        return;
                    }
                }

                const assetManager = findAssetManager();
                if (!assetManager) {
                    await showAlert('找不到资产管理器');
                    return;
                }

                // Ask for frame interval once for all animations
                let interval = 200;
                const hasMultiFrame = selectedSprites.some(name =>
                    allCostumes.filter(c => c.sprite === name).length > 1
                );
                if (hasMultiFrame) {
                    const intervalStr = await showPrompt('请输入动画帧间隔（毫秒），默认 200ms：', '200');
                    if (intervalStr === null) return;
                    interval = parseInt(intervalStr) || 200;
                }

                await showAlert('正在导入 ' + selectedSprites.length + ' 个角色...');

                // Import each sprite
                const results = [];
                for (const spriteName of selectedSprites) {
                    const costumes = allCostumes.filter(c => c.sprite === spriteName);
                    const frames = [];
                    const failed = [];

                    for (const costume of costumes) {
                        const fileEntry = zip.file(costume.filename);
                        if (!fileEntry) {
                            failed.push(costume.name + ' (文件不存在)');
                            continue;
                        }
                        const blob = await fileEntry.async('blob');
                        try {
                            const img = await loadImageFromBlob(blob, costume.format);
                            let w = img.width, h = img.height;
                            const maxW = 320, maxH = 240;
                            if (w > maxW || h > maxH) {
                                const ratio = Math.min(maxW / w, maxH / h);
                                w = Math.floor(w * ratio);
                                h = Math.floor(h * ratio);
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            const imageData = ctx.getImageData(0, 0, w, h);
                            frames.push(pngToBitmap(imageData.data, w, h));
                        } catch (e) {
                            console.log('[ArcadeCustom] Failed to load costume:', costume.name, e);
                            failed.push(costume.name + ' (' + costume.format + ')');
                        }
                    }

                    if (frames.length > 0) {
                        if (frames.length === 1) {
                            assetManager.createNewProjectImage(frames[0], spriteName);
                            results.push(spriteName + ': 图片 (' + frames.length + '帧)' + (failed.length > 0 ? ', 失败' + failed.length : ''));
                        } else {
                            assetManager.createNewAnimationFromData(frames, interval, spriteName + '_anim');
                            results.push(spriteName + ': 动画 (' + frames.length + '帧)' + (failed.length > 0 ? ', 失败' + failed.length : ''));
                        }
                    } else {
                        results.push(spriteName + ': 全部失败 (' + failed.length + '个)');
                    }
                }

                if (assetManager.onChange) assetManager.onChange();
                await showAlert('导入完成！\n\n' + results.join('\n'));
            } catch (e) {
                console.error('[ArcadeCustom] SB3 import failed:', e);
                await showAlert('SB3 导入失败：' + e.message);
            }
        }

        // Create SB3 import button
        const sb3Btn = document.createElement('button');
        sb3Btn.id = 'arcade-import-sb3-btn';
        sb3Btn.textContent = '导入SB3';
        sb3Btn.style.cssText = `
            position: fixed; top: 60px; right: 200px; z-index: 10001;
            padding: 8px 16px; background: #21ba45; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        sb3Btn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.sb3';
            input.addEventListener('change', function (e) {
                if (e.target.files.length > 0) {
                    handleSB3File(e.target.files[0]);
                }
            });
            input.click();
        });
        document.body.appendChild(sb3Btn);

        // GIF import
        let GIF = null;
        async function loadGIFLibrary() {
            if (GIF) return GIF;
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/dist/gifuct-js.min.js';
                script.onload = () => { GIF = window.gifuct; resolve(GIF); };
                script.onerror = () => {
                    // Try alternative library
                    const script2 = document.createElement('script');
                    script2.src = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js';
                    script2.onload = () => { GIF = window.GIF; resolve(GIF); };
                    script2.onerror = reject;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script);
            });
        }

        async function handleGIFFile(file) {
            try {
                await loadGIFLibrary();
                const buffer = await file.arrayBuffer();
                const gif = GIF.parseGIF(buffer);
                const frames = GIF.decompressFrames(gif, true);

                if (!frames || frames.length === 0) {
                    await showAlert('GIF 文件中没有找到帧');
                    return;
                }

                const intervalStr = await showPrompt('GIF 共 ' + frames.length + ' 帧，请输入帧间隔（毫秒），默认 100ms：', '100');
                if (intervalStr === null) return;
                const interval = parseInt(intervalStr) || 100;

                await showAlert('正在导入 ' + frames.length + ' 帧 GIF 动画...');

                const bitmaps = [];
                for (let i = 0; i < frames.length; i++) {
                    const frame = frames[i];
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.dims.width;
                    canvas.height = frame.dims.height;
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.createImageData(frame.dims.width, frame.dims.height);
                    imageData.data.set(frame.patch);
                    ctx.putImageData(imageData, 0, 0);

                    let w = canvas.width, h = canvas.height;
                    const maxW = 320, maxH = 240;
                    if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.floor(w * ratio);
                        h = Math.floor(h * ratio);
                        const scaled = document.createElement('canvas');
                        scaled.width = w;
                        scaled.height = h;
                        scaled.getContext('2d').drawImage(canvas, 0, 0, w, h);
                        const scaledData = scaled.getContext('2d').getImageData(0, 0, w, h);
                        bitmaps.push(pngToBitmap(scaledData.data, w, h));
                    } else {
                        bitmaps.push(pngToBitmap(imageData.data, canvas.width, canvas.height));
                    }
                }

                const assetManager = findAssetManager();
                if (!assetManager || !assetManager.createNewAnimationFromData) {
                    await showAlert('GIF 导入失败：找不到资产管理器');
                    return;
                }

                const name = file.name.replace(/\.[^/.]+$/, '');
                assetManager.createNewAnimationFromData(bitmaps, interval, name + '_anim');
                if (assetManager.onChange) assetManager.onChange();
                await showAlert('GIF 动画已导入！共 ' + bitmaps.length + ' 帧，间隔 ' + interval + 'ms。');
            } catch (e) {
                console.error('[ArcadeCustom] GIF import failed:', e);
                await showAlert('GIF 导入失败：' + e.message + '\n\n提示：GIF 导入需要联网加载解析库。');
            }
        }

        // Create GIF import button
        const gifBtn = document.createElement('button');
        gifBtn.id = 'arcade-import-gif-btn';
        gifBtn.textContent = '导入GIF';
        gifBtn.style.cssText = `
            position: fixed; top: 60px; right: 280px; z-index: 10001;
            padding: 8px 16px; background: #a333c8; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        gifBtn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.gif,image/gif';
            input.addEventListener('change', function (e) {
                if (e.target.files.length > 0) {
                    handleGIFFile(e.target.files[0]);
                }
            });
            input.click();
        });
        document.body.appendChild(gifBtn);

        // MIDI import
        let MidiParser = null;
        async function loadMidiLibrary() {
            if (MidiParser) return MidiParser;
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/build/Midi.js';
                script.onload = () => {
                    // @tonejs/midi exports { Midi, Track, Header }
                    MidiParser = window.Midi?.Midi || window.Midi;
                    resolve(MidiParser);
                };
                script.onerror = () => {
                    const script2 = document.createElement('script');
                    script2.src = 'https://cdn.jsdelivr.net/npm/midi-parser-js@0.3.10/src/main.js';
                    script2.onload = () => { MidiParser = window.MidiParser; resolve(MidiParser); };
                    script2.onerror = reject;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script);
            });
        }

        // MIDI note number to frequency
        function midiNoteToFreq(note) {
            return 440 * Math.pow(2, (note - 69) / 12);
        }

        async function handleMIDIFile(file) {
            try {
                await loadMidiLibrary();
                const arrayBuffer = await file.arrayBuffer();
                const midi = new MidiParser(arrayBuffer);

                console.log('[ArcadeCustom] MIDI parsed:', midi);

                // Convert to MakeCode Arcade song format
                // IMPORTANT: MakeCode stores ticksPerBeat as a single byte (max 255).
                // MIDI files often use 480 PPQN which gets truncated to 224, causing slow playback.
                // Standard MakeCode songs use 8 ticks/beat, so we convert all note timings.
                const midiTicksPerBeat = midi.header.ticksPerBeat || 480;
                const ticksPerBeat = 8; // MakeCode Arcade standard (matches editor-created songs)
                const tickScale = ticksPerBeat / midiTicksPerBeat;
                const bpm = midi.header.tempos && midi.header.tempos.length > 0
                    ? Math.round(midi.header.tempos[0].bpm) : 120;

                // MIDI instrument to MakeCode waveform mapping
                // 0=sine, 1=square, 2=sawtooth, 3=triangle, 4=noise
                function getWaveformForInstrument(instNum, isPercussion) {
                    if (isPercussion) return 4; // noise for drums
                    // Piano, organ, guitar -> square
                    if (instNum >= 0 && instNum <= 7) return 1;
                    if (instNum >= 19 && instNum <= 31) return 1; // guitar
                    // Bass -> square (lower octave)
                    if (instNum >= 32 && instNum <= 39) return 1;
                    // Strings, ensemble -> sawtooth
                    if (instNum >= 40 && instNum <= 55) return 2;
                    // Brass -> sawtooth
                    if (instNum >= 56 && instNum <= 63) return 2;
                    // Reed, pipe -> triangle
                    if (instNum >= 64 && instNum <= 79) return 3;
                    // Synth leads -> square
                    if (instNum >= 80 && instNum <= 87) return 1;
                    // Synth pads -> sawtooth
                    if (instNum >= 88 && instNum <= 95) return 2;
                    // Ethnic -> triangle
                    if (instNum >= 104 && instNum <= 111) return 3;
                    // Percussive (tubular bells, etc) -> sine
                    if (instNum >= 14 && instNum <= 18) return 0;
                    return 1; // default square
                }

                function getOctaveForInstrument(instNum, isPercussion) {
                    if (isPercussion) return 4;
                    if (instNum >= 32 && instNum <= 39) return 2; // bass lower
                    if (instNum >= 40 && instNum <= 55) return 3; // strings
                    return 4; // default
                }

                const tracks = [];
                let trackId = 0;
                for (const track of midi.tracks) {
                    if (!track.notes || track.notes.length === 0) continue;

                    const isPercussion = track.channel === 9;
                    const instNum = track.instrument?.number || 0;
                    const waveform = getWaveformForInstrument(instNum, isPercussion);
                    const octave = getOctaveForInstrument(instNum, isPercussion);

                    // Group notes by start tick (chords)
                    // Scale tick values from MIDI PPQN to MakeCode ticksPerBeat
                    const noteGroups = {};
                    for (const note of track.notes) {
                        const startTick = Math.round((note.ticks || 0) * tickScale);
                        const endTick = startTick + Math.round((note.durationTicks || Math.round(note.duration * midiTicksPerBeat)) * tickScale);
                        if (!noteGroups[startTick]) {
                            noteGroups[startTick] = { startTick, endTick, notes: [] };
                        }
                        // For percussion, keep original note (drum type)
                        // For melodic, adjust octave if needed
                        let noteNum = note.midi;
                        if (!isPercussion && octave !== 4) {
                            noteNum = noteNum + (octave - 4) * 12;
                        }
                        noteGroups[startTick].notes.push({
                            note: noteNum,
                            enharmonicSpelling: "normal"
                        });
                        if (endTick > noteGroups[startTick].endTick) {
                            noteGroups[startTick].endTick = endTick;
                        }
                    }

                    const sortedNotes = Object.values(noteGroups).sort((a, b) => a.startTick - b.startTick);

                    // Skip percussion tracks with too few notes or convert to noise track
                    if (isPercussion && sortedNotes.length < 10) continue;

                    tracks.push({
                        id: trackId++,
                        name: track.name || ('Track ' + trackId),
                        notes: sortedNotes,
                        instrument: {
                            waveform: waveform,
                            octave: octave,
                            ampEnvelope: {
                                attack: isPercussion ? 1 : 5,
                                decay: isPercussion ? 50 : 50,
                                sustain: isPercussion ? 0 : 200,
                                release: isPercussion ? 20 : 50,
                                amplitude: 1024
                            }
                        }
                    });
                }

                // Limit to max 16 tracks (matches hardware MAX_SOUNDS)
                if (tracks.length > 16) {
                    // Keep tracks with most notes
                    tracks.sort((a, b) => b.notes.length - a.notes.length);
                    tracks.length = 16;
                    // Reassign ids
                    tracks.forEach((t, i) => t.id = i);
                }

                if (tracks.length === 0) {
                    await showAlert('MIDI 文件中没有找到音符');
                    return;
                }

                // Calculate measures from total duration
                let maxTime = 0;
                for (const track of midi.tracks) {
                    if (track.notes && track.notes.length > 0) {
                        const lastNote = track.notes[track.notes.length - 1];
                        const endTime = (lastNote.time || 0) + (lastNote.duration || 0);
                        if (endTime > maxTime) maxTime = endTime;
                    }
                }
                const beatSeconds = 60 / bpm;
                const measures = Math.max(1, Math.ceil(maxTime / (beatSeconds * 4)));

                const songData = {
                    beatsPerMinute: bpm,
                    beatsPerMeasure: 4,
                    ticksPerBeat: ticksPerBeat,
                    measures: measures,
                    tracks: tracks
                };

                console.log('[ArcadeCustom] Song data:', songData);

                const assetManager = findAssetManager();
                if (!assetManager || !assetManager.createNewSong) {
                    await showAlert('MIDI 导入失败：找不到资产管理器');
                    return;
                }

                const name = file.name.replace(/\.[^/.]+$/, '');
                assetManager.createNewSong(songData, name);
                if (assetManager.onChange) assetManager.onChange();

                const totalNotes = tracks.reduce((sum, t) => sum + t.notes.length, 0);
                await showAlert('MIDI 已导入！\n\n' +
                    '名称：' + name + '\n' +
                    'BPM：' + bpm + '\n' +
                    '音轨：' + tracks.length + '\n' +
                    '音符总数：' + totalNotes);
            } catch (e) {
                console.error('[ArcadeCustom] MIDI import failed:', e);
                await showAlert('MIDI 导入失败：' + e.message + '\n\n提示：MIDI 导入需要联网加载解析库。');
            }
        }

        // Create MIDI import button
        const midiBtn = document.createElement('button');
        midiBtn.id = 'arcade-import-midi-btn';
        midiBtn.textContent = '导入MIDI';
        midiBtn.style.cssText = `
            position: fixed; top: 60px; right: 360px; z-index: 10001;
            padding: 8px 16px; background: #db2828; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        midiBtn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mid,.midi,audio/midi';
            input.addEventListener('change', function (e) {
                if (e.target.files.length > 0) {
                    handleMIDIFile(e.target.files[0]);
                }
            });
            input.click();
        });
        document.body.appendChild(midiBtn);

        // Also support drag and drop
        document.addEventListener('dragover', function (e) {
            e.preventDefault();
        });
        document.addEventListener('drop', function (e) {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        console.log('[ArcadeCustom] Image import enabled (button top-right, drag-drop also supported)');
    }

    function init() {
        setupErrorCopy();
        setupMemoryDisplay();
        setupImageImport();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ============================================================
 * [TMXImport] Tiled 瓦片地图导入（.tmx/.tsx/.tmj/.tsj + PNG → 资产）
 * 合并版 v8.9 —— 2026-10-08
 *   v8.9: 图片/动画缩放对话框升级：新增「高度」输入框 + 「保持宽高比」
 *         checkbox（默认勾选，改一边自动换算另一边；取消可自由指定宽高）
 *         + 「精灵尺寸」快捷按钮 16×16/32×32/64×64/128×128（点击自动解锁等比，
 *         直接固定像素，适配游戏精灵网格）。
 *   v8.8: 导入图片 / 导入动画 增加像素缩放选择（覆盖方案，不动前 1294 行基线）：
 *         克隆替换「导入图片」「导入动画」按钮 + capture 阶段拦截拖拽 →
 *         弹缩放对话框（原尺寸 + 目标宽度输入 + 等比快捷按钮）→
 *         面积平均 box 滤波重采样（保留像素风与细线）→ 复用 findAssetManager 写资产。
 *   v8.7: 碰撞图层多选。导入对话框「导入碰撞」下新增碰撞图层清单
 *         （按 Tiled 面板序从上到下，多选 checkbox）：选中图层的非空
 *         格子（翻转标志剥离后 gid≠0）→ 碰撞值 2=TM_WALL；与图块属性
 *         方案并存取并集。解决真实素材 tsx 无 collision/solid 图块属性、
 *         碰撞信息在图层（land=地砖水管 / wall=金币问号）时导入 0 格的问题。
 *   v8.6: ①翻转位烘焙（gid 高位 H/V/D 标志 → 像素变换 → 烘焙瓦片，
 *         组合顺序 D→H→V，bit29 已清除）②多 tileset 集合（tsx image
 *         source 文件名 ↔ PNG 文件名自动匹配）③碰撞导入（图块属性
 *         collision/solid → 2=TM_WALL，写入 layers.data；UI 可选、默认勾选）
 *   v8.5: 背景色填充（覆盖>50%背景 gid → 地图用到的瓦片透明像素填背景色）
 *   v8.4: 修复 gid>255 截断（merged 改 Uint16Array）
 *   v8.3: tileset 对齐改为按创建顺序映射
 *   依赖注入功能均引用上方模块作用域（window/document/URL/DOMParser/pxt）
 * ============================================================ */
/**
 * TMXImport Inject - 编辑器"导入 Tiled 地图"功能
 * 注入方式：合并进 resources/app/inject/inject.js（main.js executeJavaScript 注入主页面）
 * 功能：选择 .tmx/.tmj(+.tsx/.tsj+.png) → 转换 → 写入资产管理器（瓦片 + 地图）
 */
(function () {
    'use strict';

    /* ===== tile-palette 崩溃防御（官方 bug 修复，v8.1）=====
     * 现象：打开/引用 tileWidth ≠ 16 的地图（如导入后 32px/40px）时编辑器卡死，
     *       TypeError: Cannot read properties of undefined (reading 'id') @ b.render
     * 根因（main.js tile-palette 组件）：render 里 Dropdown 的 selectedId 取 C[category].id，
     *       而 categories 经 refreshGallery 按 t.tileWidth === tileset.tileWidth 过滤，
     *       内置 Gallery 瓦片 tileWidth 硬编码 16 → 32px/40px 地图时 4 个内置分类全空 → C=[] → C[0].id 崩溃。
     * 修复：Array.prototype.filter 保底——当过滤结果为空且源是 tile-palette 的 BUILTIN_CATEGORIES
     *       （首元素为 forest/aquatic/dungeon/misc 分类结构）时，保底返回首个分类，避免越界崩溃；
     *       16px 地图（分类有瓦片）不受影响，原有功能不变。
     */
    try {
        const origFilter = Array.prototype.filter;
        Array.prototype.filter = function (cb, thisArg) {
            const res = origFilter.call(this, cb, thisArg);
            if (res.length === 0 && this.length > 0) {
                const first = this[0];
                if (first && typeof first === 'object' &&
                    (first.id === 'forest' || first.id === 'aquatic' || first.id === 'dungeon' || first.id === 'misc') &&
                    Array.isArray(first.tiles) && typeof first.text === 'string') {
                    return this.slice(0, 1);
                }
            }
            return res;
        };
        console.log('[TMXImport] tile-palette 崩溃防御已启用（非16px地图 + Gallery）');
    } catch (e) {
        console.warn('[TMXImport] filter 补丁失败:', e && e.message);
    }

    /* ========== 转换核心（tmx-import-core.js 移植，浏览器版） ========== */
    const PALETTE = [
        [0, 0, 0], [255, 255, 255], [255, 33, 33], [255, 147, 196],
        [255, 129, 53], [255, 246, 9], [36, 156, 163], [120, 220, 82],
        [0, 63, 173], [135, 242, 255], [142, 46, 196], [164, 131, 159],
        [92, 64, 108], [229, 205, 196], [145, 70, 61], [0, 0, 0]
    ];

    /* ===== v8.6 Tiled GID 翻转标志（官方 Global Tile IDs） =====
     * 0x80000000 = H（水平翻转）  0x40000000 = V（垂直翻转）
     * 0x20000000 = D（对角翻转，x/y 轴交换）  0x10000000 = hex 旋转（正交地图忽略但必须清掉）
     * 组合应用顺序（官方文档）：D 先 → H → V。逆变换按 V→H→D 反推。 */
    const FLIP_H = 0x80000000, FLIP_V = 0x40000000, FLIP_D = 0x20000000, FLIP_HEX = 0x10000000;
    const GID_MASK = 0x0FFFFFFF;

    function parseGid(raw) {
        let flip = 0;
        if (raw & FLIP_H) flip |= 1;
        if (raw & FLIP_V) flip |= 2;
        if (raw & FLIP_D) flip |= 4;
        return { gid: raw & GID_MASK, flip };
    }

    function flipSrc(flip, w, x, y) {
        let px = x, py = y;
        if (flip & 2) py = w - 1 - py;                    // 撤销 V
        if (flip & 1) px = w - 1 - px;                    // 撤销 H
        if (flip & 4) { const t = px; px = py; py = t; }  // 撤销 D
        return [px, py];
    }

    function baseName(name) {
        if (!name) return "";
        const base = String(name).replace(/\\/g, "/").split("/").pop() || "";
        const dot = base.lastIndexOf(".");
        return dot > 0 ? base.slice(0, dot) : base;
    }

    function f4EncodeImg(w, h, getPix) {
        const bytes = [0x87, 4, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0, 0];
        let ptr = 4, curr = 0, shift = 0;
        const pushBits = (n) => {
            curr |= (n & 0xf) << shift;
            if (shift === 4) { bytes.push(curr & 0xff); ptr++; curr = 0; shift = 0; }
            else shift += 4;
        };
        for (let i = 0; i < w; ++i) {
            for (let j = 0; j < h; ++j) pushBits(getPix(i, j));
            while (shift !== 0) pushBits(0);
            while (ptr & 3) pushBits(0);
        }
        return bytes;
    }

    function nearestColor(r, g, b, a) {
        if (a < 128) return 0;
        let best = 1, bestD = Infinity;
        for (let i = 1; i < 16; i++) {
            const dr = r - PALETTE[i][0], dg = g - PALETTE[i][1], db = b - PALETTE[i][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    function bytesToBase64(bytes) {
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK)
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        return btoa(bin);
    }

    function uint8ArrayToHex(bytes) {
        const HEX = "0123456789abcdef";
        let res = "";
        for (let i = 0; i < bytes.length; i++) {
            res += HEX[bytes[i] >> 4];
            res += HEX[bytes[i] & 0xf];
        }
        return res;
    }

    async function decodeTileData(text, enc, comp) {
        if (enc === "csv" || (!enc && !comp)) {
            const gids = text.split(/[\s,]+/).filter(s => s !== "").map(Number);
            return gids.length ? gids : null;
        }
        if (enc === "base64") {
            let raw = atob(text.trim());
            let bytes;
            if (comp) {
                const fmt = comp === "zlib" ? "deflate" : comp;
                const inBytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) inBytes[i] = raw.charCodeAt(i);
                const ds = new DecompressionStream(fmt);
                const stream = new Blob([inBytes]).stream().pipeThrough(ds);
                bytes = new Uint8Array(await new Response(stream).arrayBuffer());
            } else {
                bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            }
            const gids = [];
            for (let i = 0; i + 3 < bytes.length; i += 4)
                gids.push(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
            if (gids.length) return gids;
        }
        return null;
    }

    async function parseLayerEl(l, w, h) {
        const name = l.getAttribute("name") || "layer";
        const dataEl = l.querySelector("data");
        if (!dataEl) return { name, gids: null, reason: "无 <data>" };
        const enc = dataEl.getAttribute("encoding");
        const comp = dataEl.getAttribute("compression");
        const chunks = dataEl.querySelectorAll("chunk");
        if (chunks.length) {
            let gids = (w && h) ? new Array(w * h).fill(0) : null;
            for (const c of chunks) {
                const cx = parseInt(c.getAttribute("x")), cy = parseInt(c.getAttribute("y"));
                const cw = parseInt(c.getAttribute("width")), chh = parseInt(c.getAttribute("height"));
                const cg = await decodeTileData(c.textContent, enc, comp);
                if (!cg) continue;
                for (let j = 0; j < chh; j++)
                    for (let i = 0; i < cw; i++) {
                        const gx = cx + i, gy = cy + j;
                        if (gids && gx >= 0 && gy >= 0 && gx < w && gy < h) gids[gy * w + gx] = cg[j * cw + i];
                    }
            }
            if (gids && gids.some(v => v !== 0)) return { name, gids };
            return { name, gids, reason: "chunk 全空" };
        }
        const gids = await decodeTileData(dataEl.textContent, enc, comp);
        if (gids && (!w || !h || gids.length === w * h)) return { name, gids };
        return { name, gids, reason: "数据长度 " + (gids ? gids.length : 0) + " ≠ " + w + "x" + h };
    }

    async function collectLayers(root, w, h) {
        const out = [], diag = [];
        const walk = async (el) => {
            for (const child of el.children) {
                if (child.tagName === "group") { await walk(child); continue; }
                if (child.tagName === "layer") {
                    const r = await parseLayerEl(child, w, h);
                    if (r.gids && r.gids.length) out.push({ name: r.name, gids: r.gids });
                    else diag.push("图层 '" + r.name + "' 跳过（" + r.reason + "）");
                }
            }
        };
        await walk(root);
        return { layers: out, diag };
    }

    /* ===== v8.6 tsx/tsj 解析（多 tileset + 图块属性） ===== */

    /** 解析 tsx/tsj 图块自定义属性：<tile id="N"><properties><property name="collision".../>
     * 属性名支持 collision / solid（bool→true；int→数值；string→字符串值）。
     * @returns {Map<number, boolean|number|string>} localId → 属性值 */
    function parseTileProps(tsText) {
        const props = new Map();
        if (!tsText) return props;
        const t = String(tsText).trim();
        if (!t) return props;
        try {
            if (t.startsWith("{")) {
                const j = JSON.parse(t);
                for (const tile of j.tiles || []) {
                    const id = parseInt(tile.id, 10);
                    if (isNaN(id)) continue;
                    const p = tile.properties;
                    if (!p) continue;
                    if (Array.isArray(p)) {
                        for (const prop of p) {
                            if (prop && (prop.name === "collision" || prop.name === "solid")) {
                                props.set(id, prop.type === "bool" ? prop.value === true || prop.value === "true" : prop.value);
                            }
                        }
                    } else if (typeof p === "object") {
                        if (p.collision !== undefined) props.set(id, p.collision);
                        else if (p.solid !== undefined) props.set(id, p.solid);
                    }
                }
            } else {
                const doc = new DOMParser().parseFromString(t, "application/xml");
                doc.querySelectorAll("tileset > tile").forEach(tileEl => {
                    const id = parseInt(tileEl.getAttribute("id"), 10);
                    if (isNaN(id)) return;
                    const propsEl = tileEl.querySelector("properties");
                    if (!propsEl) return;
                    propsEl.querySelectorAll("property").forEach(p => {
                        const name = p.getAttribute("name");
                        if (name !== "collision" && name !== "solid") return;
                        const type = p.getAttribute("type") || "bool";
                        const v = p.getAttribute("value");
                        if (type === "bool") props.set(id, v === "true");
                        else if (type === "int") props.set(id, parseInt(v, 10) || 0);
                        else props.set(id, v);
                    });
                });
            }
        } catch (e) { /* 属性解析失败不影响导入 */ }
        return props;
    }

    /** 解析 tsx/tsj 文本 → tileset 定义信息（尺寸/图片/属性） */
    function parseTsxInfo(tsxText) {
        const info = { tilewidth: 0, tileheight: 0, margin: 0, spacing: 0, imgW: 0, imgH: 0, imgSrc: "", tileProps: null };
        const t = String(tsxText || "").trim();
        if (!t) return info;
        try {
            if (t.startsWith("{")) {
                const j = JSON.parse(t);
                info.tilewidth = j.tilewidth || 0;
                info.tileheight = j.tileheight || 0;
                info.margin = j.margin || 0;
                info.spacing = j.spacing || 0;
                info.imgW = (j.image && j.image.width) || 0;
                info.imgH = (j.image && j.image.height) || 0;
                info.imgSrc = (j.image && j.image.source) || "";
            } else {
                const doc = new DOMParser().parseFromString(t, "application/xml");
                const tsEl = doc.querySelector("tileset");
                if (tsEl) {
                    const img = tsEl.querySelector("image");
                    info.tilewidth = parseInt(tsEl.getAttribute("tilewidth")) || 0;
                    info.tileheight = parseInt(tsEl.getAttribute("tileheight")) || 0;
                    info.margin = parseInt(tsEl.getAttribute("margin") || 0);
                    info.spacing = parseInt(tsEl.getAttribute("spacing") || 0);
                    info.imgW = img ? parseInt(img.getAttribute("width")) || 0 : 0;
                    info.imgH = img ? parseInt(img.getAttribute("height")) || 0 : 0;
                    info.imgSrc = img ? (img.getAttribute("source") || "") : "";
                }
            }
        } catch (e) { /* 忽略 */ }
        info.tileProps = parseTileProps(tsxText);
        return info;
    }

    /**
     * 解析 tmx 文本（XML 或 JSON .tmj）→ 结构化数据（v8.6：支持多外部 tileset）
     * @param {string} text .tmx 或 .tmj 内容
     * @param {Map<string,string>|string|null} tsxMapOrText 外部 tileset 内容表：
     *        Map<basename去扩展, 文本>（多 tileset，按 tmx 的 tileset source 文件名匹配）；
     *        或单个 tsx/tsj 文本（兼容旧调用：回填所有缺尺寸的 tileset）；null=无外部 tileset
     */
    async function parseTmx(text, tsxMapOrText) {
        const diag = [];
        const tsxMap = (tsxMapOrText instanceof Map) ? tsxMapOrText : null;
        const singleTsx = (typeof tsxMapOrText === "string") ? tsxMapOrText : null;
        let singleInfo = null;
        if (singleTsx) singleInfo = parseTsxInfo(singleTsx);

        const backfill = (ts, imgSize) => {
            const out = Object.assign({}, ts);
            if (singleInfo) {
                if (!out.tilewidth && singleInfo.tilewidth) out.tilewidth = singleInfo.tilewidth;
                if (!out.tileheight && singleInfo.tileheight) out.tileheight = singleInfo.tileheight;
                if (!out.margin && singleInfo.margin) out.margin = singleInfo.margin;
                if (!out.spacing && singleInfo.spacing) out.spacing = singleInfo.spacing;
                if (!out.imgW && singleInfo.imgW) out.imgW = singleInfo.imgW;
                if (!out.imgH && singleInfo.imgH) out.imgH = singleInfo.imgH;
                if (!out.imgSrc && singleInfo.imgSrc) out.imgSrc = singleInfo.imgSrc;
            }
            if ((!out.imgW || !out.imgH) && imgSize) {
                out.imgW = imgSize.w;
                out.imgH = imgSize.h;
            }
            return out;
        };
        // 按 tmx 的 tileset source 文件名匹配外部 tsx → 合并定义（多 tileset v8.6）
        const applyTsx = (ts) => {
            if (!ts.src) return ts;
            const srcBase = baseName(ts.src);
            let text = null;
            if (tsxMap && srcBase) text = tsxMap.get(srcBase) || null;
            if (!text) return ts;
            const info = parseTsxInfo(text);
            const out = Object.assign({}, ts);
            if (!out.tilewidth && info.tilewidth) out.tilewidth = info.tilewidth;
            if (!out.tileheight && info.tileheight) out.tileheight = info.tileheight;
            if (!out.margin && info.margin) out.margin = info.margin;
            if (!out.spacing && info.spacing) out.spacing = info.spacing;
            if (!out.imgW && info.imgW) out.imgW = info.imgW;
            if (!out.imgH && info.imgH) out.imgH = info.imgH;
            if (!out.imgSrc && info.imgSrc) out.imgSrc = info.imgSrc;
            if (info.tileProps) out.tileProps = info.tileProps;
            return out;
        };

        let w, h, tw, th, layers = [], tilesets = [];
        const trimmed = String(text).trim();

        if (trimmed.startsWith("{")) {
            const j = JSON.parse(trimmed);
            tw = j.tilewidth; th = j.tileheight; w = j.width; h = j.height;
            if (j.orientation && j.orientation !== "orthogonal") diag.push("非正交地图，仅支持 orthogonal");
            for (const l of j.layers || []) {
                if (l.type === "tilelayer" && Array.isArray(l.data)) layers.push({ name: l.name || "layer", gids: l.data });
                else diag.push("图层 '" + (l.name || "") + "' 跳过");
            }
            for (const ts of j.tilesets || []) {
                tilesets.push(applyTsx(backfill({
                    firstgid: ts.firstgid, name: ts.name || "", src: ts.source || "",
                    tilewidth: ts.tilewidth, tileheight: ts.tileheight,
                    imgSrc: ts.image || "", imgW: ts.imagewidth || 0, imgH: ts.imageheight || 0,
                    margin: ts.margin || 0, spacing: ts.spacing || 0,
                    tileProps: null
                }, null)));
            }
        } else {
            const doc = new DOMParser().parseFromString(trimmed, "application/xml");
            const root = doc.querySelector("map");
            if (!root) throw new Error("解析失败：没有 <map> 根节点");
            if (root.getAttribute("orientation") !== "orthogonal") diag.push("非正交地图，仅支持 orthogonal");
            tw = parseInt(root.getAttribute("tilewidth")); th = parseInt(root.getAttribute("tileheight"));
            w = parseInt(root.getAttribute("width")); h = parseInt(root.getAttribute("height"));
            const lr = await collectLayers(root, w, h);
            layers = lr.layers; diag.push.apply(diag, lr.diag);
            root.querySelectorAll("tileset").forEach(ts => {
                const img = ts.querySelector("image");
                tilesets.push(applyTsx(backfill({
                    firstgid: parseInt(ts.getAttribute("firstgid")),
                    name: ts.getAttribute("name") || "",
                    src: ts.getAttribute("source"),
                    tilewidth: parseInt(ts.getAttribute("tilewidth")),
                    tileheight: parseInt(ts.getAttribute("tileheight")),
                    imgSrc: img ? (img.getAttribute("source") || "") : "",
                    imgW: img ? parseInt(img.getAttribute("width")) : 0,
                    imgH: img ? parseInt(img.getAttribute("height")) : 0,
                    margin: parseInt(ts.getAttribute("margin") || 0),
                    spacing: parseInt(ts.getAttribute("spacing") || 0),
                    tileProps: null
                }, null)));
            });
        }
        return { w, h, tilewidth: tw, tileheight: th, layers, tilesets, diag };
    }

    /**
     * v8.7 转换：tilemap 数据 + tileset 图片 → tile 资产（f4 base64）+ tilemap 资产数据
     * 新增（v8.6→v8.7）：④碰撞图层多选——按选中图层（非空格子 → 2=TM_WALL），
     *       与图块属性方案并存（并集）；⑤碰撞统计 collisionStats。
     * v8.6：①翻转位烘焙（gid 高位 H/V/D 标志 → 像素变换 → 独立烘焙瓦片）
     *       ②多 tileset（pxMap 按 ts.imgSrc 文件名匹配多 PNG）
     *       ③碰撞导入（图块属性 collision/solid → 2=TM_WALL，可选）
     * @param {object} tmx parseTmx 结果
     * @param {{w,h,data}|Map<string,{w,h,data}>} pxOrPxMap 单图集像素或 Map<basename, 像素>
     * @param {number|null} targetTW 目标瓦片尺寸（4/8/16/32）；缺省=原尺寸或自动 16
     * @param {boolean} importCollision 是否导入碰撞（图块属性 → 2）；默认 true
     * @param {string[]|null} collisionLayerNames 选中图层名列表（非空格子 → 2）；null=不使用图层方案
     */
    function convert(tmx, pxOrPxMap, targetTW, importCollision, collisionLayerNames) {
        if (tmx.tilewidth !== tmx.tileheight)
            throw new Error("tilewidth 必须等于 tileheight（Arcade 只支持正方形 tile）");
        const tileW = tmx.tilewidth;
        // 多图集 pxMap（v8.6）：单像素对象 → 单键 Map
        let pxMap;
        if (pxOrPxMap instanceof Map) {
            pxMap = pxOrPxMap;
        } else {
            const px = pxOrPxMap;
            if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");
            pxMap = new Map([["tileset", px]]);
        }
        const tss = tmx.tilesets.slice().sort((a, b) => a.firstgid - b.firstgid);
        if (!tss.length) throw new Error("没有找到 tileset 信息");
        // 多 tileset 尺寸必须统一（Arcade 单地图单一 tile 尺寸）
        for (const ts of tss) {
            if (ts.tilewidth && ts.tilewidth !== tileW)
                throw new Error("多 tileset 尺寸不一致：" + (ts.name || ts.src || "?") + " tilewidth=" + ts.tilewidth + " ≠ 地图 " + tileW + "px（Arcade 地图内 tile 尺寸必须统一）");
        }

        // Arcade 编辑器/运行时只支持 tile 尺寸 4/8/16/32；非标准尺寸（如 40px）自动缩放，
        // 也可由用户导入时显式指定目标尺寸（targetTW）
        const SUPPORTED = [4, 8, 16, 32];
        let outTW;
        if (targetTW) {
            if (!SUPPORTED.includes(targetTW)) throw new Error("目标尺寸 " + targetTW + "px 不受 Arcade 支持（仅 4/8/16/32）");
            outTW = targetTW;
        } else {
            outTW = SUPPORTED.includes(tileW) ? tileW : 16;
        }
        const scaled = outTW !== tileW;

        const diag = [];
        // 建立 gid → {ts, r, c, px}（v8.6：每 tileset 按 imgSrc/name/src 文件名匹配对应 PNG）
        const gidLookup = new Map();
        tss.forEach(ts => {
            let px = null;
            if (pxMap.size === 1) {
                px = pxMap.values().next().value;
            } else {
                const cands = [baseName(ts.imgSrc), ts.name, baseName(ts.src)];
                for (const c of cands) { if (c && pxMap.has(c)) { px = pxMap.get(c); break; } }
            }
            if (!px) {
                diag.push("tileset '" + (ts.name || ts.src || "?") + "' 未匹配到 PNG（需选择 " + (ts.imgSrc || ts.src || "对应图片") + "）");
                return;
            }
            const imgW = ts.imgW || px.w, imgH = ts.imgH || px.h;
            if (!imgW || !imgH) { diag.push("tileset '" + (ts.name || "?") + "' 图片尺寸未知"); return; }
            const tw0 = ts.tilewidth || tileW, th0 = ts.tileheight || tileW;
            const cols = Math.floor((imgW - 2 * ts.margin + ts.spacing) / (tw0 + ts.spacing));
            const rows = Math.floor((imgH - 2 * ts.margin + ts.spacing) / (th0 + ts.spacing));
            if (!cols || !rows) { diag.push("tileset '" + (ts.name || "?") + "' 无法切出 tile（图片 " + imgW + "x" + imgH + "，tile " + tw0 + "px）"); return; }
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++) {
                    const g = ts.firstgid + (r * cols + c);
                    gidLookup.set(g, { ts, r, c, px, tw: tw0, th: th0, gid: g });
                }
        });
        if (!gidLookup.size)
            throw new Error("无法从图片切出 tile（" + (diag.join("；") || "图片/tile 尺寸不符") + "）");

        const mapW = tmx.w, mapH = tmx.h;
        // 合并图层：gid 剥离翻转标志（v8.6），翻转组合单独记录
        // gid 可超过 255（Tiled 图集常见），必须用 16 位存储，否则 gid>255 被截断
        const merged = new Uint16Array(mapW * mapH);
        const flips = new Uint8Array(mapW * mapH);   // bit0=H bit1=V bit2=D
        tmx.layers.forEach(l => {
            for (let i = 0; i < mapW * mapH; i++) {
                const raw = l.gids[i];
                if (raw !== 0) {
                    const pg = parseGid(raw);
                    merged[i] = pg.gid;
                    flips[i] = pg.flip;
                }
            }
        });

        // 组合（gid, flip）紧凑重映射 → 1..N（255 上限按组合数计：每种翻转组合是一个独立索引）。
        // 顺序：gid 升序，每个 gid 的 flip 升序（0 → H → V → D → 组合），保证索引确定性。
        const comboSet = new Map();         // gid → Set(flip)
        for (let i = 0; i < mapW * mapH; i++) {
            const g = merged[i];
            if (!g) continue;
            if (!comboSet.has(g)) comboSet.set(g, new Set());
            comboSet.get(g).add(flips[i]);
        }
        const usedCombos = [];              // [{g, flip, key}]
        const comboMap = new Map();         // key → 1..N
        for (const g of [...comboSet.keys()].sort((a, b) => a - b)) {
            const fs = [...comboSet.get(g)].sort();
            for (const flip of fs) {
                const key = g * 8 + flip;
                comboMap.set(key, comboMap.size + 1);
                usedCombos.push({ g, flip, key });
            }
        }
        if (comboMap.size > 255)
            throw new Error("地图用到 " + comboMap.size + " 种 tile（含翻转组合），超过 Arcade 上限 255，请拆分地图");
        const usedGids = [...comboSet.keys()].sort((a, b) => a - b);
        const usedSet = new Set(usedGids);

        const getPix = (tt, x, y) => {
            const sx = tt.ts.margin + tt.c * (tt.tw + tt.ts.spacing) + x;
            const sy = tt.ts.margin + tt.r * (tt.th + tt.ts.spacing) + y;
            const ix = Math.min(tt.px.w - 1, Math.floor(sx));
            const iy = Math.min(tt.px.h - 1, Math.floor(sy));
            const idx = (iy * tt.px.w + ix) * 4;
            return nearestColor(tt.px.data[idx], tt.px.data[idx + 1], tt.px.data[idx + 2], tt.px.data[idx + 3]);
        };
        // 面积平均（box filter）：目标像素 = 源区域调色板颜色平均，再最近色量化。
        // 修复最近邻采样在非整数倍缩放（如 40→16，步长 2.5）时跳过细线（砖缝）导致"垂直拉长"失真
        const boxAvg = (tt, tileW0, x0, x1, y0, y1) => {
            let sr = 0, sg = 0, sb = 0, n = 0;
            for (let y = y0; y < y1; y++)
                for (let x = x0; x < x1; x++) {
                    const ci = getPix(tt, Math.min(x, tileW0 - 1), Math.min(y, tileW0 - 1));
                    if (!ci) continue;
                    sr += PALETTE[ci][0]; sg += PALETTE[ci][1]; sb += PALETTE[ci][2]; n++;
                }
            return n ? nearestColor(sr / n, sg / n, sb / n, 255) : 0;
        };
        // —— 背景色检测（v8.5）：Arcade tilemap 是单层瓦片索引，无图层叠加。
        //    Tiled 里"背景层天蓝铺满 + 云朵层盖在上面"的叠加效果，在 Arcade 单层里
        //    表现为：云朵格子被云朵瓦片独占，瓦片内部透明像素透出地图底色（空洞）。
        //    修复：合并后出现次数最多的 gid 若覆盖 >50% 格子，视为背景层，
        //    把"地图用到的瓦片"的透明像素填成背景色，模拟背景层叠加。
        const bgFreq = new Map();
        for (let i = 0; i < mapW * mapH; i++) { const g = merged[i]; if (g) bgFreq.set(g, (bgFreq.get(g) || 0) + 1); }
        let bgGid = null;
        for (const [g, c] of bgFreq) if (c > mapW * mapH * 0.5 && (!bgGid || c > bgFreq.get(bgGid))) bgGid = g;
        let bgColorIdx = 0;
        if (bgGid) {
            const tt = gidLookup.get(bgGid);
            if (tt) {
                let sr = 0, sg = 0, sb = 0, n = 0;
                for (let y = 0; y < tileW; y++) for (let x = 0; x < tileW; x++) {
                    const ci = getPix(tt, x, y);
                    if (!ci) continue;
                    sr += PALETTE[ci][0]; sg += PALETTE[ci][1]; sb += PALETTE[ci][2]; n++;
                }
                if (n) bgColorIdx = nearestColor(sr / n, sg / n, sb / n, 255);
            }
        }

        // 单瓦片缩放像素矩阵（供原版与翻转烘焙共用；地图用到的瓦片透明像素填背景色）
        const scaleTilePix = (tt) => {
            const scale = tileW / outTW;
            const pix = new Uint8Array(outTW * outTW);
            for (let y = 0; y < outTW; y++) for (let x = 0; x < outTW; x++) {
                const x0 = Math.min(Math.floor(x * scale), tileW - 1);
                const y0 = Math.min(Math.floor(y * scale), tileW - 1);
                const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tileW);
                const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tileW);
                let ci = boxAvg(tt, tileW, x0, x1, y0, y1);
                if (ci === 0 && bgColorIdx && usedSet.has(tt.gid)) ci = bgColorIdx;
                pix[y * outTW + x] = ci;
            }
            return pix;
        };

        // 全量导入：图集所有瓦片（含地图未用到的）——瓦片资产无 255 上限，仅地图用到的受数据区索引限制
        const tileAssets = [];
        const gidToAssetId = new Map();     // 原版 gid → 资产 id
        const flipToAssetId = new Map();    // key(g*8+flip) → 烘焙资产 id（flip>0）
        let ti = 0;
        // 1) 全量原版资产
        for (const [g, tt] of gidLookup) {
            const pix = scaleTilePix(tt);
            const bytes = f4EncodeImg(outTW, outTW, (x, y) => pix[y * outTW + x]);
            const id = "tile" + ti++;
            tileAssets.push({ id: id, data: bytesToBase64(new Uint8Array(bytes)) });
            gidToAssetId.set(g, id);
        }
        // 2) 用到的翻转组合烘焙（v8.6：Tiled 翻转 → Arcade 静态烘焙瓦片，顺序 D→H→V）
        let flipCount = 0;
        for (const combo of usedCombos) {
            if (!combo.flip) continue;
            const tt = gidLookup.get(combo.g);
            if (!tt) continue;
            const pix = scaleTilePix(tt);
            const bytes = f4EncodeImg(outTW, outTW, (x, y) => {
                const [sx, sy] = flipSrc(combo.flip, outTW, x, y);
                return pix[sy * outTW + sx];
            });
            const id = "tile" + ti++;
            tileAssets.push({ id: id, data: bytesToBase64(new Uint8Array(bytes)) });
            flipToAssetId.set(combo.key, id);
            flipCount++;
        }
        if (!tileAssets.length) throw new Error("图集中没有可导入的瓦片");
        // tileset 引用：按数据区重映射顺序（索引 1..N ↔ tiles 数组下标 1..N）
        const tilesetRefs = usedCombos.map(c => (c.flip ? flipToAssetId.get(c.key) : gidToAssetId.get(c.g))).filter(Boolean);

        // 数据区：紧凑重映射索引 1..N（每格 1 字节，直接供官方 Tilemap.set 写入）
        const index = new Uint16Array(mapW * mapH);
        for (let y = 0; y < mapH; y++)
            for (let x = 0; x < mapW; x++) {
                const i = y * mapW + x;
                index[i] = merged[i] ? (comboMap.get(merged[i] * 8 + flips[i]) || 0) : 0;
            }

        // 碰撞（v8.6/v8.7）：来源①图块属性 collision/solid → 2；②选中图层非空格子 → 2；
        // 两者并存取并集；importCollision=false 且无图层选择则全 0
        const collision = new Uint8Array(mapW * mapH);
        const collisionStats = { props: 0, layers: 0 };
        if (importCollision !== false) {
            for (let i = 0; i < mapW * mapH; i++) {
                const g = merged[i];
                if (!g) continue;
                const tt = gidLookup.get(g);
                if (tt && tt.ts.tileProps) {
                    const v = tt.ts.tileProps.get(g - tt.ts.firstgid);
                    if (v === true || v === "true" || (typeof v === "number" && v > 0)) { collision[i] = 2; collisionStats.props++; }
                }
            }
        }
        if (Array.isArray(collisionLayerNames) && collisionLayerNames.length) {
            const sel = new Set(collisionLayerNames);
            const byName = new Map(tmx.layers.map(l => [l.name, l]));
            for (const lname of sel) {
                const l = byName.get(lname);
                if (!l) { diag.push("碰撞图层 '" + lname + "' 不存在，已忽略"); continue; }
                for (let i = 0; i < mapW * mapH; i++) {
                    const raw = l.gids[i];
                    if (!raw) continue;
                    if (parseGid(raw).gid === 0) continue; // 翻转标志剥离后仍为 0 → 空
                    if (!collision[i]) { collision[i] = 2; collisionStats.layers++; }
                }
            }
        }

        return {
            tileAssets,
            tilemap: { index: index, tileset: tilesetRefs },
            collision: collision,
            collisionStats: collisionStats,
            w: mapW, h: mapH, tilewidth: outTW,
            scaledFrom: scaled ? tileW : null,
            tileCount: tileAssets.length,
            usedTileCount: usedCombos.length,
            flipTileCount: flipCount,
            diag: diag
        };
    }

    function convertTsxOnly(tsxText, px, targetTW) {
        let tw, th, margin = 0, spacing = 0, imgW, imgH;
        const t = String(tsxText).trim();
        if (t.startsWith("{")) {
            const j = JSON.parse(t);
            tw = j.tilewidth; th = j.tileheight;
            margin = j.margin || 0; spacing = j.spacing || 0;
            imgW = (j.image && j.image.width) || 0; imgH = (j.image && j.image.height) || 0;
        } else {
            const doc = new DOMParser().parseFromString(t, "application/xml");
            const tsEl = doc.querySelector("tileset");
            if (!tsEl) throw new Error("没有 <tileset> 根节点");
            const img = tsEl.querySelector("image");
            tw = parseInt(tsEl.getAttribute("tilewidth"));
            th = parseInt(tsEl.getAttribute("tileheight"));
            margin = parseInt(tsEl.getAttribute("margin") || 0);
            spacing = parseInt(tsEl.getAttribute("spacing") || 0);
            imgW = img ? parseInt(img.getAttribute("width")) : 0;
            imgH = img ? parseInt(img.getAttribute("height")) : 0;
        }
        if (!tw || !th) throw new Error("tileset 缺少 tilewidth/tileheight");
        if (tw !== th) throw new Error("tilewidth 必须等于 tileheight，当前 " + tw + "x" + th);
        if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");
        if (!imgW || !imgH) { imgW = px.w; imgH = px.h; }

        // Arcade 只支持 tile 尺寸 4/8/16/32；非标准尺寸自动缩放，也可由用户显式指定目标尺寸
        const SUPPORTED = [4, 8, 16, 32];
        let outTW;
        if (targetTW) {
            if (!SUPPORTED.includes(targetTW)) throw new Error("目标尺寸 " + targetTW + "px 不受 Arcade 支持（仅 4/8/16/32）");
            outTW = targetTW;
        } else {
            outTW = SUPPORTED.includes(tw) ? tw : 16;
        }
        const scaled = outTW !== tw;

        const cols = Math.floor((imgW - 2 * margin + spacing) / (tw + spacing));
        const rows = Math.floor((imgH - 2 * margin + spacing) / (th + spacing));
        if (!cols || !rows) throw new Error("无法从图片切出 tile");
        // 全量导入：瓦片资产无 255 上限（255 仅限 tilemap 数据区索引，纯 tsx 无地图不受限）

        const tileAssets = [];
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                const getPix = (x, y) => {
                    const sx = margin + c * (tw + spacing) + x;
                    const sy = margin + r * (th + spacing) + y;
                    const ix = Math.min(px.w - 1, Math.floor(sx));
                    const iy = Math.min(px.h - 1, Math.floor(sy));
                    const idx = (iy * px.w + ix) * 4;
                    return nearestColor(px.data[idx], px.data[idx + 1], px.data[idx + 2], px.data[idx + 3]);
                };
                // 面积平均重采样（保留砖缝等细线）
                const scale = tw / outTW;
                const boxAvg = (x0, x1, y0, y1) => {
                    let sr = 0, sg = 0, sb = 0, n = 0;
                    for (let y = y0; y < y1; y++)
                        for (let x = x0; x < x1; x++) {
                            const ci = getPix(Math.min(x, tw - 1), Math.min(y, tw - 1));
                            if (!ci) continue;
                            sr += PALETTE[ci][0]; sg += PALETTE[ci][1]; sb += PALETTE[ci][2]; n++;
                        }
                    return n ? nearestColor(sr / n, sg / n, sb / n, 255) : 0;
                };
                const bytes = f4EncodeImg(outTW, outTW, (x, y) => {
                    const x0 = Math.min(Math.floor(x * scale), tw - 1);
                    const y0 = Math.min(Math.floor(y * scale), tw - 1);
                    const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tw);
                    const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tw);
                    return boxAvg(x0, x1, y0, y1);
                });
                tileAssets.push({ id: "tile" + (r * cols + c), data: bytesToBase64(new Uint8Array(bytes)) });
            }
        return { tileAssets, tilewidth: outTW, scaledFrom: scaled ? tw : null, tileCount: tileAssets.length };
    }

    function loadPngPixels(img) {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
    }

    function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片加载失败: " + file.name)); };
            img.src = url;
        });
    }

    /* ========== 资产写入（AssetManager API） ========== */

    /**
     * 探测编辑器 AssetManager 实例
     * 方式 1（主）：React fiber 搜索 —— 与既有「导入图片/动画」完全相同的套路。
     *   AssetManager 实例在 React 组件树内（#root 的 __reactFiber），不在 window.pxt 直接可达。
     * 方式 2（兜底）：window.pxt / window 宽扫描（浅层采样）。
     */
    function findAssetManager() {
        // ---- 方式 1: React fiber 搜索 ----
        const root = document.getElementById('root') || document.body;
        const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (fiberKey) {
            let found = null;
            let searched = 0;
            const checkObject = (obj, path) => {
                if (!obj || typeof obj !== 'object' || found) return;
                try {
                    if (typeof obj.createNewProjectImage === 'function' && typeof obj.getAssetCollection === 'function') {
                        found = obj;
                        console.log('[TMXImport] Found asset manager at:', path);
                        return;
                    }
                } catch (e) { /* ignore */ }
                if (path.split('.').length < 5) {
                    for (const key of Object.keys(obj)) {
                        try {
                            const val = obj[key];
                            if (val && typeof val === 'object' && !val.nodeType && !val.tagName) {
                                checkObject(val, path + '.' + key);
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            };
            const searchFiber = (fiber, depth) => {
                if (!fiber || found || depth > 100) return;
                searched++;
                if (fiber.memoizedProps) checkObject(fiber.memoizedProps, 'props');
                if (fiber.stateNode) checkObject(fiber.stateNode, 'stateNode');
                if (fiber.memoizedState) {
                    let state = fiber.memoizedState;
                    let idx = 0;
                    while (state && !found) {
                        if (state.memoizedState) checkObject(state.memoizedState, 'state[' + idx + ']');
                        state = state.next;
                        idx++;
                    }
                }
                if (fiber.dependencies && fiber.dependencies.firstContext) {
                    let ctx = fiber.dependencies.firstContext;
                    let idx = 0;
                    while (ctx && !found) {
                        if (ctx.memoizedValue) checkObject(ctx.memoizedValue, 'context[' + idx + ']');
                        ctx = ctx.next;
                        idx++;
                    }
                }
                let child = fiber.child;
                while (child && !found) { searchFiber(child, depth + 1); child = child.sibling; }
            };
            searchFiber(root[fiberKey], 0);
            console.log('[TMXImport] Searched', searched, 'fibers, found:', !!found);
            if (found) return found;
        } else {
            console.log('[TMXImport] No React fiber key found');
        }

        // ---- 方式 2: window.pxt 宽扫描兜底 ----
        const results = [];
        const seen = new Set();
        const scan = (obj, depth) => {
            if (!obj || depth > 3 || seen.has(obj) || results.length >= 2) return;
            seen.add(obj);
            try {
                if (typeof obj.getAssetCollection === "function") {
                    const collT = obj.getAssetCollection("tile");
                    const collM = obj.getAssetCollection("tilemap");
                    if (collT && collM && typeof collT.add === "function" && typeof collM.add === "function") {
                        results.push(obj);
                        return;
                    }
                }
            } catch (e) { /* 非 am，继续扫描 */ }
            let keys;
            try { keys = Object.keys(obj); } catch (e) { return; }
            const step = Math.max(1, Math.floor(keys.length / 40));
            for (let i = 0; i < keys.length && results.length < 2; i += step) {
                let v;
                try { v = obj[keys[i]]; } catch (e) { continue; }
                if (v && typeof v === "object") scan(v, depth + 1);
            }
        };
        if (window.pxt) scan(window.pxt, 0);
        if (!results.length) scan(window, 0);
        if (!results.length) {
            const frames = document.querySelectorAll("iframe");
            for (const f of frames) {
                try {
                    const w = f.contentWindow;
                    if (w && w.pxt) scan(w.pxt, 0);
                } catch (e) { /* 跨域/异常忽略 */ }
            }
        }
        return results[0] || null;
    }

    /** f4 base64 → 字节 */
    function base64ToBytes(b64) {
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    /**
     * f4 base64 → 官方 BitmapData 对象 {width,height,x0,y0,data}
     * 官方 f4 格式：列优先（先 x 后 y），每字节=同列相邻两像素的 4bpp；
     * 每列结束先补齐到整 nibble，再对齐到 4 字节（填充 0）。
     * 而官方 Bitmap.buf 是行优先（index = col + row*width，每字节=同行相邻两像素）。
     * 这里：① 按官方 f4 规则（含列填充）解码像素矩阵 → ② 转置重打包为 Bitmap.buf 行优先布局。
     * 否则 createNewTile 内部 base64EncodeBitmap 重采样会错位（瓦片逆时针 90°）。
     */
    function base64ToBitmapData(f4base64) {
        const b = base64ToBytes(f4base64);            // [0x87,4,wLo,wHi,hLo,hHi,0,0,px...]
        const w = b[2] | (b[3] << 8);
        const h = b[4] | (b[5] << 8);
        const px = b.subarray(8);                      // 列优先 4bpp + 列填充
        if (!w || !h) throw new Error("f4 尺寸异常 w=" + w + " h=" + h);
        // 1) 按官方 f4 规则解码像素矩阵（跳过列尾 nibble 补齐与 4 字节对齐填充）
        const pix = new Uint8Array(w * h);
        let p = 0;
        for (let x = 0; x < w; x++) {
            let bitInByte = 0;
            for (let y = 0; y < h; y++) {
                pix[y * w + x] = (px[p] >> (bitInByte * 4)) & 0xf;
                bitInByte++;
                if (bitInByte === 2) { p++; bitInByte = 0; }
            }
            if (bitInByte !== 0) p++;                  // 列尾补齐 nibble
            while (p & 3) p++;                          // 对齐到 4 字节（跳过填充）
        }
        // 2) 重打包为 Bitmap.buf 行优先布局（index = col + row*width；每字节 = 偶像素低4位 + 奇像素高4位）
        const buf = new Uint8ClampedArray(Math.ceil(w * h / 2));
        for (let i = 0; i < w * h; i++) {
            const cell = i >> 1;
            if (i & 1) buf[cell] = (buf[cell] & 0x0f) | ((pix[i] & 0xf) << 4);
            else buf[cell] = (buf[cell] & 0xf0) | (pix[i] & 0xf);
        }
        return { width: w, height: h, x0: 0, y0: 0, data: buf };
    }

    /** 兜底：am 无 createNewTile 时手动构造 tile 资产（官方结构）并补入集合 */
    function makeTileAssetFallback(am, id, f4base64) {
        const bmp = base64ToBitmapData(f4base64);
        const asset = {
            internalID: newInternalId(am),
            id: id,
            type: "tile",
            jresData: f4base64,
            bitmap: bmp,
            meta: { displayName: id },
            isProjectTile: true
        };
        try {
            am.getAssetCollection("tile").add(asset);
        } catch (e) {
            console.warn("[TMXImport] fallback add tile 失败:", e);
        }
        return asset;
    }

    /** 透明 tile（tilemap 数据区索引 0）——优先用官方 am.getTransparency */
    function getTransparencyTile(am, tileWidth) {
        if (am && typeof am.getTransparency === "function") {
            try {
                const t = am.getTransparency(tileWidth);
                if (t) return t;
            } catch (e) { /* 版本差异，手动构造 */ }
        }
        const ns = (window.pxt.sprite && window.pxt.sprite.TILE_NAMESPACE) || "myTiles";
        const id = ns + ".transparency" + tileWidth;
        const bmp = {
            width: tileWidth, height: tileWidth, x0: 0, y0: 0,
            data: new Uint8ClampedArray(Math.ceil(tileWidth * tileWidth / 2))
        };
        return { internalID: newInternalId(am), id: id, type: "tile", bitmap: bmp, jresData: "", meta: {}, isProjectTile: true };
    }

    /** 取现有资产 id 集合（避免命名冲突） */
    function existingIds(am, type) {
        try {
            const snap = am.getAssetCollection(type).getSnapshot();
            return snap.map(a => a.id);
        } catch (e) { return []; }
    }

    function uniqueId(base, taken) {
        if (taken.indexOf(base) < 0) return base;
        let n = 1;
        while (taken.indexOf(base + "_" + n) >= 0) n++;
        return base + "_" + n;
    }

    function newInternalId(am) {
        if (am && typeof am.getNewInternalId === "function") return am.getNewInternalId();
        return Math.floor(Math.random() * 1e9) + 1;
    }

    /**
     * 写入资产 —— 完全走官方 TilemapProject API（自动 onChange → UI 刷新）：
     *   - 瓦片：am.createNewTile(BitmapData, id, displayName)   （官方 getTransparency 同路径）
     *   - 地图：am.blankTilemap(tileWidth, w, h) → 设置格子 → tileset.tiles=[透明,...全量资产]
     *            → am.createNewTilemapFromData(data, name)
     * @returns {{tileIds:Array<string>, mapId:string|null, tileCount:number}}
     */
    function writeAssets(am, result) {
        const out = { tileIds: [], mapId: null, tileCount: 0, usedTileCount: result.usedTileCount || 0 };
        const hasApi = am && typeof am.createNewTile === "function" &&
            typeof am.blankTilemap === "function" && typeof am.createNewTilemapFromData === "function";
        console.log("[TMXImport] writeAssets 开始: hasApi =", hasApi, "tileAssets =", (result.tileAssets || []).length, "有地图 =", !!result.tilemap);

        // 1) 全量 tile 资产（含地图未用到的瓦片）
        const created = [];
        const tileNs = (window.pxt.sprite && window.pxt.sprite.TILE_NAMESPACE) || "myTiles";
        result.tileAssets.forEach((ta, i) => {
            let tile;
            if (hasApi) {
                try {
                    // 官方命名空间 id（myTiles.tileN）+ 可读 displayName（tileN）
                    tile = am.createNewTile(base64ToBitmapData(ta.data), tileNs + "." + ta.id, ta.id);
                } catch (e) {
                    console.warn("[TMXImport] createNewTile 失败，走 fallback:", e && e.message);
                    tile = makeTileAssetFallback(am, ta.id, ta.data);
                }
            } else {
                tile = makeTileAssetFallback(am, ta.id, ta.data);
            }
            if (!tile) return;
            created.push(tile);
            out.tileIds.push(tile.id || ta.id);
            // 诊断：官方 createNewTile 在 id 冲突时会自动改名（generateNewID），
            // 记录前 3 个传入/实际 id，便于确认命名机制
            if (i < 3) console.log("[TMXImport] createNewTile 传入:", tileNs + "." + ta.id, "→ 实际:", tile.id || "(无)");
        });
        out.tileCount = created.length;
        try {
            console.log("[TMXImport] tile 资产已写入:", out.tileCount, "个，集合计数 =", am.getAssetCollection("tile").getSnapshot().length);
        } catch (e) { /* 诊断失败不影响 */ }

        // 2) tilemap 资产（若地图提供）
        if (result.tilemap) {
            let td;
            if (hasApi) {
                try {
                    td = am.blankTilemap(result.tilewidth, result.w, result.h);
                } catch (e) {
                    td = null;
                }
            }
            if (!td) {
                // 兜底：手动构造官方结构 TilemapData（与官方 blankTilemap 一致：layers 传 Bitmap.data() 纯对象）
                const tilemap = new window.pxt.sprite.Tilemap(result.w, result.h);
                const cbm = new window.pxt.sprite.Bitmap(result.w, result.h);
                if (result.collision) {
                    for (let y = 0; y < result.h; y++)
                        for (let x = 0; x < result.w; x++) {
                            const v = result.collision[y * result.w + x];
                            if (v) cbm.set(x, y, v);
                        }
                }
                td = new window.pxt.sprite.TilemapData(tilemap, { tileWidth: result.tilewidth, tiles: [getTransparencyTile(am, result.tilewidth)] }, cbm.data());
            }
            // 写入格子（数据区索引 1..N，每格 1 字节）
            const idx = result.tilemap.index;
            for (let y = 0; y < result.h; y++)
                for (let x = 0; x < result.w; x++)
                    td.tilemap.set(x, y, idx[y * result.w + x] || 0);
            // v8.6 碰撞写入：td.layers 是纯数据对象（官方 blankTilemap → Bitmap.data()，无 set 方法；
            // 读取方用 Bitmap.fromData(layers) 恢复，行优先 4bpp：index=col+row*width，偶像素低4位、奇像素高4位）
            if (result.collision) {
                const col = result.collision;
                const lay = td.layers;
                let writtenCol = 0;
                try {
                    if (lay && lay.data && lay.width && lay.height) {
                        for (let y = 0; y < result.h; y++)
                            for (let x = 0; x < result.w; x++) {
                                const v = col[y * result.w + x];
                                if (!v) continue;
                                const i = x + y * lay.width;
                                const cell = Math.floor(i / 2);
                                if (i % 2 === 0) lay.data[cell] = (lay.data[cell] & 0xf0) | (v & 0xf);
                                else lay.data[cell] = (lay.data[cell] & 0x0f) | ((v & 0xf) << 4);
                                writtenCol++;
                            }
                        if (writtenCol) console.log("[TMXImport] 碰撞已写入:", writtenCol, "格（值 2=墙）");
                    }
                } catch (e) {
                    console.warn("[TMXImport] 碰撞写入失败（layers 不可写）:", e && e.message);
                }
            }
            // tileset.tiles 必须与地图格子索引（紧凑重映射 1..N）对齐：
            // 格子索引 i → tileset.tiles[i] = usedGids[i-1] 对应的瓦片。
            // 不能用全量顺序 [trans].concat(created)（created 按 gid 1..400 全量顺序）：
            // 非连续 gid（如背景 gid85 → 紧凑索引 48）会引用错瓦片 → 地图显示错乱/背景消失。
            const trans = td.tileset.tiles[0] || getTransparencyTile(am, result.tilewidth);
            const refs = (result.tilemap && result.tilemap.tileset) || [];
            // v8.3 对齐：按"创建顺序"映射——created[i] 与 result.tileAssets[i] 一一对应（循环 push 顺序一致），
            // 引用用 convert 输出的 ta.id（连续 tileN）匹配。
            // 不再依赖 createNewTile 返回的 id 字符串：官方在 id 冲突时会自动改名（generateNewID），
            // 导致返回 id ≠ 传入 id（用户环境实测 tileN → tile(2N+1) 奇数命名），字符串匹配会失败并回退全量顺序 → 地图错位。
            const byTaId = new Map();
            result.tileAssets.forEach((ta, i) => byTaId.set(ta.id, created[i]));
            const aligned = refs.map(id => byTaId.get(id)).filter(Boolean);
            if (aligned.length) {
                td.tileset.tiles = [trans].concat(aligned);
                console.log("[TMXImport] tileset 已按紧凑索引对齐:", aligned.length, "个（地图用到的）");
            } else {
                td.tileset.tiles = [trans].concat(created);
                console.warn("[TMXImport] 未取到 tileset 引用列表，回退全量顺序 tileset");
            }
            // 加入项目
            if (hasApi) {
                try {
                    const res = am.createNewTilemapFromData(td, "level1");
                    out.mapId = res && res[0] ? res[0] : "level1";
                } catch (e) {
                    out.mapId = "level1";
                }
            } else {
                const id = uniqueId("level1", existingIds(am, "tilemap"));
                const asset = { internalID: newInternalId(am), id: id, type: "tilemap", meta: { displayName: id }, data: td };
                am.getAssetCollection("tilemap").add(asset);
                out.mapId = id;
            }
        }
        return out;
    }

    /* ========== UI 入口 ========== */

    function showMsg(title, body) {
        // 复用 inject.js 的 showAlert？—— 独立实现（防依赖）
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;';
        dialog.innerHTML = '<div style="margin-bottom:12px;font-size:16px;font-weight:600;">' + title + '</div>' +
            '<div style="margin-bottom:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;">' + body + '</div>';
        const btn = document.createElement('button');
        btn.textContent = '确定';
        btn.style.cssText = 'padding:8px 24px;background:#2185d0;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
        btn.onclick = () => { document.body.removeChild(overlay); };
        dialog.appendChild(btn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    /** 轻量解析 tsx/tsj 的 tilewidth（在选择缩放对话框前使用） */
    function peekTileWidth(tsxText) {
        const t = String(tsxText).trim();
        if (t.startsWith("{")) {
            const j = JSON.parse(t);
            return parseInt(j.tilewidth, 10) || null;
        }
        const m = /<tileset[^>]*\stilewidth=["'](\d+)["']/i.exec(t);
        return m ? parseInt(m[1], 10) : null;
    }

    /** 导入时选择目标瓦片尺寸（像素输入框 + 快捷按钮；Arcade 仅支持 4/8/16/32px）。
     * v8.6：showCollision=true 时附加"导入碰撞"checkbox（默认勾选，可取消）。
     * @returns {Promise<{tw:number, collision:boolean}|null>} null=用户取消 */
    function showScaleDialog(currentTW, showCollision, layerNames) {
        return new Promise(resolve => {
            const SUPPORTED = [4, 8, 16, 32];
            const isStd = SUPPORTED.includes(currentTW);
            const def = isStd ? currentTW : 16;
            const hasLayers = showCollision && Array.isArray(layerNames) && layerNames.length > 0;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#2d2d2d;color:#fff;padding:20px 24px;border-radius:8px;max-width:440px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);';
            box.innerHTML =
                '<div style="font-size:15px;font-weight:bold;margin-bottom:10px;">选择目标瓦片尺寸</div>' +
                '<div style="font-size:13px;color:#bbb;margin-bottom:12px;line-height:1.6;">' +
                '原尺寸：<b style="color:#fff;">' + currentTW + 'px × ' + currentTW + 'px</b>' +
                (isStd ? '' : '<br><span style="color:#ffd479;">⚠ ' + currentTW + 'px 不受 Arcade 支持（仅 4/8/16/32px），必须缩放后才能在地图编辑器使用。</span>') +
                '<br>缩放将同时应用到瓦片与地图（面积平均重采样，保留像素风与细线）。</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<label style="font-size:14px;">目标尺寸</label>' +
                '<input id="tmx-tw-input" type="number" value="' + def + '" min="1" max="64" step="1" style="width:90px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">px</span></div>' +
                '<div style="display:flex;gap:6px;margin-bottom:16px;">' +
                SUPPORTED.map(t => '<button data-tw="' + t + '" style="padding:4px 12px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">' + t + 'px</button>').join('') +
                '</div>' +
                (showCollision
                    ? '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#ddd;margin-bottom:10px;cursor:pointer;">' +
                      '<input id="tmx-collision-cb" type="checkbox" checked style="width:16px;height:16px;accent-color:#2185d0;">' +
                      '导入碰撞（图块属性 <span style="font-family:monospace;">collision</span> / <span style="font-family:monospace;">solid</span> → 墙）</label>'
                    : '') +
                (hasLayers
                    ? '<div id="tmx-coll-layer-box" style="margin:0 0 16px 26px;padding:10px 12px;background:#262626;border:1px solid #444;border-radius:6px;">' +
                      '<div style="font-size:12px;color:#ffd479;margin-bottom:8px;line-height:1.5;">碰撞图层（多选，非空格子 → 墙）<br>建议选实体层（如 land/wall），勿选背景/装饰层</div>' +
                      layerNames.map(n =>
                          '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#ddd;margin:4px 0;cursor:pointer;">' +
                          '<input type="checkbox" class="tmx-coll-layer" value="' + n + '" style="width:15px;height:15px;accent-color:#2185d0;">' + n + '</label>').join('') +
                      '</div>'
                    : '') +
                '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                '<button id="tmx-tw-cancel" style="padding:8px 20px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>' +
                '<button id="tmx-tw-ok" style="padding:8px 20px;background:#2185d0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">确定</button>' +
                '</div>';
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            const input = box.querySelector('#tmx-tw-input');
            const errBox = document.createElement('div');
            errBox.style.cssText = 'color:#ff6b6b;font-size:12px;margin:-6px 0 10px;display:none;';
            box.insertBefore(errBox, box.children[box.children.length - 2]);
            const showErr = (m) => { errBox.textContent = m; errBox.style.display = 'block'; };
            box.querySelectorAll('button[data-tw]').forEach(b => {
                b.onclick = () => { input.value = b.getAttribute('data-tw'); showErr(''); };
            });
            const done = v => { document.body.removeChild(overlay); resolve(v); };
            box.querySelector('#tmx-tw-cancel').onclick = () => done(null);
            box.querySelector('#tmx-tw-ok').onclick = () => {
                const v = parseInt(input.value, 10);
                if (!v || v <= 0) { showErr('请输入有效的像素尺寸'); return; }
                if (!SUPPORTED.includes(v)) { showErr('Arcade 仅支持 4 / 8 / 16 / 32px，请重新输入'); return; }
                const cb = box.querySelector('#tmx-collision-cb');
                const layers = [];
                if (cb && cb.checked) {
                    box.querySelectorAll('.tmx-coll-layer').forEach(c => { if (c.checked) layers.push(c.value); });
                }
                done({ tw: v, collision: cb ? cb.checked : true, collisionLayers: layers });
            };
        });
    }

    async function processFiles(files) {
        const mapFile = files.find(f => /\.tmx$|\.tmj$/i.test(f.name));
        const tsxFiles = files.filter(f => /\.tsx$|\.tsj$/i.test(f.name));
        const pngFiles = files.filter(f => /\.png$/i.test(f.name));

        try {
            let result;
            if (mapFile) {
                if (!pngFiles.length) { showMsg('导入 Tiled 地图', '需要同时选择 tileset 图片（PNG）才能转换。\n请选择：.tmx（地图）+ .tsx（可选，tileset 定义）+ .png（tileset 图片）'); return; }
                // v8.6 多 tileset：tsx 按文件名建表，PNG 按文件名建表（ts.imgSrc 文件名 ↔ PNG 文件名自动匹配）
                const tsxMap = new Map();
                for (const f of tsxFiles) tsxMap.set(baseName(f.name), await f.text());
                const pxMap = new Map();
                for (const f of pngFiles) {
                    const img = await loadImageFile(f);
                    pxMap.set(baseName(f.name), loadPngPixels(img));
                }
                const tmx = await parseTmx(await mapFile.text(), tsxMap.size ? tsxMap : null);
                // 图层清单按 Tiled 面板顺序（从上到下）展示：XML 渲染序是 background 在底、endflag 在顶，需反转
                const opts = await showScaleDialog(tmx.tilewidth, true, tmx.layers.slice().reverse().map(l => l.name));
                if (!opts) return; // 用户取消
                result = convert(tmx, pxMap, opts.tw, opts.collision, opts.collisionLayers);
            } else if (tsxFiles.length) {
                if (!pngFiles.length) { showMsg('导入 Tiled 瓦片', '需要同时选择 tileset 图片（PNG）。\n请选择：.tsx（tileset 定义）+ .png（tileset 图片）'); return; }
                const tsxText = await tsxFiles[0].text();
                const img = await loadImageFile(pngFiles[0]);
                const px = loadPngPixels(img);
                const srcTW = peekTileWidth(tsxText);
                const opts = await showScaleDialog(srcTW || 16, false);
                if (!opts) return; // 用户取消
                result = convertTsxOnly(tsxText, px, opts.tw);
            } else {
                showMsg('导入 Tiled', '请选择 .tmx/.tmj 地图文件，或 .tsx/.tsj tileset 文件（两者都需配 PNG）。');
                return;
            }

            const am = findAssetManager();
            if (!am) {
                showMsg('导入失败', '未找到编辑器的资产管理器实例。\n可能原因：编辑器版本差异。请把控制台输出发给我排查。');
                console.log('[TMXImport] pxt keys:', window.pxt ? Object.keys(window.pxt).join(',') : 'no pxt');
                return;
            }

            const written = writeAssets(am, result);
            const usedNote = (mapFile && result.usedTileCount) ? '，地图用到 ' + result.usedTileCount + ' 种' : '';
            const flipNote = (mapFile && result.flipTileCount) ? '（含翻转烘焙 ' + result.flipTileCount + ' 种）' : '';
            const cs = result.collisionStats || { props: 0, layers: 0 };
            const colParts = [];
            if (mapFile && result.collision) {
                if (cs.props > 0) colParts.push('图块属性 ' + cs.props + ' 格');
                if (cs.layers > 0) colParts.push('图层 ' + cs.layers + ' 格');
                if (colParts.length) colParts.push('共 ' + Array.from(result.collision).filter(v => v !== 0).length + ' 格');
            }
            const colNote = colParts.length
                ? '\n碰撞：已写入 ' + colParts.join('，') + '（值 2=墙）'
                : (mapFile && result.collision ? '\n碰撞：未写入（未勾选或素材无碰撞来源）' : '');
            const scaleNote = result.scaledFrom
                ? '\n\n⚠ 瓦片已从 ' + result.scaledFrom + 'px 缩放为 ' + result.tilewidth + 'px（面积平均重采样，保留像素风与细线）。\n地图格数与瓦片引用已同步，打开地图后即可在 My Tiles 中使用。'
                : '';
            const msg = (mapFile ? '地图 ' + result.w + 'x' + result.h + '，tile ' + result.tilewidth + 'px\n' : '') +
                '瓦片 ' + written.tileCount + ' 个（图集全量）' + usedNote + flipNote +
                (written.mapId ? '\n地图资产：' + written.mapId : '') +
                colNote +
                scaleNote +
                '\n\n可在「资产」面板查看和使用。';
            showMsg('导入成功', msg);
            console.log('[TMXImport] OK:', written, '诊断:', (result.diag || []).join('; '));
        } catch (err) {
            showMsg('导入失败', err && err.message ? err.message : String(err));
            console.error('[TMXImport] error:', err);
        }
    }

    function openPicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.tmx,.tmj,.tsx,.tsj,.png,.json';
        input.style.display = 'none';
        input.onchange = () => {
            const files = Array.from(input.files || []);
            if (files.length) processFiles(files);
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => document.body.removeChild(input), 10000);
    }

    function setupUI() {
        // 与 inject.js 既有「导入图片/动画/SB3/GIF/MIDI」按钮同款 fixed 定位做法，
        // 放在该按钮排最左端（right:440px，紧邻「导入MIDI」right:360px 左侧）
        const addBtn = () => {
            if (document.getElementById('tmx-import-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'tmx-import-btn';
            btn.textContent = '导入Tiled';
            btn.title = '导入 Tiled 瓦片地图（.tmx/.tsx + PNG）';
            btn.style.cssText = `
                position: fixed; top: 60px; right: 440px; z-index: 10001;
                padding: 8px 16px; background: #6435c9; color: white;
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            btn.addEventListener('click', openPicker);
            document.body.appendChild(btn);
            console.log('[TMXImport] 按钮已添加（fixed 右上角 right:440px，与导入MIDI同排）');
        };
        setTimeout(addBtn, 3000);
        setTimeout(addBtn, 6000);
        setTimeout(addBtn, 12000);
        setTimeout(addBtn, 20000);
    }

    /* ========== 启动 ========== */
    console.log('[TMXImport] Tiled 地图导入功能加载（.tmx/.tsx → 资产）');
    setupUI();

    // 暴露调试接口
    window.__tmxImport = { findAssetManager: findAssetManager, parseTmx: parseTmx, convert: convert, convertTsxOnly: convertTsxOnly, writeAssets: writeAssets, base64ToBitmapData: base64ToBitmapData, f4EncodeImg: f4EncodeImg, parseGid: parseGid, flipSrc: flipSrc, parseTileProps: parseTileProps };
})();


/* ============================================================
 * [ImgScale] 导入图片 / 导入动画 像素缩放选择（v8.10）
 * 覆盖方案（前 1294 行基线逐字节不变）：
 *   1) 克隆替换「导入图片」(#arcade-import-btn) 与「导入动画」
 *      (#arcade-import-anim-btn)：cloneNode(false) 不复制旧监听 → 新监听
 *      选文件 → 弹缩放对话框 → 面积平均重采样 → 写资产。
 *   2) 拖拽：document 注册 capture 阶段 drop 监听，先于旧 bubble handler
 *      执行并 stopImmediatePropagation 阻止旧逻辑，走同一对话框流程。
 *   3) 缩放对话框（v8.9）：原尺寸 + 目标宽度/高度双输入 + 「保持宽高比」
 *      checkbox（默认勾选，联动换算；取消可自由指定宽高）+ 等比快捷
 *      （100%/50%/25%/12.5%）+ 精灵尺寸快捷（16×16/32×32/64×64/128×128，
 *      点击自动解锁等比并固定像素）。
 *   v8.10 新增：百分比输入框（1~800 任意值，按原尺寸等比缩放）。输入
 *     百分比即换算宽高；改宽/高（等比勾选时）反向同步百分比；等比快捷
 *     同步百分比；取消等比/精灵快捷时百分比禁用。确定返回 {dstW,dstH,
 *     percent}。
 *   4) 重采样：面积平均 box 滤波（与 Tiled 导入一致，保留像素风与细线）。
 *   5) 调色板：pxt.appTarget.runtime.palette 优先，回退 Matte 16 色。
 *   6) 资产写入复用 TMX 模块的 findAssetManager（window.__tmxImport）。
 *   7) 按钮接管（v8.9.2）：querySelectorAll 处理全部同 id 匹配（编辑器
 *      多次注入会 append 多批同 id 按钮），MutationObserver 持续监听 +
 *      2s 轮询 120s 兜底。
 * ============================================================ */
/* img-scale-inject.js —— v8.8：导入图片 / 导入动画 增加像素缩放选择
 * 覆盖方案（不动前 1294 行基线）：
 *   1) 克隆替换「导入图片」(#arcade-import-btn) 与「导入动画」(#arcade-import-anim-btn) 按钮，
 *      新监听：选文件 → 弹缩放对话框（原尺寸 + 目标宽度输入 + 等比快捷按钮）→
 *      面积平均 box 滤波重采样 → 写入资产（复用 TMX 模块的 findAssetManager）。
 *   2) 拖拽：document 注册 capture 阶段 drop 监听，先于旧 bubble handler 执行并
 *      stopImmediatePropagation，走同一对话框流程。
 * 调色板：pxt.appTarget.runtime.palette 优先，回退 Matte（与旧 ArcadeCustom 一致）。
 */
(function () {
    'use strict';

    const LOG = '[ImgScale]';
    function log() { console.log.apply(console, [LOG].concat(Array.prototype.slice.call(arguments))); }

    /* ===== 调色板（与旧 ArcadeCustom 同源逻辑） ===== */
    function getPalette() {
        if (window.pxt && window.pxt.appTarget && window.pxt.appTarget.runtime &&
            window.pxt.appTarget.runtime.palette && window.pxt.appTarget.runtime.palette.length >= 16) {
            return window.pxt.appTarget.runtime.palette.map(c => {
                const hex = c.replace('#', '');
                return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
            });
        }
        return [
            [0, 0, 0], [0xFF, 0xF1, 0xE8], [0xFF, 0x00, 0x4D], [0xFF, 0x77, 0xA8],
            [0xFF, 0xA3, 0x00], [0xFF, 0xEC, 0x27], [0x00, 0x87, 0x51], [0x00, 0xE4, 0x36],
            [0x29, 0xAD, 0xFF], [0xC2, 0xC3, 0xC7], [0x7E, 0x25, 0x53], [0x83, 0x76, 0x9C],
            [0x5F, 0x57, 0x4F], [0xFF, 0xCC, 0xAA], [0xAB, 0x52, 0x36], [0x1D, 0x2B, 0x53]
        ];
    }
    function findClosestColor(pal, r, g, b, a) {
        if (a < 128) return 0;
        let minDist = Infinity, closest = 0;
        for (let i = 1; i < pal.length; i++) {
            const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
            const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
            if (dist < minDist) { minDist = dist; closest = i; }
        }
        return closest;
    }

    /* ===== 面积平均 box 滤波重采样（保留像素风与细线，与 Tiled 导入一致） ===== */
    function boxScale(imgData, srcW, srcH, dstW, dstH) {
        const out = new Uint8ClampedArray(dstW * dstH * 4);
        for (let y = 0; y < dstH; y++) {
            const y0 = Math.min(Math.floor(y * srcH / dstH), srcH - 1);
            const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * srcH / dstH)), srcH);
            for (let x = 0; x < dstW; x++) {
                const x0 = Math.min(Math.floor(x * srcW / dstW), srcW - 1);
                const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * srcW / dstW)), srcW);
                let r = 0, g = 0, b = 0, a = 0, n = 0;
                for (let sy = y0; sy < y1; sy++)
                    for (let sx = x0; sx < x1; sx++) {
                        const i = (sy * srcW + sx) * 4;
                        r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; a += imgData[i + 3]; n++;
                    }
                const o = (y * dstW + x) * 4;
                out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
                out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
            }
        }
        return out;
    }

    /* ===== RGBA → Arcade BitmapData（4bit 调色板索引，与旧 pngToBitmap 一致） ===== */
    function pngToBitmap(pal, rgba, width, height) {
        if (window.pxt && window.pxt.sprite && window.pxt.sprite.Bitmap) {
            const bmp = new window.pxt.sprite.Bitmap(width, height);
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    bmp.set(x, y, findClosestColor(pal, rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]));
                }
            return bmp.data();
        }
        const buf = new Uint8ClampedArray(Math.ceil(width * height / 2));
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const ci = findClosestColor(pal, rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]);
                const pi = x + y * width, bi = Math.floor(pi / 2);
                if (pi % 2 === 0) buf[bi] = (buf[bi] & 0xF0) | (ci & 0x0F);
                else buf[bi] = (buf[bi] & 0x0F) | ((ci & 0x0F) << 4);
            }
        return { width: width, height: height, data: buf };
    }

    /* ===== 缩放对话框（原尺寸 + 目标像素输入 + 等比/固定尺寸双模式） ===== */
    function showScaleDialog(srcW, srcH) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#2d2d2d;color:#fff;padding:20px 24px;border-radius:8px;max-width:480px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);';
            const def = srcW;
            box.innerHTML =
                '<div style="font-size:15px;font-weight:bold;margin-bottom:10px;">选择目标尺寸</div>' +
                '<div style="font-size:13px;color:#bbb;margin-bottom:12px;line-height:1.6;">' +
                '原尺寸：<b style="color:#fff;">' + srcW + 'px × ' + srcH + 'px</b>' +
                '<br>输入目标像素（面积平均重采样，保留像素风与细线）。勾选「保持宽高比」时改一边自动换算另一边；' +
                '取消勾选可自由指定宽高（如把精灵图直接缩到 16×16 / 32×32）。</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                '<label style="font-size:14px;">目标宽度</label>' +
                '<input id="imgscale-w-input" type="number" value="' + def + '" min="1" max="4096" step="1" style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">px</span>' +
                '<span style="font-size:14px;color:#bbb;">×</span>' +
                '<label style="font-size:14px;">高度</label>' +
                '<input id="imgscale-h-input" type="number" value="' + srcH + '" min="1" max="4096" step="1" style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">px</span></div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<label style="font-size:14px;">百分比</label>' +
                '<input id="imgscale-percent" type="number" value="100" min="1" max="800" step="1" style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">%（1~800，按原尺寸等比缩放；取消勾选保持宽高比时不可用）</span></div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<input id="imgscale-ratio" type="checkbox" checked style="width:16px;height:16px;">' +
                '<label for="imgscale-ratio" style="font-size:13px;color:#bbb;">保持宽高比（改一边自动换算另一边）</label></div>' +
                '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;">' +
                '<span style="font-size:12px;color:#bbb;">等比:</span>' +
                [1, 0.5, 0.25, 0.125].map(r =>
                    '<button data-ratio="' + r + '" style="padding:4px 12px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">' + (r === 1 ? '100%' : r * 100 + '%') + '</button>').join('') +
                '</div>' +
                '<div style="display:flex;gap:6px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">' +
                '<span style="font-size:12px;color:#bbb;">精灵尺寸:</span>' +
                [16, 32, 64, 128].map(v =>
                    '<button data-px="' + v + '" style="padding:4px 12px;background:#3a6ea8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">' + v + '×' + v + '</button>').join('') +
                '</div>' +
                '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                '<button id="imgscale-cancel" style="padding:8px 20px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>' +
                '<button id="imgscale-ok" style="padding:8px 20px;background:#2185d0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">确定</button>' +
                '</div>';
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            const wInput = box.querySelector('#imgscale-w-input');
            const hInput = box.querySelector('#imgscale-h-input');
            const ratioCb = box.querySelector('#imgscale-ratio');
            const percentInput = box.querySelector('#imgscale-percent');
            const errBox = document.createElement('div');
            errBox.style.cssText = 'color:#ff6b6b;font-size:12px;margin:-4px 0 10px;display:none;';
            box.insertBefore(errBox, box.children[box.children.length - 2]);
            const showErr = m => { errBox.textContent = m; errBox.style.display = m ? 'block' : 'none'; };
            const ratioW = srcW / srcH; // 宽/高
            // 百分比框：等比模式下由当前宽高同步；非等比（自由指定/精灵快捷）时禁用
            const syncPercent = () => {
                percentInput.disabled = !ratioCb.checked;
                percentInput.style.opacity = ratioCb.checked ? '1' : '0.4';
                if (ratioCb.checked) {
                    const w = parseInt(wInput.value, 10) || 0;
                    if (w > 0) percentInput.value = Math.round(w / srcW * 100);
                }
            };
            syncPercent();
            // 百分比输入：1~800 任意值 → 等比换算宽高
            percentInput.addEventListener('input', () => {
                if (!ratioCb.checked) return;
                const p = parseFloat(percentInput.value);
                if (isNaN(p)) { showErr('请输入有效百分比（1~800）'); return; }
                if (p < 1 || p > 800) { showErr('百分比需在 1~800 之间'); return; }
                showErr('');
                ratioCb.checked = true;
                wInput.value = Math.max(1, Math.round(srcW * p / 100));
                hInput.value = Math.max(1, Math.round(srcH * p / 100));
            });
            ratioCb.addEventListener('change', syncPercent);
            // 等比联动：改宽 → 高 = 宽/ratioW；改高 → 宽 = 高*ratioW；并同步百分比
            wInput.addEventListener('input', () => {
                if (!ratioCb.checked) return;
                const v = parseInt(wInput.value, 10);
                if (v > 0) hInput.value = Math.max(1, Math.round(v / ratioW));
                syncPercent();
            });
            hInput.addEventListener('input', () => {
                if (!ratioCb.checked) return;
                const v = parseInt(hInput.value, 10);
                if (v > 0) wInput.value = Math.max(1, Math.round(v * ratioW));
                syncPercent();
            });
            box.querySelectorAll('button[data-ratio]').forEach(b => {
                b.onclick = () => {
                    const r = parseFloat(b.getAttribute('data-ratio'));
                    const v = Math.max(1, Math.round(srcW * r));
                    wInput.value = v;
                    hInput.value = Math.max(1, Math.round(srcH * r));
                    percentInput.value = Math.round(r * 100);
                    ratioCb.checked = true;
                    syncPercent();
                    showErr('');
                };
            });
            box.querySelectorAll('button[data-px]').forEach(b => {
                b.onclick = () => {
                    const v = parseInt(b.getAttribute('data-px'), 10);
                    ratioCb.checked = false; // 固定像素：解锁等比，宽高各自指定
                    wInput.value = v; hInput.value = v;
                    syncPercent(); // 百分比禁用
                    showErr('');
                };
            });
            const done = v => { document.body.removeChild(overlay); resolve(v); };
            box.querySelector('#imgscale-cancel').onclick = () => done(null);
            box.querySelector('#imgscale-ok').onclick = () => {
                const w = parseInt(wInput.value, 10), h = parseInt(hInput.value, 10);
                if (!w || w <= 0 || !h || h <= 0) { showErr('请输入有效的像素宽高'); return; }
                if (w > 4096 || h > 4096) { showErr('尺寸过大（上限 4096px）'); return; }
                done({ dstW: w, dstH: h, percent: ratioCb.checked ? (parseFloat(percentInput.value) || 100) : null });
            };
        });
    }

    /* ===== 文件读取 → 对话框 → 缩放 → 资产写入 ===== */
    function readImageData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve({ w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data, name: file.name.replace(/\.[^/.]+$/, '') });
                };
                img.onerror = () => reject(new Error('图片加载失败: ' + file.name));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    function am() { return (window.__tmxImport && window.__tmxImport.findAssetManager) ? window.__tmxImport.findAssetManager() : null; }

    function writeImage(pal, bmpData, name) {
        const assetManager = am();
        if (!assetManager || typeof assetManager.createNewProjectImage !== 'function') return false;
        const asset = assetManager.createNewProjectImage(bmpData, name);
        if (assetManager.onChange) assetManager.onChange();
        if (assetManager.listeners) assetManager.listeners.forEach(l => { if (l.callback) try { l.callback(); } catch (e) {} });
        window.dispatchEvent(new CustomEvent('asset-updated'));
        log('图片资产已写入:', name, bmpData.width + 'x' + bmpData.height, '| asset:', asset && asset.id);
        return true;
    }

    function writeAnimation(frames, interval, name) {
        const assetManager = am();
        if (!assetManager || typeof assetManager.createNewAnimationFromData !== 'function') return false;
        const asset = assetManager.createNewAnimationFromData(frames, interval, name);
        if (assetManager.onChange) assetManager.onChange();
        if (assetManager.listeners) assetManager.listeners.forEach(l => { if (l.callback) try { l.callback(); } catch (e) {} });
        window.dispatchEvent(new CustomEvent('asset-updated'));
        log('动画资产已写入:', name, frames.length + ' 帧', interval + 'ms');
        return true;
    }

    async function handleImageFile(file) {
        try {
            const { w, h, data, name } = await readImageData(file);
            const opts = await showScaleDialog(w, h);
            if (!opts) return; // 取消
            const rgba = (opts.dstW === w && opts.dstH === h) ? data : boxScale(data, w, h, opts.dstW, opts.dstH);
            const pal = getPalette();
            const bmpData = pngToBitmap(pal, rgba, opts.dstW, opts.dstH);
            if (!writeImage(pal, bmpData, name)) {
                // 兜底：提示用户（资产写入失败，旧逻辑走 img literal，但保持提示即可）
                await showMsg('导入图片', '图片已转换 ' + opts.dstW + 'x' + opts.dstH + 'px，但资产写入失败（未找到资产管理器）。');
                return;
            }
            await showMsg('导入图片', '图片已导入资产：' + name + '（' + opts.dstW + 'x' + opts.dstH + 'px，原 ' + w + 'x' + h + 'px）\n请切换到「资源」标签查看。');
        } catch (e) {
            await showMsg('导入图片', '导入失败：' + (e && e.message || e));
        }
    }

    async function handleAnimationFiles(files) {
        try {
            if (files.length < 2) { await showMsg('导入动画', '请选择至少 2 张图片作为动画帧'); return; }
            const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            const first = await readImageData(sorted[0]);
            const opts = await showScaleDialog(first.w, first.h);
            if (!opts) return; // 取消
            const intervalStr = await showPrompt('请输入帧间隔（毫秒），默认 200ms：', '200');
            if (intervalStr === null) return;
            const interval = parseInt(intervalStr) || 200;
            await showMsg('导入动画', '正在导入 ' + sorted.length + ' 帧动画...');
            const pal = getPalette();
            const frames = [];
            for (const f of sorted) {
                const img = await readImageData(f);
                const rgba = (opts.dstW === img.w && opts.dstH === img.h) ? img.data : boxScale(img.data, img.w, img.h, opts.dstW, opts.dstH);
                frames.push(pngToBitmap(pal, rgba, opts.dstW, opts.dstH));
            }
            const baseName = sorted[0].name.replace(/\.[^/.]+$/, '').replace(/[_\-]?\d+$/, '');
            if (!writeAnimation(frames, interval, baseName + '_anim')) {
                await showMsg('导入动画', '动画已转换（' + frames.length + ' 帧 ' + opts.dstW + 'x' + opts.dstH + 'px），但资产写入失败（未找到资产管理器）。');
                return;
            }
            await showMsg('导入动画', '动画已导入！共 ' + frames.length + ' 帧，间隔 ' + interval + 'ms，尺寸 ' + opts.dstW + 'x' + opts.dstH + 'px。\n请在「资源」标签查看。');
        } catch (e) {
            await showMsg('导入动画', '导入失败：' + (e && e.message || e));
        }
    }

    /* ===== 提示框（独立实现，防依赖） ===== */
    function showMsg(title, body) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;';
            dialog.innerHTML = '<div style="margin-bottom:12px;font-size:16px;font-weight:600;">' + title + '</div>' +
                '<div style="font-size:14px;color:#333;white-space:pre-wrap;margin-bottom:16px;">' + body + '</div>' +
                '<div style="text-align:right;"><button id="imgscale-msg-ok" style="padding:8px 20px;background:#2185d0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">确定</button></div>';
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            dialog.querySelector('#imgscale-msg-ok').onclick = () => { document.body.removeChild(overlay); resolve(); };
        });
    }
    function showPrompt(message, defaultValue) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;';
            dialog.innerHTML = '<div style="margin-bottom:12px;font-size:14px;color:#333;white-space:pre-wrap;">' + message + '</div>' +
                '<input id="imgscale-prompt-input" type="text" value="' + defaultValue + '" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px;box-sizing:border-box;margin-bottom:12px;">' +
                '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                '<button id="imgscale-prompt-cancel" style="padding:8px 20px;background:#888;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>' +
                '<button id="imgscale-prompt-ok" style="padding:8px 20px;background:#2185d0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">确定</button></div>';
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            const input = dialog.querySelector('#imgscale-prompt-input');
            dialog.querySelector('#imgscale-prompt-ok').onclick = () => { document.body.removeChild(overlay); resolve(input.value); };
            dialog.querySelector('#imgscale-prompt-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
            setTimeout(() => input.focus(), 50);
        });
    }

    /* ===== 覆盖旧按钮（克隆节点替换 → 旧监听消失） =====
     * 注意：编辑器环境会多次注入（页面导航/重载），ArcadeCustom 每次都会
     * append 一批全新的同 id 按钮。必须 querySelectorAll 处理所有匹配，
     * 逐个替换未带 data-imgscale 的按钮，否则后创建的重复按钮漏网，
     * 用户点到上层旧按钮仍走旧流程。 */
    function replaceButton(id, filesHandler, multiple) {
        const nodes = document.querySelectorAll('#' + id);
        if (!nodes.length) { log('replaceButton(' + id + '): 未找到（稍后重试）'); return false; }
        let replaced = 0;
        nodes.forEach(old => {
            if (old.getAttribute('data-imgscale')) return; // 已接管
            const n = old.cloneNode(false); // 克隆不复制事件监听器
            n.setAttribute('data-imgscale', '1');
            n.textContent = old.textContent;
            n.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/png,image/jpeg,image/jpg,image/bmp';
                input.multiple = !!multiple;
                input.addEventListener('change', e => { if (e.target.files.length) filesHandler(e.target.files); });
                input.click();
            });
            old.parentNode.replaceChild(n, old);
            replaced++;
        });
        if (replaced) log('replaceButton(' + id + '): 替换成功 ' + replaced + '/' + nodes.length);
        return nodes.length > 0;
    }

    function install() {
        log('install 开始: readyState=' + document.readyState + ' body=' + !!document.body);
        let imgDone = false, animDone = false;
        const tryReplace = () => {
            if (replaceButton('arcade-import-btn', files => handleImageFile(files[0]), false)) imgDone = true;
            if (replaceButton('arcade-import-anim-btn', files => handleAnimationFiles(files), true)) animDone = true;
            if (imgDone && animDone) log('按钮覆盖完成 图片: true 动画: true');
            return imgDone && animDone;
        };
        tryReplace();
        // MutationObserver 兜底：持续监听（不 disconnect），每次重复注入
        // 创建的新按钮一出现即被接管
        const MO = window.MutationObserver || globalThis.MutationObserver;
        if (typeof MO === 'function' && document.body) {
            try {
                const mo = new MO(() => { tryReplace(); });
                mo.observe(document.body, { childList: true, subtree: true });
                log('install: MutationObserver 已挂载（持续监听）');
            } catch (e) { log('install: MutationObserver 挂载失败:', e.message); }
        }
        // 定时轮询兜底（最长 120s，覆盖 observer 不可用/挂载前已存在的按钮）
        const poll = setInterval(() => {
            tryReplace();
        }, 2000);
        setTimeout(() => clearInterval(poll), 120000);
        // 拖拽：capture 阶段拦截，先于旧 bubble handler（stopImmediatePropagation 阻止其执行）
        document.addEventListener('drop', e => {
            if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const files = Array.from(e.dataTransfer.files);
            if (files.some(f => f.type && f.type.startsWith('image/'))) {
                if (files.length >= 2 && files.every(f => f.type && f.type.startsWith('image/'))) handleAnimationFiles(files);
                else handleImageFile(files[0]);
            }
        }, true);
        document.addEventListener('dragover', e => { e.preventDefault(); }, true);
        log('图片/动画缩放导入已启用（按钮覆盖 + 拖拽拦截）');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();

    // 测试/复用暴露
    window.__imgScale = {
        boxScale: boxScale, pngToBitmap: pngToBitmap, getPalette: getPalette,
        findClosestColor: findClosestColor, showScaleDialog: showScaleDialog,
        handleImageFile: handleImageFile, handleAnimationFiles: handleAnimationFiles,
        replaceButton: replaceButton, install: install
    };
})();

/* ============================================================
 * [ImportMenu] 导入按钮收纳为顶部「导入▾」下拉菜单（v8.9.3）
 * 背景：6 个导入按钮（导入Tiled/MIDI/GIF/SB3/动画/图片）fixed top:60px
 *   从右往左横排于编辑区右上角，打开地图编辑器时会遮挡其「墙显示开关」
 *   按钮。v8.9.3 把按钮收纳为顶部导航栏「导入▾」下拉菜单：
 *   1) 隐藏全部原按钮（display:none，保留原监听与行为）；
 *   2) 顶部主页按钮左侧（fixed top:64px right:350px）放置单个「导入▾」
 *      按钮，点击展开 6 项菜单（导入Tiled/MIDI/GIF/SB3/动画/图片）；
 *   3) 点菜单项 → 查找对应原按钮并 click() 触发其原逻辑（图片/动画为
 *      img-scale 已接管按钮，触发其新监听弹缩放对话框）；
 *   4) MutationObserver 持续监听 + 2s 轮询：重复注入新建的按钮同样被
 *      隐藏并由菜单接管。
 * ============================================================ */
(function () {
    'use strict';
    /* ============================================================
     * [ImportMenu] 导入按钮收纳为顶部「导入▾」下拉菜单（v8.9.3）
     * 背景：6 个导入按钮（Tiled/MIDI/GIF/SB3/动画/图片）fixed top:60px
     *   从右往左横排，覆盖编辑区右上角，会遮挡地图编辑器的墙显示开关。
     * 方案：隐藏全部原按钮（保留监听），在顶部导航栏主页按钮左侧放
     *   一个「导入▾」下拉按钮，点击弹出 6 项菜单 → 触发对应原按钮 click。
     *   图片/动画按钮已被 img-scale 接管（新监听弹缩放对话框），触发
     *   click 仍走新流程。持续监听：每次重复注入新建的按钮也被隐藏并
     *   由菜单接管。
     * ============================================================ */
    function log() { console.log.apply(console, ['[ImportMenu]'].concat(Array.prototype.slice.call(arguments))); }

    var BTN_DEFS = [
        { id: 'tmx-import-btn', label: '导入Tiled' },
        { id: 'arcade-import-midi-btn', label: '导入MIDI' },
        { id: 'arcade-import-gif-btn', label: '导入GIF' },
        { id: 'arcade-import-sb3-btn', label: '导入SB3' },
        { id: 'arcade-import-anim-btn', label: '导入动画' },
        { id: 'arcade-import-btn', label: '导入图片' }
    ];

    function hideAll() {
        BTN_DEFS.forEach(function (d) {
            document.querySelectorAll('#' + d.id).forEach(function (b) { b.style.display = 'none'; });
        });
    }

    function trigger(id) {
        var b = document.getElementById(id);
        if (!b) { log('触发失败：' + id + ' 尚未创建'); return; }
        b.click();
    }

    function setupMenu() {
        if (document.getElementById('import-menu-root')) return;
        var btn = document.createElement('button');
        btn.id = 'import-menu-root';
        btn.textContent = '导入 ▾';
        btn.title = '导入外部资源（Tiled 地图 / 图片 / 动画 / GIF / SB3 / MIDI）';
        btn.style.cssText = 'position:fixed;top:64px;right:350px;z-index:99999;' +
            'padding:6px 14px;background:#ffffff;color:#333;border:1px solid #ccc;border-radius:4px;' +
            'cursor:pointer;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:sans-serif;';
        var panel = document.createElement('div');
        panel.id = 'import-menu-panel';
        panel.style.cssText = 'position:fixed;top:100px;right:350px;z-index:99999;display:none;' +
            'background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.2);' +
            'min-width:130px;padding:4px 0;font-family:sans-serif;';
        BTN_DEFS.forEach(function (d) {
            var item = document.createElement('div');
            item.textContent = d.label;
            item.style.cssText = 'padding:8px 16px;font-size:13px;color:#333;cursor:pointer;white-space:nowrap;';
            item.addEventListener('mouseenter', function () { item.style.background = '#f0f5ff'; });
            item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                panel.style.display = 'none';
                trigger(d.id);
            });
            panel.appendChild(item);
        });
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        });
        document.addEventListener('click', function () { panel.style.display = 'none'; });
        document.body.appendChild(btn);
        document.body.appendChild(panel);
        log('顶部导入菜单已创建');
    }

    function install() {
        log('install 开始: readyState=' + document.readyState);
        var run = function () { setupMenu(); hideAll(); };
        run();
        var MO = window.MutationObserver || globalThis.MutationObserver;
        if (typeof MO === 'function' && document.body) {
            try {
                var mo = new MO(function () { run(); });
                mo.observe(document.body, { childList: true, subtree: true });
                log('MutationObserver 已挂载（持续监听）');
            } catch (e) { log('MutationObserver 挂载失败:', e.message); }
        }
        setInterval(run, 2000);
        log('顶部导入菜单已启用');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();

    window.__importMenu = { hideAll: hideAll, trigger: trigger, setupMenu: setupMenu, install: install };
})();
