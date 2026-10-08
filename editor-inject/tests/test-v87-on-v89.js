/* test-v87-inject.js —— v8.7 碰撞图层多选（inject 端到端）：
 * 真实 1-1.tmx：图层名方案选 wall+land → 碰撞格数>0；writeAssets 后
 * layers.data 落位验证；只选 wall / 不选 / 图块属性 对比。 */
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

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗', name, '::', detail || ''); }
}
// 读取 layers.data 碰撞值（与官方 Bitmap.fromData 一致：行优先 4bpp）
function readLayer(ld, x, y) {
    const i = x + y * ld.width; const cell = Math.floor(i / 2);
    return i % 2 === 0 ? (ld.data[cell] & 0xf) : (ld.data[cell] >> 4);
}
function countCollision(result) { return Array.from(result.collision).filter(v => v !== 0).length; }

(async () => {
    win.eval(fs.readFileSync('merged-v89.js', 'utf8'));
    const ti = win.__tmxImport;
    const px = decodePng('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.png');
    const tmxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/1-1.tmx', 'utf8');
    const tsxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.tsx', 'utf8');
    const tmx = await ti.parseTmx(tmxXml, tsxXml);

    console.log('== A. 图层解析（1-1 真实素材） ==');
    check('图层名顺序（XML 渲染序，从下到上）: background/writeflag/scene/land/wall/endflag',
        tmx.layers.map(l => l.name).join(',') === 'background,writeflag,scene,land,wall,endflag',
        tmx.layers.map(l => l.name).join(','));
    check('面板序（从上到下）反转: endflag/wall/land/scene/writeflag/background',
        tmx.layers.slice().reverse().map(l => l.name).join(',') === 'endflag,wall,land,scene,writeflag,background');
    check('6 层全部有数据', tmx.layers.length === 6 && tmx.layers.every(l => l.gids && l.gids.length === 220 * 16));

    console.log('== B. 图层名碰撞（选 wall+land） ==');
    const r1 = ti.convert(tmx, px, 16, true, ['wall', 'land']);
    const c1 = countCollision(r1);
    console.log('  collision: 共', c1, '格 | stats:', JSON.stringify(r1.collisionStats));
    check('碰撞格数 > 0（地砖/水管/问号砖）', c1 > 500, 'n=' + c1);
    check('collisionStats.layers 计入全部', r1.collisionStats.layers === c1, 'layers=' + r1.collisionStats.layers);
    check('props = 0（该 tsx 无图块属性）', r1.collisionStats.props === 0);
    // 底部 y=15 是 land 红砖层：x=0..219 大多应碰撞
    let bottomWall = 0;
    for (let x = 0; x < 220; x++) if (r1.collision[15 * 220 + x]) bottomWall++;
    check('底部 y=15 大量碰撞（红砖地）', bottomWall > 100, 'n=' + bottomWall);
    // 第 0 行是背景天蓝：不应碰撞
    let topWall = 0;
    for (let x = 0; x < 220; x++) if (r1.collision[x]) topWall++;
    check('顶部 y=0 无碰撞（背景层未选）', topWall === 0, 'n=' + topWall);

    console.log('== C. writeAssets 落位（layers.data 与 result.collision 一致） ==');
    const proj = new FakeTilemapProject();
    const written = ti.writeAssets(proj, r1);
    const map = proj.collections.tilemap.list[0];
    const lay = map.data.layers;
    check('layers.data 尺寸正确', lay.width === 220 && lay.height === 16 && lay.data.length === 220 * 16 / 2);
    let mismatch = 0, wallCells = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 220; x++) {
        const v = readLayer(lay, x, y);
        const expect = r1.collision[y * 220 + x];
        if (v !== expect) mismatch++;
        if (v === 2) wallCells++;
    }
    check('落位零偏差（layers.data === collision）', mismatch === 0, 'mismatch=' + mismatch);
    check('layers 中墙格数 = collision 统计', wallCells === c1, 'wallCells=' + wallCells);
    check('示例：底部 (0,15)=2', readLayer(lay, 0, 15) === 2);
    check('示例：顶部 (0,0)=0', readLayer(lay, 0, 0) === 0);

    console.log('== D. 只选 wall ==');
    const r2 = ti.convert(tmx, px, 16, true, ['wall']);
    const c2 = countCollision(r2);
    console.log('  wall 层碰撞:', c2, '格 | stats:', JSON.stringify(r2.collisionStats));
    check('wall 层碰撞格数 < wall+land', c2 > 0 && c2 < c1, 'c2=' + c2 + ' c1=' + c1);

    console.log('== E. 不选图层 / 取消碰撞 ==');
    const r3 = ti.convert(tmx, px, 16, true, []);
    check('空数组 → 碰撞 0 格', countCollision(r3) === 0);
    const r4 = ti.convert(tmx, px, 16, true, null);
    check('null → 碰撞 0 格（同 v8.6 行为，该素材无图块属性）', countCollision(r4) === 0);

    console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
