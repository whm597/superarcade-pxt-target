/* test-repro-cloud-hill.js —— 定位云朵/山丘错配：convert+writeAssets 后格子引用对照 */
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
if (typeof DecompressionStream !== 'undefined') win.DecompressionStream = DecompressionStream;
if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') win.Blob = Blob;
if (typeof Response !== 'undefined') win.Response = Response;

class Bitmap {
    constructor(width, height, x0 = 0, y0 = 0, buf) { this.width = width || 16; this.height = height || 16; this.x0 = x0; this.y0 = y0; this.buf = buf || new Uint8ClampedArray(this.dataLength()); }
    get(c, r) { if (c < this.width && r < this.height && c >= 0 && r >= 0) { const i = c + r * this.width; const cell = Math.floor(i / 2); return i % 2 === 0 ? (this.buf[cell] & 0xf) : (this.buf[cell] & 0xf0) >> 4; } return 0; }
    set(c, r, v) { if (c < this.width && r < this.height && c >= 0 && r >= 0) { const i = c + r * this.width; const cell = Math.floor(i / 2); if (i % 2 === 0) this.buf[cell] = (this.buf[cell] & 0xf0) | (v & 0xf); else this.buf[cell] = (this.buf[cell] & 0x0f) | ((v & 0xf) << 4); } }
    data() { return { width: this.width, height: this.height, x0: this.x0, y0: this.y0, data: this.buf }; }
    dataLength() { return Math.ceil(this.width * this.height / 2); }
}
class Tilemap extends Bitmap {
    get(c, r) { if (c < this.width && r < this.height && c >= 0 && r >= 0) return this.buf[c + r * this.width]; return 0; }
    set(c, r, v) { if (c < this.width && r < this.height && c >= 0 && r >= 0) this.buf[c + r * this.width] = v & 0xff; }
    dataLength() { return this.width * this.height; }
}
class TilemapData { constructor(tilemap, tileset, layers) { this.tilemap = tilemap; this.tileset = tileset; this.layers = layers; } }
win.pxt = { sprite: { Bitmap, Tilemap, TilemapData, TILE_NAMESPACE: "myTiles" } };

let nextInternal = 1000;
class FakeTilemapProject {
    constructor() { this.calls = { createNewTile: 0, blankTilemap: 0, createNewTilemapFromData: 0, onChange: 0 }; this.collections = { tile: { list: [], getSnapshot() { return this.list.slice(); }, add(a) { this.list.push(a); return a; } }, tilemap: { list: [], getSnapshot() { return this.list.slice(); }, add(a) { this.list.push(a); return a; } } }; }
    getNewInternalId() { return nextInternal++; }
    getAssetCollection(t) { return this.collections[t]; }
    onChange() { this.calls.onChange++; }
    getTransparency(tileWidth) { const id = "myTiles.transparency" + tileWidth; const f = this.collections.tile.list.find(t => t.id === id); if (f) return f; const bmp = new Bitmap(tileWidth, tileWidth).data(); const tile = { internalID: this.getNewInternalId(), id, type: "tile", bitmap: bmp, jresData: "", meta: {}, isProjectTile: true }; return this.collections.tile.add(tile); }
    createNewTile(data, id, displayName) { this.calls.createNewTile++; this.onChange(); const k = this.calls.createNewTile; const renamed = "myTiles.tile" + (2 * k + 1); const tile = { internalID: this.getNewInternalId(), id: renamed, type: "tile", jresData: "f4", bitmap: { ...data, data: new Uint8ClampedArray(data.data) }, meta: { displayName: displayName || renamed }, isProjectTile: true }; return this.collections.tile.add(tile); }
    blankTilemap(tileWidth, w, h) { this.calls.blankTilemap++; return new TilemapData(new Tilemap(w, h), { tileWidth, tiles: [this.getTransparency(tileWidth)] }, new Bitmap(w, h).data()); }
    createNewTilemapFromData(data, name) { this.calls.createNewTilemapFromData++; this.onChange(); const id = name || "level"; this.collections.tilemap.add({ internalID: this.getNewInternalId(), id, type: "tilemap", meta: { displayName: name || id }, data }); return [id, data]; }
}

