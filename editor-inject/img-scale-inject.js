/* img-scale-inject.js —— v8.8→v8.11：导入图片 / 导入动画 缩放选择（统一像素 / 按百分比双模式，v8.11 图片多选）
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

    /* ===== 缩放对话框（v8.11：统一像素 / 按百分比 双模式 + 多文件计数）
     * 模式语义：
     *   px（统一像素）：所有图片/帧缩放到同一目标宽高（可自由指定、可保持宽高比）
     *   pct（按百分比）：每张图片/每帧按各自原尺寸 × 百分比 分别缩放
     * 等比快捷按钮 → 切 pct 模式（本质是百分比快捷）；精灵尺寸快捷 → px 模式（固定像素）。
     * 返回 { mode:'px', dstW, dstH } 或 { mode:'pct', percent, dstW(预览), dstH(预览) } */
    function showScaleDialog(srcW, srcH, multiCount) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#2d2d2d;color:#fff;padding:20px 24px;border-radius:8px;max-width:500px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);';
            const def = srcW;
            const info = multiCount > 1
                ? ('共 <b style="color:#fff;">' + multiCount + '</b> 张，以第 1 张为例 原尺寸：<b style="color:#fff;">' + srcW + 'px × ' + srcH + 'px</b>')
                : ('原尺寸：<b style="color:#fff;">' + srcW + 'px × ' + srcH + 'px</b>');
            box.innerHTML =
                '<div style="font-size:15px;font-weight:bold;margin-bottom:10px;">选择缩放方式</div>' +
                '<div style="font-size:13px;color:#bbb;margin-bottom:12px;line-height:1.6;">' + info +
                '<br>· <b style="color:#fff;">统一像素</b>：全部图片/帧缩放到同一宽高（可保持宽高比或自由指定）' +
                '<br>· <b style="color:#fff;">按百分比</b>：每张/每帧按各自原尺寸缩放（适合尺寸不一的动画帧/图片组）。</div>' +
                '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap;">' +
                '<span style="font-size:13px;color:#bbb;">缩放方式:</span>' +
                '<label style="font-size:13px;color:#eee;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="radio" name="imgscale-mode" value="px" checked style="width:14px;height:14px;">统一像素</label>' +
                '<label style="font-size:13px;color:#eee;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="radio" name="imgscale-mode" value="pct" style="width:14px;height:14px;">按百分比</label></div>' +
                '<div id="imgscale-pxrow">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                '<label style="font-size:14px;">目标宽度</label>' +
                '<input id="imgscale-w-input" type="number" value="' + def + '" min="1" max="4096" step="1" style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">px</span>' +
                '<span style="font-size:14px;color:#bbb;">×</span>' +
                '<label style="font-size:14px;">高度</label>' +
                '<input id="imgscale-h-input" type="number" value="' + srcH + '" min="1" max="4096" step="1" style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">px</span></div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<input id="imgscale-ratio" type="checkbox" checked style="width:16px;height:16px;">' +
                '<label for="imgscale-ratio" style="font-size:13px;color:#bbb;">保持宽高比（改一边自动换算另一边）</label></div>' +
                '</div>' +
                '<div id="imgscale-pctrow" style="opacity:0.4;">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<label style="font-size:14px;">百分比</label>' +
                '<input id="imgscale-percent" type="number" value="100" min="1" max="800" step="1" disabled style="width:88px;padding:6px 8px;background:#1d1d1d;color:#fff;border:1px solid #555;border-radius:4px;font-size:14px;text-align:center;">' +
                '<span style="font-size:13px;color:#bbb;">%（1~800，每张/每帧按各自原尺寸缩放）</span></div>' +
                '</div>' +
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
            const modePx = box.querySelector('input[name="imgscale-mode"][value="px"]');
            const modePct = box.querySelector('input[name="imgscale-mode"][value="pct"]');
            const pxRow = box.querySelector('#imgscale-pxrow');
            const pctRow = box.querySelector('#imgscale-pctrow');
            const errBox = document.createElement('div');
            errBox.style.cssText = 'color:#ff6b6b;font-size:12px;margin:-4px 0 10px;display:none;';
            box.insertBefore(errBox, box.children[box.children.length - 2]);
            const showErr = m => { errBox.textContent = m; errBox.style.display = m ? 'block' : 'none'; };
            const ratioW = srcW / srcH; // 宽/高
            // 模式切换：px = 宽高可用/百分比禁用；pct = 百分比可用/宽高禁用
            const syncMode = () => {
                const isPct = modePct.checked;
                pxRow.style.opacity = isPct ? '0.4' : '1';
                pctRow.style.opacity = isPct ? '1' : '0.4';
                wInput.disabled = isPct; hInput.disabled = isPct;
                percentInput.disabled = !isPct;
                ratioCb.disabled = isPct;
                showErr('');
            };
            modePx.addEventListener('change', syncMode);
            modePct.addEventListener('change', syncMode);
            // 百分比输入：1~800 任意值 → 等比换算宽高（px 预览值，pct 模式确定时用）
            percentInput.addEventListener('input', () => {
                if (!modePct.checked) return;
                const p = parseFloat(percentInput.value);
                if (isNaN(p)) { showErr('请输入有效百分比（1~800）'); return; }
                if (p < 1 || p > 800) { showErr('百分比需在 1~800 之间'); return; }
                showErr('');
                wInput.value = Math.max(1, Math.round(srcW * p / 100));
                hInput.value = Math.max(1, Math.round(srcH * p / 100));
            });
            // 等比联动（仅 px 模式）：改宽 → 高 = 宽/ratioW；改高 → 宽 = 高*ratioW
            wInput.addEventListener('input', () => {
                if (!ratioCb.checked) return;
                const v = parseInt(wInput.value, 10);
                if (v > 0) hInput.value = Math.max(1, Math.round(v / ratioW));
            });
            hInput.addEventListener('input', () => {
                if (!ratioCb.checked) return;
                const v = parseInt(hInput.value, 10);
                if (v > 0) wInput.value = Math.max(1, Math.round(v * ratioW));
            });
            // 等比快捷 → 切 pct 模式并填入百分比（本质是百分比快捷）
            box.querySelectorAll('button[data-ratio]').forEach(b => {
                b.onclick = () => {
                    const r = parseFloat(b.getAttribute('data-ratio'));
                    modePct.checked = true;
                    percentInput.value = Math.round(r * 100);
                    wInput.value = Math.max(1, Math.round(srcW * r));
                    hInput.value = Math.max(1, Math.round(srcH * r));
                    syncMode();
                    showErr('');
                };
            });
            // 精灵尺寸快捷 → px 模式固定像素（解锁等比，自由指定）
            box.querySelectorAll('button[data-px]').forEach(b => {
                b.onclick = () => {
                    const v = parseInt(b.getAttribute('data-px'), 10);
                    modePx.checked = true;
                    ratioCb.checked = false;
                    wInput.value = v; hInput.value = v;
                    syncMode();
                    showErr('');
                };
            });
            const done = v => { document.body.removeChild(overlay); resolve(v); };
            box.querySelector('#imgscale-cancel').onclick = () => done(null);
            box.querySelector('#imgscale-ok').onclick = () => {
                if (modePct.checked) {
                    const p = parseFloat(percentInput.value);
                    if (isNaN(p) || p < 1 || p > 800) { showErr('请输入有效百分比（1~800）'); return; }
                    done({ mode: 'pct', percent: p, dstW: parseInt(wInput.value, 10) || srcW, dstH: parseInt(hInput.value, 10) || srcH });
                    return;
                }
                const w = parseInt(wInput.value, 10), h = parseInt(hInput.value, 10);
                if (!w || w <= 0 || !h || h <= 0) { showErr('请输入有效的像素宽高'); return; }
                if (w > 4096 || h > 4096) { showErr('尺寸过大（上限 4096px）'); return; }
                done({ mode: 'px', dstW: w, dstH: h, percent: null });
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

    /* ===== 目标尺寸计算（v8.11 单一来源）：
     * mode='pct' → 每张/每帧按各自原尺寸 × percent/100 分别缩放
     * mode='px'  → 全部统一到 dstW×dstH */
    function calcDst(mode, srcW, srcH, opts) {
        if (mode === 'pct') {
            return [Math.max(1, Math.round(srcW * opts.percent / 100)), Math.max(1, Math.round(srcH * opts.percent / 100))];
        }
        return [opts.dstW, opts.dstH];
    }

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

    async function handleImageFiles(files) {
        try {
            const list = Array.prototype.slice.call(files || []);
            if (!list.length) return;
            const first = await readImageData(list[0]);
            const opts = await showScaleDialog(first.w, first.h, list.length);
            if (!opts) return; // 取消
            const pal = getPalette();
            const isPct = opts.mode === 'pct';
            const imported = [];
            for (const f of list) {
                const img = await readImageData(f);
                const dims = calcDst(opts.mode, img.w, img.h, opts);
                const dw = dims[0], dh = dims[1];
                const rgba = (dw === img.w && dh === img.h) ? img.data : boxScale(img.data, img.w, img.h, dw, dh);
                const bmpData = pngToBitmap(pal, rgba, dw, dh);
                if (!writeImage(pal, bmpData, img.name)) {
                    await showMsg('导入图片', '图片已转换，但资产写入失败（未找到资产管理器）。');
                    return;
                }
                imported.push(img.name + ' ' + dw + 'x' + dh);
            }
            const LIST_MAX = 60;
            const listText = imported.length > LIST_MAX
                ? imported.slice(0, LIST_MAX).join('\n') + '\n…（其余 ' + (imported.length - LIST_MAX) + ' 张略，可滚动查看）'
                : imported.join('\n');
            await showMsg('导入图片', '已导入 ' + imported.length + ' 张图片：\n' + listText + '\n请切换到「资源」标签查看。');
        } catch (e) {
            await showMsg('导入图片', '导入失败：' + (e && e.message || e));
        }
    }

    async function handleAnimationFiles(files) {
        try {
            if (files.length < 2) { await showMsg('导入动画', '请选择至少 2 张图片作为动画帧'); return; }
            const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            const first = await readImageData(sorted[0]);
            const opts = await showScaleDialog(first.w, first.h, sorted.length);
            if (!opts) return; // 取消
            const intervalStr = await showPrompt('请输入帧间隔（毫秒），默认 200ms：', '200');
            if (intervalStr === null) return;
            const interval = parseInt(intervalStr) || 200;
            await showMsg('导入动画', '正在导入 ' + sorted.length + ' 帧动画...');
            const pal = getPalette();
            const isPct = opts.mode === 'pct';
            const frames = [];
            const sizes = [];
            for (const f of sorted) {
                const img = await readImageData(f);
                const dims = calcDst(opts.mode, img.w, img.h, opts);
                const dw = dims[0], dh = dims[1];
                const rgba = (dw === img.w && dh === img.h) ? img.data : boxScale(img.data, img.w, img.h, dw, dh);
                frames.push(pngToBitmap(pal, rgba, dw, dh));
                sizes.push(dw + 'x' + dh);
            }
            const baseName = sorted[0].name.replace(/\.[^/.]+$/, '').replace(/[_\-]?\d+$/, '');
            if (!writeAnimation(frames, interval, baseName + '_anim')) {
                await showMsg('导入动画', '动画已转换（' + frames.length + ' 帧' + (isPct ? '，按各自原尺寸缩放' : ' ' + opts.dstW + 'x' + opts.dstH + 'px') + '），但资产写入失败（未找到资产管理器）。');
                return;
            }
            const LIST_MAX = 60;
            const sizeText = sizes.length > LIST_MAX ? sizes.slice(0, LIST_MAX).join(', ') + ', …（其余 ' + (sizes.length - LIST_MAX) + ' 帧略）' : sizes.join(', ');
            await showMsg('导入动画', '动画已导入！共 ' + frames.length + ' 帧，间隔 ' + interval + 'ms' +
                (isPct ? '，按百分比分别缩放：' + sizeText : '，尺寸 ' + opts.dstW + 'x' + opts.dstH + 'px') +
                '\n请在「资源」标签查看。');
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
            // v8.12：flex 纵向布局 + 正文区可滚动，保证「确定」按钮始终可见（图片/动画批量导入清单过长时不再被顶出视口）
            dialog.style.cssText = 'background:white;padding:20px 24px;border-radius:8px;max-width:480px;width:90vw;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:sans-serif;display:flex;flex-direction:column;max-height:80vh;';
            dialog.innerHTML = '<div style="margin-bottom:12px;font-size:16px;font-weight:600;flex-shrink:0;">' + title + '</div>' +
                '<div style="font-size:14px;color:#333;white-space:pre-wrap;margin-bottom:12px;overflow-y:auto;flex:1 1 auto;min-height:0;word-break:break-all;">' + body + '</div>' +
                '<div style="text-align:right;flex-shrink:0;padding-top:10px;border-top:1px solid #eee;"><button id="imgscale-msg-ok" style="padding:8px 20px;background:#2185d0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">确定</button></div>';
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
            if (replaceButton('arcade-import-btn', files => handleImageFiles(files), true)) imgDone = true;
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
            const files = Array.from(e.dataTransfer.files).filter(f => f.type && f.type.startsWith('image/'));
            if (files.length) handleImageFiles(files); // 拖拽多张 → 图片多选导入（动画请用「导入动画」按钮）
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
        handleImageFiles: handleImageFiles, handleAnimationFiles: handleAnimationFiles,
        calcDst: calcDst, showMsg: showMsg,
        replaceButton: replaceButton, install: install
    };
})();
