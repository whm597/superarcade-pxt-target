/**
 * TMXImport Core v8.6 - Tiled(.tmx/.tsx/.tmj/.tsj + PNG) → MakeCode Arcade 资产
 * 转换逻辑与 tmx-import-inject.js 内嵌核心保持单一来源同步（v5 铁律）。
 * v8.6 新增：①翻转位烘焙（gid 高位 H/V/D 标志→像素变换→烘焙瓦片）
 *           ②多 tileset 集合（tsx image source 文件名 ↔ PNG 文件名自动匹配）
 *           ③碰撞导入（图块属性 collision/solid → Arcade 碰撞值 2=TM_WALL，可选）
 * 运行环境：编辑器主页面（inject.js 注入）或 Node（测试）
 * 依赖：DOMParser（浏览器/jsdom）、DecompressionStream（浏览器/Chromium/Node22+）
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

/* ================= Tiled GID 翻转标志（官方 Global Tile IDs） =================
 * 0x80000000 = H（水平翻转）  0x40000000 = V（垂直翻转）
 * 0x20000000 = D（对角/反斜线翻转，x/y 轴交换）  0x10000000 = hex 旋转（正交地图忽略但必须清掉）
 * 组合应用顺序（官方文档）：D 先 → H → V。
 * 正变换 T(sx,sy)：
 *   D: (sy,sx)  →  H: (w-1-sx,sy)  →  V: (sx,w-1-sy)
 * 全翻转时 T = (w-1-sy, w-1-sx)。逆变换（输出→源）按 V→H→D 反推。
 */
const TMXP_FLIP_H = 0x80000000;
const TMXP_FLIP_V = 0x40000000;
const TMXP_FLIP_D = 0x20000000;
const TMXP_FLIP_HEX = 0x10000000;
const TMXP_GID_MASK = 0x0FFFFFFF;

/** 解析原始 gid → { gid: 剥离翻转后的全局 id, flip: bit0=H bit1=V bit2=D } */
function tmxpParseGid(raw) {
    let flip = 0;
    if (raw & TMXP_FLIP_H) flip |= 1;
    if (raw & TMXP_FLIP_V) flip |= 2;
    if (raw & TMXP_FLIP_D) flip |= 4;
    return { gid: raw & TMXP_GID_MASK, flip };
}

/** 翻转像素逆映射：输出坐标 (x,y) → 源瓦片内坐标 [sx, sy]（撤销 V→H→D） */
function tmxpFlipSrc(flip, w, x, y) {
    let px = x, py = y;
    if (flip & 2) py = w - 1 - py;          // 撤销 V
    if (flip & 1) px = w - 1 - px;          // 撤销 H
    if (flip & 4) { const t = px; px = py; py = t; }  // 撤销 D
    return [px, py];
}

/** 文件名 → 去扩展 basename（"map.png" → "map"） */
function tmxpBaseName(name) {
    if (!name) return "";
    const base = String(name).replace(/\\/g, "/").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
}

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
 * 解析 tsx/tsj 图块自定义属性：<tile id="N"><properties><property name="collision".../>
 * 属性名支持 collision / solid（bool→true；int→数值；string→字符串值）。
 * @returns {Map<number, boolean|number|string>} localId → 属性值
 */
