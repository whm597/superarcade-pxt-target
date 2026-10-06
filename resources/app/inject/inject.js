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
