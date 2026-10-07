/* test-repro-1-1-inject.js —— 真实 1-1.tmx 端到端：writeAssets 后背景/地砖落位验证 */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const zlib = require('zlib');
const fs = require('fs');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
global.DOMParser = win.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.window = win; global.document = win.document;
win.URL.createObjectURL = () => 'blob:fake';
// Node 22 有全局 DecompressionStream/Blob，注入到 window 供 inject 版 decodeTileData 使用
if (typeof DecompressionStream !== 'undefined') win.DecompressionStream = DecompressionStream;
if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') win.Blob = Blob;
if (typeof Response !== 'undefined') win.Response = Response;

/* ===== 官方 Bitmap/Tilemap/TilemapData 最小实现（同 test-inject-assets） ===== */
class Bitmap {
    constructor(width, height, x0 = 0, y0 = 0, buf) {
        this.width = width || 16; this.height = height || 16;
        this.x0 = x0; this.y0 = y0;
        this.buf = buf || new Uint8ClampedArray(this.dataLength());
    }
    get(c, r) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) {
            const i = c + r * this.width; const cell = Math.floor(i / 2);
            return i % 2 === 0 ? (this.buf[cell] & 0xf) : (this.buf[cell] & 0xf0) >> 4;
        }
        return 0;
    }
    set(c, r, v) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) {
            const i = c + r * this.width; const cell = Math.floor(i / 2);
            if (i % 2 === 0) this.buf[cell] = (this.buf[cell] & 0xf0) | (v & 0xf);
            else this.buf[cell] = (this.buf[cell] & 0x0f) | ((v & 0xf) << 4);
        }
    }
    data() { return { width: this.width, height: this.height, x0: this.x0, y0: this.y0, data: this.buf }; }
    dataLength() { return Math.ceil(this.width * this.height / 2); }
}
class Tilemap extends Bitmap {
    get(c, r) { if (c < this.width && r < this.height && c >= 0 && r >= 0) return this.buf[c + r * this.width]; return 0; }
    set(c, r, v) { if (c < this.width && r < this.height && c >= 0 && r >= 0) this.buf[c + r * this.width] = v & 0xff; }
    dataLength() { return this.width * this.height; }
}
class TilemapData {
    constructor(tilemap, tileset, layers) { this.tilemap = tilemap; this.tileset = tileset; this.layers = layers; }
}
win.pxt = { sprite: { Bitmap, Tilemap, TilemapData, TILE_NAMESPACE: "myTiles" } };

let nextInternal = 1000;
class FakeTilemapProject {
    constructor() {
        this.calls = { createNewTile: 0, blankTilemap: 0, createNewTilemapFromData: 0, onChange: 0 };
        this.collections = {
            tile: { list: [], getSnapshot() { return this.list.slice(); }, add(a) { this.list.push(a); return a; } },
            tilemap: { list: [], getSnapshot() { return this.list.slice(); }, add(a) { this.list.push(a); return a; } }
        };
    }
    getNewInternalId() { return nextInternal++; }
    getAssetCollection(t) { return this.collections[t]; }
    onChange() { this.calls.onChange++; }
    getTransparency(tileWidth) {
        const id = "myTiles.transparency" + tileWidth;
        const found = this.collections.tile.list.find(t => t.id === id);
        if (found) return found;
        const bmp = new Bitmap(tileWidth, tileWidth).data();
        const tile = { internalID: this.getNewInternalId(), id, type: "tile", bitmap: bmp, jresData: "", meta: {}, isProjectTile: true };
        return this.collections.tile.add(tile);
    }
    createNewTile(data, id, displayName) {
        this.calls.createNewTile++;
        this.onChange();
        const tile = { internalID: this.getNewInternalId(), id: id || ("myTiles.tile" + this.calls.createNewTile), type: "tile", jresData: "f4", bitmap: { ...data, data: new Uint8ClampedArray(data.data) }, meta: { displayName: displayName || id }, isProjectTile: true };
        return this.collections.tile.add(tile);
    }
    blankTilemap(tileWidth, w, h) {
        this.calls.blankTilemap++;
        return new TilemapData(new Tilemap(w, h), { tileWidth, tiles: [this.getTransparency(tileWidth)] }, new Bitmap(w, h).data());
    }
    createNewTilemapFromData(data, name) {
        this.calls.createNewTilemapFromData++;
        this.onChange();
        const id = name || "level";
        this.collections.tilemap.add({ internalID: this.getNewInternalId(), id, type: "tilemap", meta: { displayName: name || id }, data });
        return [id, data];
    }
}

