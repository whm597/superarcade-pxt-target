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
