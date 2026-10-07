/**
 * TMXImport Core - Tiled(.tmx/.tsx/.tmj/.tsj + PNG) → MakeCode Arcade 资产
 * 转换逻辑从 tmx2arcade.html 移植，输出资产对象（tile + tilemap）
 * 运行环境：编辑器主页面（inject.js 注入）或 Node（测试）
 * 依赖：DOMParser（浏览器/jsdom）、DecompressionStream（浏览器/Chromium）
 */

/* ================= Arcade 16 色调色板（与 runtime.palette 一致；0=透明） ================= */
const TMXP_PALETTE = [
    [0, 0, 0],        // 0 transparent
    [255, 255, 255],  // 1
    [255, 33, 33],    // 2
    [255, 147, 196],  // 3
    [255, 129, 53],   // 4
    [255, 246, 9],    // 5
    [36, 156, 163],   // 6
    [120, 220, 82],   // 7
    [0, 63, 173],     // 8
    [135, 242, 255],  // 9
    [142, 46, 196],   // 10
    [164, 131, 159],  // 11
    [92, 64, 108],    // 12
    [229, 205, 196],  // 13
    [145, 70, 61],    // 14
    [0, 0, 0]         // 15
];

/* ================= f4 (x-mkcd-f4) 编码（与 pxt f4EncodeImg 一致） ================= */
function tmxpF4EncodeImg(w, h, getPix) {
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

function tmxpNearestColor(r, g, b, a) {
    if (a < 128) return 0;
    let best = 1, bestD = Infinity;
    for (let i = 1; i < 16; i++) {
        const dr = r - TMXP_PALETTE[i][0], dg = g - TMXP_PALETTE[i][1], db = b - TMXP_PALETTE[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

function tmxpBytesToBase64(bytes) {
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

function tmxpUint8ArrayToHex(bytes) {
    const HEX = "0123456789abcdef";
    let res = "";
    for (let i = 0; i < bytes.length; i++) {
        res += HEX[bytes[i] >> 4];
        res += HEX[bytes[i] & 0xf];
    }
    return res;
}

/** PNG 解码辅助：getImageData 需要 canvas。注入环境直接用 Image + canvas；Node 测试用 stub。 */
function tmxpLoadPngPixels(img) {
    // img: HTMLImageElement（浏览器）。返回 {w, h, data: Uint8ClampedArray RGBA}
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
}

/* ================= base64 图层数据 → gid 数组（zlib/gzip 解压） ================= */
async function tmxpDecodeTileData(text, enc, comp, w, h) {
    if (enc === "csv" || (!enc && !comp)) {
        const gids = text.split(/[\s,]+/).filter(s => s !== "").map(Number);
        if (gids.length) return gids;
        return null;
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

async function tmxpParseLayerEl(l, w, h) {
    const name = l.getAttribute("name") || "layer";
    const dataEl = l.querySelector("data");
    if (!dataEl) return { name, gids: null, reason: "无 <data>（对象层/空层）" };
    const enc = dataEl.getAttribute("encoding");
    const comp = dataEl.getAttribute("compression");
    const chunks = dataEl.querySelectorAll("chunk");
    if (chunks.length) {
        let gids = (w && h) ? new Array(w * h).fill(0) : null;
        for (const c of chunks) {
            const cx = parseInt(c.getAttribute("x")), cy = parseInt(c.getAttribute("y"));
            const cw = parseInt(c.getAttribute("width")), chh = parseInt(c.getAttribute("height"));
            const cg = await tmxpDecodeTileData(c.textContent, enc, comp, cw, chh);
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
    const gids = await tmxpDecodeTileData(dataEl.textContent, enc, comp, w, h);
    if (gids && (!w || !h || gids.length === w * h)) return { name, gids };
    return { name, gids, reason: "数据长度 " + (gids ? gids.length : 0) + " ≠ " + w + "x" + h };
}

async function tmxpCollectLayers(root, w, h) {
    const out = [];
    const diag = [];
    const walk = async (el) => {
        for (const child of el.children) {
            if (child.tagName === "group") { await walk(child); continue; }
            if (child.tagName === "layer") {
                const r = await tmxpParseLayerEl(child, w, h);
                if (r.gids && r.gids.length) out.push({ name: r.name, gids: r.gids });
                else diag.push("图层 '" + r.name + "' 跳过（" + r.reason + "）");
            }
        }
    };
    await walk(root);
    return { layers: out, diag };
}

/**
 * 解析 tmx 文本（XML 或 JSON .tmj）→ 结构化数据
 * @param {string} text .tmx 或 .tmj 内容
 * @param {string|null} tsxText 外部 tileset（.tsx/.tsj）内容，可选
 * @returns {Promise<{w,h,tilewidth,tileheight,layers,tilesets,diag}>}
 */
async function tmxpParseTmx(text, tsxText) {
    const diag = [];
    let tsxInfo = null;
    if (tsxText) {
        const t = tsxText.trim();
        try {
            if (t.startsWith("{")) {
                const j = JSON.parse(t);
                tsxInfo = {
                    tilewidth: j.tilewidth, tileheight: j.tileheight, columns: j.columns,
                    margin: j.margin || 0, spacing: j.spacing || 0,
                    imgW: (j.image && j.image.width) || 0, imgH: (j.image && j.image.height) || 0,
                    imgSrc: (j.image && j.image.source) || ""
                };
            } else {
                const doc = new DOMParser().parseFromString(t, "application/xml");
                const tsEl = doc.querySelector("tileset");
                if (tsEl) {
                    const img = tsEl.querySelector("image");
                    tsxInfo = {
                        tilewidth: parseInt(tsEl.getAttribute("tilewidth")),
                        tileheight: parseInt(tsEl.getAttribute("tileheight")),
                        columns: parseInt(tsEl.getAttribute("columns")),
                        margin: parseInt(tsEl.getAttribute("margin") || 0),
                        spacing: parseInt(tsEl.getAttribute("spacing") || 0),
                        imgW: img ? parseInt(img.getAttribute("width")) : 0,
                        imgH: img ? parseInt(img.getAttribute("height")) : 0,
                        imgSrc: img ? (img.getAttribute("source") || "") : ""
                    };
                }
            }
        } catch (e) { diag.push("tsx/tsj 解析失败: " + e.message); }
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
            if (!out.imgSrc && tsxInfo.imgSrc) out.imgSrc = tsxInfo.imgSrc;
        }
        if ((!out.imgW || !out.imgH) && imgSize) {
            out.imgW = imgSize.w;
            out.imgH = imgSize.h;
        }
        return out;
    };

    let map, w, h, tw, th, layers = [], tilesets = [];
    const trimmed = String(text).trim();

    if (trimmed.startsWith("{")) {
        const j = JSON.parse(text);
        tw = j.tilewidth; th = j.tileheight;
        w = j.width; h = j.height;
        if (j.orientation && j.orientation !== "orthogonal") diag.push("非正交地图，仅支持 orthogonal");
        for (const l of j.layers || []) {
            if (l.type === "tilelayer" && Array.isArray(l.data)) layers.push({ name: l.name || "layer", gids: l.data });
            else diag.push("图层 '" + (l.name || "") + "' 跳过（type=" + (l.type || "?") + "）");
        }
        for (const ts of j.tilesets || []) {
            tilesets.push(backfill({
                firstgid: ts.firstgid, name: ts.name || "", src: ts.source || "",
                tilewidth: ts.tilewidth, tileheight: ts.tileheight,
                imgSrc: ts.image || "", imgW: ts.imagewidth || 0, imgH: ts.imageheight || 0,
                margin: ts.margin || 0, spacing: ts.spacing || 0
            }, null));
        }
    } else {
        const doc = new DOMParser().parseFromString(text, "application/xml");
        const root = doc.querySelector("map");
        if (!root) throw new Error("解析失败：没有 <map> 根节点");
        if (root.getAttribute("orientation") !== "orthogonal") diag.push("非正交地图，仅支持 orthogonal");
        tw = parseInt(root.getAttribute("tilewidth")); th = parseInt(root.getAttribute("tileheight"));
        w = parseInt(root.getAttribute("width")); h = parseInt(root.getAttribute("height"));
        const lr = await tmxpCollectLayers(root, w, h);
        layers = lr.layers; diag.push.apply(diag, lr.diag);
        root.querySelectorAll("tileset").forEach(ts => {
            const img = ts.querySelector("image");
            tilesets.push(backfill({
                firstgid: parseInt(ts.getAttribute("firstgid")),
                name: ts.getAttribute("name") || "",
                src: ts.getAttribute("source"),
                tilewidth: parseInt(ts.getAttribute("tilewidth")),
                tileheight: parseInt(ts.getAttribute("tileheight")),
                imgSrc: img ? (img.getAttribute("source") || "") : "",
                imgW: img ? parseInt(img.getAttribute("width")) : 0,
                imgH: img ? parseInt(img.getAttribute("height")) : 0,
                margin: parseInt(ts.getAttribute("margin") || 0),
                spacing: parseInt(ts.getAttribute("spacing") || 0)
            }, null));
        });
    }
    return { w, h, tilewidth: tw, tileheight: th, layers, tilesets, diag };
}

/**
 * 转换：tilemap 数据 + tileset 图片 → tile 资产（f4 base64）+ tilemap 资产数据
 * @param {object} tmx tmxpParseTmx 结果
 * @param {{w,h,data}} px tileset 图片 RGBA 像素（tmxpLoadPngPixels）
 * @param {Array<number>} mainLayerIdxs 主图层索引（合并，非0覆盖）；缺省=全部
 * @param {Array<number>} wallLayerIdxs 墙层索引（碰撞）；缺省=[]
 * @returns {{tileAssets:Array<{id,data}>, tilemap:{data,tileset}, w,h,tilewidth}}
 */
function tmxpConvert(tmx, px, mainLayerIdxs, wallLayerIdxs, targetTW) {
    if (tmx.tilewidth !== tmx.tileheight)
        throw new Error("tilewidth 必须等于 tileheight（Arcade 只支持正方形 tile），当前 " + tmx.tilewidth + "x" + tmx.tileheight);
    const tileW = tmx.tilewidth;
    if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");

    // Arcade 只支持 tile 尺寸 4/8/16/32；非标准尺寸（如 40px）自动缩放，也可由调用方显式指定 targetTW
    const SUPPORTED = [4, 8, 16, 32];
    let outTW;
    if (targetTW) {
        if (!SUPPORTED.includes(targetTW)) throw new Error("目标尺寸 " + targetTW + "px 不受 Arcade 支持（仅 4/8/16/32）");
        outTW = targetTW;
    } else {
        outTW = SUPPORTED.includes(tileW) ? tileW : 16;
    }
    const scaled = outTW !== tileW;

    const tss = tmx.tilesets.slice().sort((a, b) => a.firstgid - b.firstgid);
    if (!tss.length) throw new Error("没有找到 tileset 信息");

    // 建立 gid → {ts, r, c}
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
        throw new Error("无法从图片切出 tile（图片 " + (px.w || "?") + "x" + (px.h || "?") + "，tile " + tileW + "px）");

    // 合并主图层
    const mapW = tmx.w, mapH = tmx.h;
    const merged = new Uint16Array(mapW * mapH);  // gid 可超 255，Uint8 会截断（gid361→105 错配）
    const mainIdxs = (mainLayerIdxs && mainLayerIdxs.length) ? mainLayerIdxs : tmx.layers.map((_, i) => i);
    mainIdxs.forEach(idx => {
        const l = tmx.layers[idx];
        if (!l) return;
        for (let i = 0; i < mapW * mapH; i++) if (l.gids[i] !== 0) merged[i] = l.gids[i];
    });

    // gid 紧凑重映射 → 1..N
    const usedGids = [...new Set(merged)].filter(g => g !== 0).sort((a, b) => a - b);
    if (usedGids.length > 255)
        throw new Error("地图用到 " + usedGids.length + " 种 tile，超过 Arcade 上限 255，请拆分地图");
    const gidMap = new Map();
    usedGids.forEach((g, i) => gidMap.set(g, i + 1));

    // 生成 tile 资产：**全量导入**（图集所有瓦片，含地图未用到的）
    // 注意：只有"地图用到的瓦片数"受 Arcade tilemap 数据区 8bit 索引上限（255）约束，
    // 瓦片资产本身无此限制——未用到的瓦片也完整入库供用户使用。
    const getPix = (ts, r, c, x, y) => {
        const sx = ts.margin + c * (ts.tilewidth + ts.spacing) + x;
        const sy = ts.margin + r * (ts.tileheight + ts.spacing) + y;
        const ix = Math.min(px.w - 1, Math.floor(sx));
        const iy = Math.min(px.h - 1, Math.floor(sy));
        const idx = (iy * px.w + ix) * 4;
        return tmxpNearestColor(px.data[idx], px.data[idx + 1], px.data[idx + 2], px.data[idx + 3]);
    };
    // 面积平均（box filter）：目标像素 = 源区域调色板颜色平均，再最近色量化。
    // 修复最近邻采样在非整数倍缩放（如 40→16，步长 2.5）时跳过细线（砖缝）导致"垂直拉长"失真
    const boxAvg = (ts, r, c, tileW, x0, x1, y0, y1) => {
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const ci = getPix(ts, r, c, Math.min(x, tileW - 1), Math.min(y, tileW - 1));
                if (!ci) continue;
                sr += TMXP_PALETTE[ci][0]; sg += TMXP_PALETTE[ci][1]; sb += TMXP_PALETTE[ci][2]; n++;
            }
        return n ? tmxpNearestColor(sr / n, sg / n, sb / n, 255) : 0;
    };
    // —— 背景色检测（v8.5）：Arcade tilemap 单层无图层叠加，把地图用到的瓦片的
    //    透明像素填成背景色（出现 >50% 的 gid 视为背景层），模拟 Tiled 背景层叠加
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
                const ci = getPix(tt.ts, tt.r, tt.c, x, y);
                if (!ci) continue;
                sr += TMXP_PALETTE[ci][0]; sg += TMXP_PALETTE[ci][1]; sb += TMXP_PALETTE[ci][2]; n++;
            }
            if (n) bgColorIdx = tmxpNearestColor(sr / n, sg / n, sb / n, 255);
        }
    }
    const usedSet = new Set(usedGids);
    const tileAssets = [];
    const gidToAssetId = new Map();
    {
        let ti = 0;
        for (const [g, tt] of gidLookup) {
            if (!tt) continue;
            // 缩放：面积平均重采样（保留砖缝等细线，非整数倍缩放不失真）
            const scale = tileW / outTW;
            const bytes = tmxpF4EncodeImg(outTW, outTW, (x, y) => {
                const x0 = Math.min(Math.floor(x * scale), tileW - 1);
                const y0 = Math.min(Math.floor(y * scale), tileW - 1);
                const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tileW);
                const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tileW);
                let ci = boxAvg(tt.ts, tt.r, tt.c, tileW, x0, x1, y0, y1);
                // v8.5：地图用到的瓦片，透明像素填背景色（模拟 Tiled 背景层叠加，消除空洞）
                if (ci === 0 && bgColorIdx && usedSet.has(g)) ci = bgColorIdx;
                return ci;
            });
            const id = "tile" + ti++;
            tileAssets.push({ id: id, data: tmxpBytesToBase64(new Uint8Array(bytes)) });
            gidToAssetId.set(g, id);
        }
    }
    if (!tileAssets.length) throw new Error("图集中没有可导入的瓦片");
    // tilemap.tileset：**按数据区重映射顺序引用**（索引 1..N ↔ tiles 数组下标 1..N）
    const tilesetRefs = usedGids.map(g => gidToAssetId.get(g)).filter(Boolean);

    // tilemap data: [tileSize, w lo, w hi, h lo, h hi] + w*h 索引 + w*h 碰撞
    const data = new Uint8Array(5 + mapW * mapH * 2);
    data[0] = outTW;
    data[1] = mapW & 0xff; data[2] = (mapW >> 8) & 0xff;
    data[3] = mapH & 0xff; data[4] = (mapH >> 8) & 0xff;
    let ptr = 5;
    for (let y = 0; y < mapH; y++)
        for (let x = 0; x < mapW; x++)
            data[ptr++] = gidMap.get(merged[y * mapW + x]) || 0;
    const wallIdxs = wallLayerIdxs || [];
    for (let y = 0; y < mapH; y++)
        for (let x = 0; x < mapW; x++) {
            let wv = 0;
            for (const wi of wallIdxs) {
                const g = tmx.layers[wi] && tmx.layers[wi].gids[y * mapW + x];
                if (g !== 0) { wv = 1; break; }
            }
            data[ptr++] = wv;
        }
    const dataBytes = data.slice(0, ptr);
    const tilemapData = btoa(tmxpUint8ArrayToHex(dataBytes));

    return {
        tileAssets,
        tilemap: { data: tilemapData, tileset: tilesetRefs },
        w: mapW, h: mapH, tilewidth: outTW,
        scaledFrom: scaled ? tileW : null,
        tileCount: tileAssets.length,
        usedTileCount: usedGids.length
    };
}

/**
 * 纯 tileset 导入（无地图）：tsx/tsj + PNG → 全部 tile 资产
 * @param {string} tsxText .tsx XML 或 .tsj JSON
 * @param {{w,h,data}} px
 * @returns {{tileAssets:Array<{id,data}>, tilewidth}}
 */
function tmxpConvertTsxOnly(tsxText, px, targetTW) {
    let tw, th, columns, margin = 0, spacing = 0, imgW, imgH, imgSrc;
    const t = tsxText.trim();
    if (t.startsWith("{")) {
        const j = JSON.parse(t);
        tw = j.tilewidth; th = j.tileheight; columns = j.columns;
        margin = j.margin || 0; spacing = j.spacing || 0;
        imgW = (j.image && j.image.width) || 0; imgH = (j.image && j.image.height) || 0;
        imgSrc = (j.image && j.image.source) || "";
    } else {
        const doc = new DOMParser().parseFromString(t, "application/xml");
        const tsEl = doc.querySelector("tileset");
        if (!tsEl) throw new Error("没有 <tileset> 根节点");
        const img = tsEl.querySelector("image");
        tw = parseInt(tsEl.getAttribute("tilewidth"));
        th = parseInt(tsEl.getAttribute("tileheight"));
        columns = parseInt(tsEl.getAttribute("columns"));
        margin = parseInt(tsEl.getAttribute("margin") || 0);
        spacing = parseInt(tsEl.getAttribute("spacing") || 0);
        imgW = img ? parseInt(img.getAttribute("width")) : 0;
        imgH = img ? parseInt(img.getAttribute("height")) : 0;
        imgSrc = img ? (img.getAttribute("source") || "") : "";
    }
    if (!tw || !th) throw new Error("tileset 缺少 tilewidth/tileheight");
    if (tw !== th) throw new Error("tilewidth 必须等于 tileheight，当前 " + tw + "x" + th);
    if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");
    if (!imgW || !imgH) { imgW = px.w; imgH = px.h; }

    // Arcade 只支持 tile 尺寸 4/8/16/32；非标准尺寸自动缩放，也可由调用方显式指定 targetTW
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
    if (!cols || !rows) throw new Error("无法从图片切出 tile（图片 " + imgW + "x" + imgH + "，tile " + tw + "px）");
    // 全量导入：瓦片资产本身无 255 上限（255 限制仅针对 tilemap 数据区索引，纯 tsx 无地图不受限）

    const tileAssets = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const getPix = (x, y) => {
                const sx = margin + c * (tw + spacing) + x;
                const sy = margin + r * (th + spacing) + y;
                const ix = Math.min(px.w - 1, Math.floor(sx));
                const iy = Math.min(px.h - 1, Math.floor(sy));
                const idx = (iy * px.w + ix) * 4;
                return tmxpNearestColor(px.data[idx], px.data[idx + 1], px.data[idx + 2], px.data[idx + 3]);
            };
            // 面积平均重采样（保留砖缝等细线，非整数倍缩放不失真）
            const scale = tw / outTW;
            const boxAvg = (x0, x1, y0, y1) => {
                let sr = 0, sg = 0, sb = 0, n = 0;
                for (let y = y0; y < y1; y++)
                    for (let x = x0; x < x1; x++) {
                        const ci = getPix(Math.min(x, tw - 1), Math.min(y, tw - 1));
                        if (!ci) continue;
                        sr += TMXP_PALETTE[ci][0]; sg += TMXP_PALETTE[ci][1]; sb += TMXP_PALETTE[ci][2]; n++;
                    }
                return n ? tmxpNearestColor(sr / n, sg / n, sb / n, 255) : 0;
            };
            const bytes = tmxpF4EncodeImg(outTW, outTW, (x, y) => {
                const x0 = Math.min(Math.floor(x * scale), tw - 1);
                const y0 = Math.min(Math.floor(y * scale), tw - 1);
                const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tw);
                const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tw);
                return boxAvg(x0, x1, y0, y1);
            });
            tileAssets.push({ id: "tile" + (r * cols + c), data: tmxpBytesToBase64(new Uint8Array(bytes)) });
        }
    return { tileAssets, tilewidth: outTW, scaledFrom: scaled ? tw : null, tileCount: tileAssets.length };
}

/* 测试导出（Node 环境） */
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        tmxpParseTmx, tmxpConvert, tmxpConvertTsxOnly,
        tmxpDecodeTileData, tmxpF4EncodeImg, tmxpNearestColor,
        tmxpBytesToBase64, tmxpUint8ArrayToHex
    };
}