function decodePng(path) {
    const buf = fs.readFileSync(path);
    let pos = 8; const chunks = [];
    while (pos < buf.length) { const len = buf.readUInt32BE(pos); chunks.push({ type: buf.toString('ascii', pos + 4, pos + 8), data: buf.slice(pos + 8, pos + 8 + len) }); pos += 12 + len; }
    const ihdr = chunks.find(c => c.type === 'IHDR').data;
    const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), colorType = ihdr[9];
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
    // 山丘/云朵 gid 位置
    const posOf = (g) => { const pos = []; for (let y = 0; y < tmx.h; y++) for (let x = 0; x < tmx.w; x++) { for (const l of tmx.layers) if (l.gids && l.gids[y*tmx.w+x] === g) { pos.push(x + ',' + y); break; } } return pos; };
    console.log('山丘 gid 281-289 位置:', posOf(281).slice(0,5), posOf(282).slice(0,5), posOf(283).slice(0,5));
    console.log('山丘 gid 301-309 位置:', posOf(301).slice(0,3), posOf(305).slice(0,3), posOf(309).slice(0,3));
    console.log('云朵 gid 361/362/363 位置:', posOf(361).slice(0,4), posOf(362).slice(0,4), posOf(363).slice(0,4));
    console.log('land 115/116/135/136 位置:', posOf(115).slice(0,4), posOf(135).slice(0,4));

    const result = ti.convert(tmx, px, 16);
    const proj = new FakeTilemapProject();
    const written = ti.writeAssets(proj, result);
    const map = proj.collections.tilemap.list[0];
    const ts = map.data.tileset.tiles;
    const tm = map.data.tilemap;
    const nameAt = (x, y) => { const idx = tm.get(x, y); return idx > 0 ? ((ts[idx].meta && ts[idx].meta.displayName) || ts[idx].id) : '(空)'; };
    // 期望：gid G 的瓦片资产 id = 'tile' + (G-1)（convert tileAssets 顺序）
    const expectId = (G) => 'tile' + (G - 1);

    console.log('\n=== 云朵对照 (85,1) gid361 → 期望 ' + expectId(361) + ' ===');
    console.log('格子(85,1) =', nameAt(85, 1), '| (86,1) =', nameAt(86, 1), '| (87,1) =', nameAt(87, 1));
    console.log('格子(85,2) =', nameAt(85, 2), '| (86,2) =', nameAt(86, 2), '| (87,2) =', nameAt(87, 2));
    console.log('期望: (85,1)=' + expectId(361) + ' (86,1)=' + expectId(362) + ' (87,1)=' + expectId(363) + ' (85,2)=' + expectId(381) + ' (86,2)=' + expectId(382) + ' (87,2)=' + expectId(383));

    console.log('\n=== 山丘对照（若位置存在）===');
    for (const [g, label] of [[281,'山丘左上'],[282,'山丘右上'],[283,'山丘下'],[301,'山丘a'],[302,'山丘b'],[305,'山丘c'],[135,'绿色平台'],[136,'绿色平台2'],[115,'绿块'],[116,'绿块2']]) {
        const pos = posOf(g);
        if (pos.length) {
            const [x, y] = pos[0].split(',').map(Number);
            const got = nameAt(x, y);
            console.log('gid ' + g + ' (' + label + ') @' + x + ',' + y + ' → ' + got + (got === expectId(g) ? ' ✓' : ' ✗ 期望 ' + expectId(g)));
        }
    }

    // 全格子统计：引用正确的比例（合并语义：取最后一个非 0 图层的 gid = 覆盖后的值）
    let total = 0, wrong = 0; const wrongList = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 220; x++) {
        const idx = tm.get(x, y);
        if (idx === 0) continue;
        total++;
        let g = 0;
        for (const l of tmx.layers) { const v = l.gids && l.gids[y*tmx.w+x]; if (v) g = v; }  // 最后非 0 = 覆盖后
        const got = ((ts[idx].meta && ts[idx].meta.displayName) || ts[idx].id);
        if (got !== expectId(g)) { wrong++; if (wrongList.length < 12) wrongList.push('(' + x + ',' + y + ')gid' + g + '→' + got + '期望' + expectId(g)); }
    }
    console.log('\n=== 全格子引用统计: 非0格 ' + total + '，错误 ' + wrong + ' ===');
    console.log('错误示例:', wrongList.join(' | '));
    process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
