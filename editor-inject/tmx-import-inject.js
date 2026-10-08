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
