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

    async function parseTmx(text, tsxText) {
        const diag = [];
        let tsxInfo = null;
        if (tsxText) {
            const t = String(tsxText).trim();
            try {
                if (t.startsWith("{")) {
                    const j = JSON.parse(t);
                    tsxInfo = {
                        tilewidth: j.tilewidth, tileheight: j.tileheight,
                        margin: j.margin || 0, spacing: j.spacing || 0,
                        imgW: (j.image && j.image.width) || 0, imgH: (j.image && j.image.height) || 0
                    };
                } else {
                    const doc = new DOMParser().parseFromString(t, "application/xml");
                    const tsEl = doc.querySelector("tileset");
                    if (tsEl) {
                        const img = tsEl.querySelector("image");
                        tsxInfo = {
                            tilewidth: parseInt(tsEl.getAttribute("tilewidth")),
                            tileheight: parseInt(tsEl.getAttribute("tileheight")),
                            margin: parseInt(tsEl.getAttribute("margin") || 0),
                            spacing: parseInt(tsEl.getAttribute("spacing") || 0),
                            imgW: img ? parseInt(img.getAttribute("width")) : 0,
                            imgH: img ? parseInt(img.getAttribute("height")) : 0
                        };
                    }
                }
            } catch (e) { diag.push("tsx 解析失败: " + e.message); }
        }

        const backfill = (ts, imgSize) => {
            const out = Object.assign({}, ts);
            if ((!out.tilewidth || !out.tileheight || !out.imgW || !out.imgH) && tsxInfo) {
                if (!out.tilewidth && tsxInfo.tilewidth) out.tilewidth = tsxInfo.tilewidth;
                if (!out.tileheight && tsxInfo.tileheight) out.tileheight = tsxInfo.tileheight;
                if (!out.margin && tsxInfo.margin) out.margin = tsxInfo.margin;
                if (!out.spacing && tsxInfo.spacing) out.spacing = tsxInfo.spacing;
                if (!out.imgW && tsxInfo.imgW) out.imgW = tsxInfo.imgW;
                if (!out.imgH && tsxInfo.imgH) out.imgH = tsxInfo.imgH;
            }
            if ((!out.imgW || !out.imgH) && imgSize) {
                out.imgW = imgSize.w;
                out.imgH = imgSize.h;
            }
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
                tilesets.push(backfill({
                    firstgid: ts.firstgid, name: ts.name || "", src: ts.source || "",
                    tilewidth: ts.tilewidth, tileheight: ts.tileheight,
                    imgW: ts.imagewidth || 0, imgH: ts.imageheight || 0,
                    margin: ts.margin || 0, spacing: ts.spacing || 0
                }, null));
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
                tilesets.push(backfill({
                    firstgid: parseInt(ts.getAttribute("firstgid")),
                    name: ts.getAttribute("name") || "",
                    src: ts.getAttribute("source"),
                    tilewidth: parseInt(ts.getAttribute("tilewidth")),
                    tileheight: parseInt(ts.getAttribute("tileheight")),
                    imgW: img ? parseInt(img.getAttribute("width")) : 0,
                    imgH: img ? parseInt(img.getAttribute("height")) : 0,
                    margin: parseInt(ts.getAttribute("margin") || 0),
                    spacing: parseInt(ts.getAttribute("spacing") || 0)
                }, null));
            });
        }
        return { w, h, tilewidth: tw, tileheight: th, layers, tilesets, diag };
    }

    function convert(tmx, px, targetTW) {
        if (tmx.tilewidth !== tmx.tileheight)
            throw new Error("tilewidth 必须等于 tileheight（Arcade 只支持正方形 tile）");
        const tileW = tmx.tilewidth;
        if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");
        const tss = tmx.tilesets.slice().sort((a, b) => a.firstgid - b.firstgid);
        if (!tss.length) throw new Error("没有找到 tileset 信息");

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

        const gidLookup = new Map();
        tss.forEach(ts => {
            const cols = Math.floor((ts.imgW - 2 * ts.margin + ts.spacing) / (ts.tilewidth + ts.spacing));
            const rows = Math.floor((ts.imgH - 2 * ts.margin + ts.spacing) / (ts.tileheight + ts.spacing));
            if (!cols || !rows) return;
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++)
                    gidLookup.set(ts.firstgid + (r * cols + c), { ts, r, c });
        });
        if (!gidLookup.size)
            throw new Error("无法从图片切出 tile（图片 " + px.w + "x" + px.h + "，tile " + tileW + "px）");

        const mapW = tmx.w, mapH = tmx.h;
        const merged = new Uint8Array(mapW * mapH);
        tmx.layers.forEach(l => {
            for (let i = 0; i < mapW * mapH; i++) if (l.gids[i] !== 0) merged[i] = l.gids[i];
        });

        const usedGids = [...new Set(merged)].filter(g => g !== 0).sort((a, b) => a - b);
        if (usedGids.length > 255)
            throw new Error("地图用到 " + usedGids.length + " 种 tile，超过 Arcade 上限 255");
        const gidMap = new Map();
        usedGids.forEach((g, i) => gidMap.set(g, i + 1));

        const getPix = (ts, r, c, x, y) => {
            const sx = ts.margin + c * (ts.tilewidth + ts.spacing) + x;
            const sy = ts.margin + r * (ts.tileheight + ts.spacing) + y;
            const ix = Math.min(px.w - 1, Math.floor(sx));
            const iy = Math.min(px.h - 1, Math.floor(sy));
            const idx = (iy * px.w + ix) * 4;
            return nearestColor(px.data[idx], px.data[idx + 1], px.data[idx + 2], px.data[idx + 3]);
        };
        // 面积平均（box filter）：目标像素 = 源区域调色板颜色平均，再最近色量化。
        // 修复最近邻采样在非整数倍缩放（如 40→16，步长 2.5）时跳过细线（砖缝）导致"垂直拉长"失真
        const boxAvg = (ts, r, c, tileW, x0, x1, y0, y1) => {
            let sr = 0, sg = 0, sb = 0, n = 0;
            for (let y = y0; y < y1; y++)
                for (let x = x0; x < x1; x++) {
                    const ci = getPix(ts, r, c, Math.min(x, tileW - 1), Math.min(y, tileW - 1));
                    if (!ci) continue;
                    sr += PALETTE[ci][0]; sg += PALETTE[ci][1]; sb += PALETTE[ci][2]; n++;
                }
            return n ? nearestColor(sr / n, sg / n, sb / n, 255) : 0;
        };
        // 全量导入：图集所有瓦片（含地图未用到的）——瓦片资产无 255 上限，仅地图用到的受数据区索引限制
        const tileAssets = [];
        const gidToAssetId = new Map();
        {
            let ti = 0;
            for (const [g, tt] of gidLookup) {
                if (!tt) continue;
                // 缩放：面积平均重采样为 outTW×outTW（保留砖缝等细线，非整数倍缩放不失真）
                const scale = tileW / outTW;
                const bytes = f4EncodeImg(outTW, outTW, (x, y) => {
                    const x0 = Math.min(Math.floor(x * scale), tileW - 1);
                    const y0 = Math.min(Math.floor(y * scale), tileW - 1);
                    const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tileW);
                    const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tileW);
                    return boxAvg(tt.ts, tt.r, tt.c, tileW, x0, x1, y0, y1);
                });
                const id = "tile" + ti++;
                tileAssets.push({ id: id, data: bytesToBase64(new Uint8Array(bytes)) });
                gidToAssetId.set(g, id);
            }
        }
        if (!tileAssets.length) throw new Error("图集中没有可导入的瓦片");
        // tileset 引用：按数据区重映射顺序（索引 1..N ↔ tiles 数组下标 1..N）
        const tilesetRefs = usedGids.map(g => gidToAssetId.get(g)).filter(Boolean);

        // 数据区：紧凑重映射索引 1..N（每格 1 字节，直接供官方 Tilemap.set 写入）
        const index = new Uint8Array(mapW * mapH);
        for (let y = 0; y < mapH; y++)
            for (let x = 0; x < mapW; x++)
                index[y * mapW + x] = gidMap.get(merged[y * mapW + x]) || 0;

        return {
            tileAssets,
            tilemap: { index: index, tileset: tilesetRefs },
            w: mapW, h: mapH, tilewidth: outTW,
            scaledFrom: scaled ? tileW : null,
            tileCount: tileAssets.length,
            usedTileCount: usedGids.length
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
        for (const ta of result.tileAssets) {
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
            if (!tile) continue;
            created.push(tile);
            out.tileIds.push(tile.id || ta.id);
        }
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
                // 兜底：手动构造官方结构 TilemapData
                const tilemap = new window.pxt.sprite.Tilemap(result.w, result.h);
                const collision = new window.pxt.sprite.Bitmap(result.w, result.h);
                td = new window.pxt.sprite.TilemapData(tilemap, { tileWidth: result.tilewidth, tiles: [getTransparencyTile(am, result.tilewidth)] }, collision.data());
            }
            // 写入格子（数据区索引 1..N，每格 1 字节）
            const idx = result.tilemap.index;
            for (let y = 0; y < result.h; y++)
                for (let x = 0; x < result.w; x++)
                    td.tilemap.set(x, y, idx[y * result.w + x] || 0);
            // tileset.tiles 必须与地图格子索引（紧凑重映射 1..N）对齐：
            // 格子索引 i → tileset.tiles[i] = usedGids[i-1] 对应的瓦片。
            // 不能用全量顺序 [trans].concat(created)（created 按 gid 1..400 全量顺序）：
            // 非连续 gid（如背景 gid85 → 紧凑索引 48）会引用错瓦片 → 地图显示错乱/背景消失。
            const trans = td.tileset.tiles[0] || getTransparencyTile(am, result.tilewidth);
            const refs = (result.tilemap && result.tilemap.tileset) || [];
            const byId = new Map();
            created.forEach(t => byId.set(t.id, t));
            // convert 输出的引用 id 为 "tileN"（无命名空间），createNewTile 后 id 为 "myTiles.tileN"——归一匹配
            const norm = (id) => (id.indexOf(".") >= 0 ? id : tileNs + "." + id);
            const aligned = refs.map(id => byId.get(norm(id)) || byId.get(id)).filter(Boolean);
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

    /** 导入时选择目标瓦片尺寸（像素输入框 + 快捷按钮；Arcade 仅支持 4/8/16/32px） */
    function showScaleDialog(currentTW) {
        return new Promise(resolve => {
            const SUPPORTED = [4, 8, 16, 32];
            const isStd = SUPPORTED.includes(currentTW);
            const def = isStd ? currentTW : 16;
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
                done(v);
            };
        });
    }

    async function processFiles(files) {
        const mapFile = files.find(f => /\.tmx$|\.tmj$/i.test(f.name));
        const tsxFile = files.find(f => /\.tsx$|\.tsj$/i.test(f.name));
        const pngFile = files.find(f => /\.png$/i.test(f.name));

        try {
            let result;
            if (mapFile) {
                if (!pngFile) { showMsg('导入 Tiled 地图', '需要同时选择 tileset 图片（PNG）才能转换。\n请选择：.tmx（地图）+ .tsx（可选，tileset 定义）+ .png（tileset 图片）'); return; }
                const tsxText = tsxFile ? await tsxFile.text() : null;
                const img = await loadImageFile(pngFile);
                const px = loadPngPixels(img);
                const tmx = await parseTmx(await mapFile.text(), tsxText);
                const targetTW = await showScaleDialog(tmx.tilewidth);
                if (!targetTW) return; // 用户取消
                result = convert(tmx, px, targetTW);
            } else if (tsxFile) {
                if (!pngFile) { showMsg('导入 Tiled 瓦片', '需要同时选择 tileset 图片（PNG）。\n请选择：.tsx（tileset 定义）+ .png（tileset 图片）'); return; }
                const tsxText = await tsxFile.text();
                const img = await loadImageFile(pngFile);
                const px = loadPngPixels(img);
                const srcTW = peekTileWidth(tsxText);
                const targetTW = await showScaleDialog(srcTW || 16);
                if (!targetTW) return; // 用户取消
                result = convertTsxOnly(tsxText, px, targetTW);
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
            const scaleNote = result.scaledFrom
                ? '\n\n⚠ 瓦片已从 ' + result.scaledFrom + 'px 缩放为 ' + result.tilewidth + 'px（面积平均重采样，保留像素风与细线）。\n地图格数与瓦片引用已同步，打开地图后即可在 My Tiles 中使用。'
                : '';
            const msg = (mapFile ? '地图 ' + result.w + 'x' + result.h + '，tile ' + result.tilewidth + 'px\n' : '') +
                '瓦片 ' + written.tileCount + ' 个（图集全量）' + usedNote +
                (written.mapId ? '\n地图资产：' + written.mapId : '') +
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
    window.__tmxImport = { findAssetManager: findAssetManager, parseTmx: parseTmx, convert: convert, convertTsxOnly: convertTsxOnly, writeAssets: writeAssets, base64ToBitmapData: base64ToBitmapData, f4EncodeImg: f4EncodeImg };
})();