/* PNG 解码 */
function decodePng(path) {
    const buf = fs.readFileSync(path);
    let pos = 8; const chunks = [];
    while (pos < buf.length) { const len = buf.readUInt32BE(pos); chunks.push({ type: buf.toString('ascii', pos + 4, pos + 8), data: buf.slice(pos + 8, pos + 8 + len) }); pos += 12 + len; }
    const ihdr = chunks.find(c => c.type === 'IHDR').data;
    const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
    const colorType = ihdr[9];
    let palette = null;
    const plt = chunks.find(c => c.type === 'PLTE');
    if (plt) { palette = []; for (let i = 0; i < plt.data.length; i += 3) palette.push([plt.data[i], plt.data[i+1], plt.data[i+2]]); }
    const idat = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
    const raw = zlib.inflateSync(idat);
    const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
    const stride = w * bpp;
    const pixels = Buffer.alloc(w * h * 4);
    let off = 0; let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
        const f = raw[off++];
        const line = raw.slice(off, off + stride); off += stride;
        const recon = Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? recon[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
            let val = line[x];
            if (f === 1) val += a; else if (f === 2) val += b;
            else if (f === 3) val += Math.floor((a + b) / 2);
            else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); val += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
            recon[x] = val & 0xff;
        }
        for (let x = 0; x < w; x++) {
            const s = x * bpp, i = (y * w + x) * 4;
            if (colorType === 6) { pixels[i] = recon[s]; pixels[i+1] = recon[s+1]; pixels[i+2] = recon[s+2]; pixels[i+3] = recon[s+3]; }
            else if (colorType === 2) { pixels[i] = recon[s]; pixels[i+1] = recon[s+1]; pixels[i+2] = recon[s+2]; pixels[i+3] = 255; }
            else if (colorType === 3) { const p = palette[recon[s]]; pixels[i] = p[0]; pixels[i+1] = p[1]; pixels[i+2] = p[2]; pixels[i+3] = 255; }
        }
        prev = recon;
    }
    return { w, h, data: new Uint8ClampedArray(pixels) };
}

(async () => {
    win.eval(fs.readFileSync('tmx-import-inject.js', 'utf8'));
    const ti = win.__tmxImport;
    const px = decodePng('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.png');
    const tmxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/1-1.tmx', 'utf8');
    const tsxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.tsx', 'utf8');
    const tmx = await ti.parseTmx(tmxXml, tsxXml);
    const result = ti.convert(tmx, px, 16);
    console.log('convert:', result.tileCount, 'tiles, used', result.usedTileCount, '| tilewidth', result.tilewidth, '| scaledFrom', result.scaledFrom);

    const proj = new FakeTilemapProject();
    const written = ti.writeAssets(proj, result);
    const map = proj.collections.tilemap.list[0];
    const ts = map.data.tileset.tiles;
    const tm = map.data.tilemap;

    // 1) 背景：第 0 行所有格子都是 gid85 → 紧凑索引 idx85 → ts[idx85] 应为 tile84（天蓝）
    const idx85 = tm.get(0, 0);
    const bgTile = ts[idx85];
    console.log('\n背景格子索引:', idx85, '| tileset[' + idx85 + '].id =', bgTile.id);
    // 检查 bgTile bitmap 内容：应为天蓝（颜色索引 9）非透明
    const bmp = bgTile.bitmap;
    let nonZero = 0, colors = new Set();
    for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) {
        const v = bmp.data ? (() => { const i = x + y * bmp.width; const cell = Math.floor(i / 2); return i % 2 === 0 ? (bmp.data[cell] & 0xf) : (bmp.data[cell] >> 4); })() : 0;
        if (v !== 0) { nonZero++; colors.add(v); }
    }
    console.log('背景瓦片像素: 非透明', nonZero, '/', bmp.width * bmp.height, '| 颜色索引:', [...colors].join(','));

    // 2) 底部红色地砖：land 图层 gid81 等 → 查最后一行非 0 格子的瓦片
    const bottom = [];
    for (let x = 0; x < 220; x++) { const idx = tm.get(x, 15); if (idx > 0 && !bottom.includes(idx)) bottom.push(idx); }
    console.log('\n底部行(y=15) 瓦片索引种类:', bottom.slice(0, 10).join(','), '...共', bottom.length);
    bottom.slice(0, 4).forEach(idx => {
        const t = ts[idx];
        let nz = 0, cols = new Set();
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const i = x + y * 16; const cell = Math.floor(i / 2);
            const v = i % 2 === 0 ? (t.bitmap.data[cell] & 0xf) : (t.bitmap.data[cell] >> 4);
            if (v !== 0) { nz++; cols.add(v); }
        }
        console.log('  底部瓦片 [' + idx + '] id=' + t.id + ' 非透明 ' + nz + '/256 颜色索引: ' + [...cols].join(','));
    });

    // 3) 全量集合仍 401
    console.log('\n集合 tile 数:', proj.collections.tile.list.length, '| tileset.tiles:', ts.length, '| 引用:', written.tileCount, '个全量 +', result.usedTileCount, '个用到的');
    const pass = bgTile && bgTile.id.split('.').pop() === 'tile84' && nonZero > 0;
    console.log(pass ? '✓ 背景瓦片正确落位（tile84 天蓝非透明）' : '✗ 背景瓦片落位错误');
    console.log('=== 真实 1-1 端到端验证完成 ===');
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