function tmxpParseTileProps(tsText) {
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
                    // Tiled JSON 早期格式：[{name,type,value}]
                    for (const prop of p) {
                        if (prop && (prop.name === "collision" || prop.name === "solid")) {
                            const v = prop.value;
                            props.set(id, prop.type === "bool" ? v === true || v === "true" : v);
                        }
                    }
                } else if (typeof p === "object") {
                    // Tiled 1.5+ 格式：{ collision: true }
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

/**
 * 解析 tsx/tsj 文本 → tileset 定义信息（尺寸/图片/属性）
 */
function tmxpParseTsxInfo(tsxText) {
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
    info.tileProps = tmxpParseTileProps(tsxText);
    return info;
}

/**
 * 解析 tmx 文本（XML 或 JSON .tmj）→ 结构化数据
 * @param {string} text .tmx 或 .tmj 内容
 * @param {Map<string,string>|string|null} tsxMap 外部 tileset 内容表：
 *        Map<basename去扩展, 文本>（多 tileset，按 tmx 的 tileset source 文件名匹配）；
 *        或单个 tsx/tsj 文本（兼容旧调用：回填所有缺尺寸的 tileset）；null=无外部 tileset
 * @returns {Promise<{w,h,tilewidth,tileheight,layers,tilesets,diag}>}
 *          tilesets[i]: {firstgid,name,src,tilewidth,tileheight,imgSrc,imgW,imgH,margin,spacing,tileProps}
 */
async function tmxpParseTmx(text, tsxMapOrText) {
    const diag = [];
    const tsxMap = (tsxMapOrText instanceof Map) ? tsxMapOrText : null;
    const singleTsx = (typeof tsxMapOrText === "string") ? tsxMapOrText : null;
    let singleInfo = null;
    if (singleTsx) {
        singleInfo = tmxpParseTsxInfo(singleTsx);
    }
    // 供 tmx 内嵌 tileset（无 source）使用的外部回填信息
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
    // 按 tmx 的 tileset source 文件名匹配外部 tsx → 合并定义
    const applyTsx = (ts) => {
        if (!ts.src) return ts;
        const srcBase = tmxpBaseName(ts.src);
        let text = null;
        if (tsxMap && srcBase) text = tsxMap.get(srcBase) || null;
        if (!text) return ts; // 无对应 tsx：保留 tmx 内嵌信息
        const info = tmxpParseTsxInfo(text);
        const out = Object.assign({}, ts);
        if (!out.tilewidth && info.tilewidth) out.tilewidth = info.tilewidth;
        if (!out.tileheight && info.tileheight) out.tileheight = info.tileheight;
        if (!out.margin && info.margin) out.margin = info.margin;
        if (!out.spacing && info.spacing) out.spacing = info.spacing;
        if (!out.imgW && info.imgW) out.imgW = info.imgW;
        if (!out.imgH && info.imgH) out.imgH = info.imgH;
        if (!out.imgSrc && info.imgSrc) out.imgSrc = info.imgSrc;
        if (!out.name && info.name) out.name = info.name;
        if (info.tileProps) out.tileProps = info.tileProps;
        return out;
    };

    let w, h, tw, th, layers = [], tilesets = [];
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
            tilesets.push(applyTsx(backfill({
                firstgid: ts.firstgid, name: ts.name || "", src: ts.source || "",
                tilewidth: ts.tilewidth, tileheight: ts.tileheight,
                imgSrc: ts.image || "", imgW: ts.imagewidth || 0, imgH: ts.imageheight || 0,
                margin: ts.margin || 0, spacing: ts.spacing || 0,
                tileProps: null
            }, null)));
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
 * 转换：tilemap 数据 + tileset 图片 → tile 资产（f4 base64）+ tilemap 资产数据
 * @param {object} tmx tmxpParseTmx 结果
 * @param {{w,h,data}|Map<string,{w,h,data}>} pxOrPxMap 单张 tileset 图片 RGBA 像素，
 *        或多图集 Map<basename去扩展, 像素>（v8.6 多 tileset：按 ts.imgSrc 文件名匹配）
 * @param {Array<number>} mainLayerIdxs 主图层索引（合并，非0覆盖）；缺省=全部
 * @param {Array<number>} wallLayerIdxs 墙层索引（碰撞，兼容旧调用）；缺省=[]
 * @param {number|null} targetTW 目标瓦片尺寸（4/8/16/32）；缺省=原尺寸或自动 16
 * @param {boolean} importCollision 是否导入碰撞（图块属性 collision/solid → 2；墙层兜底）；默认 true
 * @param {string[]|null} collisionLayerNames v8.7 选中图层名列表（非空格子 → 2，与图块属性并集）；null=不使用
 * @returns {{tileAssets:Array<{id,data}>, tilemap:{data,tileset,index}, collision:Uint8Array,
 *            collisionStats:{props,layers}, w,h,tilewidth, scaledFrom, tileCount, usedTileCount, flipTileCount, diag}}
 */
function tmxpConvert(tmx, pxOrPxMap, mainLayerIdxs, wallLayerIdxs, targetTW, importCollision, collisionLayerNames) {
    if (tmx.tilewidth !== tmx.tileheight)
        throw new Error("tilewidth 必须等于 tileheight（Arcade 只支持正方形 tile），当前 " + tmx.tilewidth + "x" + tmx.tileheight);
    const tileW = tmx.tilewidth;

    // ---- 多图集 pxMap：单像素对象 → 单键 Map ----
    let pxMap;
    if (pxOrPxMap instanceof Map) {
        pxMap = pxOrPxMap;
    } else {
        const px = pxOrPxMap;
        if (!px || !px.w || !px.h) throw new Error("缺少 tileset 图片（PNG）");
        pxMap = new Map([["tileset", px]]);
    }

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
    // 多 tileset 尺寸必须统一（Arcade 单地图单一 tile 尺寸）
    for (const ts of tss) {
        if (ts.tilewidth && ts.tilewidth !== tileW)
            throw new Error("多 tileset 尺寸不一致：" + (ts.name || ts.src || "?") + " tilewidth=" + ts.tilewidth + " ≠ 地图 " + tileW + "px（Arcade 地图内 tile 尺寸必须统一）");
    }

    const diag = [];
    // 建立 gid → {ts, r, c, px}
    const gidLookup = new Map();
    tss.forEach(ts => {
        // 匹配 PNG：imgSrc basename → ts.name → src basename → 唯一
        let px = null;
        if (pxMap.size === 1) {
            px = pxMap.values().next().value;
        } else {
            const cands = [tmxpBaseName(ts.imgSrc), ts.name, tmxpBaseName(ts.src)];
            for (const c of cands) { if (c && pxMap.has(c)) { px = pxMap.get(c); break; } }
            if (!px && cands.length) {
                const joined = cands.filter(Boolean).join("/");
                if (pxMap.has(joined)) px = pxMap.get(joined);
            }
        }
        if (!px) {
            diag.push("tileset '" + (ts.name || ts.src || "?") + "' 未匹配到 PNG（需选择 " +
                (ts.imgSrc || ts.src || "对应图片") + "）");
            return;
        }
        // 图片尺寸：tsx 声明优先，否则用 PNG 实际尺寸
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

    // 合并主图层：gid 剥离翻转标志（v8.6），翻转组合单独记录
    const mapW = tmx.w, mapH = tmx.h;
    const merged = new Uint16Array(mapW * mapH);   // 剥离翻转后的 gid（Uint16：gid>255 不截断）
    const flips = new Uint8Array(mapW * mapH);     // bit0=H bit1=V bit2=D
    const mainIdxs = (mainLayerIdxs && mainLayerIdxs.length) ? mainLayerIdxs : tmx.layers.map((_, i) => i);
    mainIdxs.forEach(idx => {
        const l = tmx.layers[idx];
        if (!l) return;
        for (let i = 0; i < mapW * mapH; i++) {
            const raw = l.gids[i];
            if (raw !== 0) {
                const pg = tmxpParseGid(raw);
                merged[i] = pg.gid;
                flips[i] = pg.flip;
            }
        }
    });

    // 组合（gid, flip）紧凑重映射 → 1..N（255 上限按组合数计：每种翻转组合是一个独立索引）。
    // 顺序：gid 升序，每个 gid 的 flip 升序（0 → H → V → D → 组合），保证索引确定性与原版优先。
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

    // 生成 tile 资产：全量原版（图集所有瓦片）+ 用到的翻转组合烘焙（追加）
    const getPix = (tt, x, y) => {
        const sx = tt.ts.margin + tt.c * (tt.tw + tt.ts.spacing) + x;
        const sy = tt.ts.margin + tt.r * (tt.th + tt.ts.spacing) + y;
        const ix = Math.min(tt.px.w - 1, Math.floor(sx));
        const iy = Math.min(tt.px.h - 1, Math.floor(sy));
        const idx = (iy * tt.px.w + ix) * 4;
        return tmxpNearestColor(tt.px.data[idx], tt.px.data[idx + 1], tt.px.data[idx + 2], tt.px.data[idx + 3]);
    };
    // 面积平均（box filter）：目标像素 = 源区域调色板颜色平均，再最近色量化。
    // 修复最近邻采样在非整数倍缩放（如 40→16，步长 2.5）时跳过细线（砖缝）导致"垂直拉长"失真
    const boxAvg = (tt, tileW0, x0, x1, y0, y1) => {
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const ci = getPix(tt, Math.min(x, tileW0 - 1), Math.min(y, tileW0 - 1));
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
                const ci = getPix(tt, x, y);
                if (!ci) continue;
                sr += TMXP_PALETTE[ci][0]; sg += TMXP_PALETTE[ci][1]; sb += TMXP_PALETTE[ci][2]; n++;
            }
            if (n) bgColorIdx = tmxpNearestColor(sr / n, sg / n, sb / n, 255);
        }
    }

    // 单瓦片缩放像素矩阵（供原版与翻转烘焙共用）
    const scaleTilePix = (tt) => {
        const scale = tileW / outTW;
        const pix = new Uint8Array(outTW * outTW);
        for (let y = 0; y < outTW; y++) for (let x = 0; x < outTW; x++) {
            const x0 = Math.min(Math.floor(x * scale), tileW - 1);
            const y0 = Math.min(Math.floor(y * scale), tileW - 1);
            const x1 = Math.min(Math.max(x0 + 1, Math.floor((x + 1) * scale)), tileW);
            const y1 = Math.min(Math.max(y0 + 1, Math.floor((y + 1) * scale)), tileW);
            let ci = boxAvg(tt, tileW, x0, x1, y0, y1);
            // v8.5：地图用到的瓦片，透明像素填背景色（模拟 Tiled 背景层叠加，消除空洞）
            if (ci === 0 && bgColorIdx && usedSet.has(tt.gid)) ci = bgColorIdx;
            pix[y * outTW + x] = ci;
        }
        return pix;
    };

    const tileAssets = [];
    const gidToAssetId = new Map();     // 原版 gid → 资产 id
    const flipToAssetId = new Map();    // key(g*8+flip) → 烘焙资产 id（flip>0）
    let ti = 0;
    // 1) 全量原版资产
    for (const [g, tt] of gidLookup) {
        const pix = scaleTilePix(tt);
        const bytes = tmxpF4EncodeImg(outTW, outTW, (x, y) => pix[y * outTW + x]);
        const id = "tile" + ti++;
        tileAssets.push({ id, data: tmxpBytesToBase64(new Uint8Array(bytes)) });
        gidToAssetId.set(g, id);
    }
    // 2) 用到的翻转组合烘焙（v8.6：Tiled 翻转 → Arcade 静态烘焙瓦片）
    let flipCount = 0;
    for (const combo of usedCombos) {
        if (!combo.flip) continue;
        const tt = gidLookup.get(combo.g);
        if (!tt) continue;
        const pix = scaleTilePix(tt);
        const bytes = tmxpF4EncodeImg(outTW, outTW, (x, y) => {
            const [sx, sy] = tmxpFlipSrc(combo.flip, outTW, x, y);
            return pix[sy * outTW + sx];
        });
        const id = "tile" + ti++;
        tileAssets.push({ id, data: tmxpBytesToBase64(new Uint8Array(bytes)) });
        flipToAssetId.set(combo.key, id);
        flipCount++;
    }
    if (!tileAssets.length) throw new Error("图集中没有可导入的瓦片");
    // tilemap.tileset：**按数据区重映射顺序引用**（索引 1..N ↔ tiles 数组下标 1..N）
    const tilesetRefs = usedCombos.map(c => (c.flip ? flipToAssetId.get(c.key) : gidToAssetId.get(c.g))).filter(Boolean);

    // tilemap 索引（每格 1 字节，组合索引 1..N）
    const index = new Uint16Array(mapW * mapH);
    for (let y = 0; y < mapH; y++)
        for (let x = 0; x < mapW; x++) {
            const i = y * mapW + x;
            index[i] = merged[i] ? (comboMap.get(merged[i] * 8 + flips[i]) || 0) : 0;
        }

    // 碰撞（v8.6/v8.7）：来源①图块属性 collision/solid → 2；②旧墙层索引（兼容）；
    // ③选中图层名（非空格子 → 2，翻转标志已剥离）；来源间取并集
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
        const wallIdxs = wallLayerIdxs || [];
        for (let i = 0; i < mapW * mapH; i++) {
            if (collision[i]) continue;
            for (const wi of wallIdxs) {
                const g = tmx.layers[wi] && tmx.layers[wi].gids[i];
                if (g !== 0) { collision[i] = 2; break; }
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
                if (tmxpParseGid(raw).gid === 0) continue;
                if (!collision[i]) { collision[i] = 2; collisionStats.layers++; }
            }
        }
    }

    // tilemap data（旧格式兼容：5 字节头 + w*h 索引 + w*h 碰撞）
    const data = new Uint8Array(5 + mapW * mapH * 2);
    data[0] = outTW;
    data[1] = mapW & 0xff; data[2] = (mapW >> 8) & 0xff;
    data[3] = mapH & 0xff; data[4] = (mapH >> 8) & 0xff;
    let ptr = 5;
    for (let y = 0; y < mapH; y++)
        for (let x = 0; x < mapW; x++)
            data[ptr++] = index[y * mapW + x] || 0;
    for (let i = 0; i < mapW * mapH; i++) data[ptr++] = collision[i];
    const dataBytes = data.slice(0, ptr);
    const tilemapData = btoa(tmxpUint8ArrayToHex(dataBytes));

    return {
        tileAssets,
        tilemap: { data: tilemapData, tileset: tilesetRefs, index },
        collision,
        collisionStats,
        w: mapW, h: mapH, tilewidth: outTW,
        scaledFrom: scaled ? tileW : null,
        tileCount: tileAssets.length,
        usedTileCount: usedCombos.length,
        flipTileCount: flipCount,
        diag
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
        tmxpBytesToBase64, tmxpUint8ArrayToHex,
        tmxpParseGid, tmxpFlipSrc, tmxpParseTileProps, tmxpParseTsxInfo, tmxpBaseName
    };
}
