/* test-inject-assets.js —— v6：官方 TilemapProject API 模拟 + 崩溃路径验证
 * 验证：createNewTile / blankTilemap / createNewTilemapFromData 全链路
 * 关键断言：bitmap=BitmapData 对象（有 width）、tilemap 是 Tilemap 实例、
 *          tiles=[透明,...全量]、渲染消费（tiles[get(x,y)].id）不崩溃
 */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const fs = require('fs');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
global.DOMParser = win.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.window = win; global.document = win.document;
win.URL.createObjectURL = () => 'blob:fake';

/* ===== 官方 Bitmap/Tilemap/TilemapData 最小实现（与 pxtlib/spriteutils.ts 一致） ===== */
class Bitmap {
    constructor(width, height, x0 = 0, y0 = 0, buf) {
        this.width = width || 16; this.height = height || 16;
        this.x0 = x0; this.y0 = y0;
        this.buf = buf || new Uint8ClampedArray(this.dataLength());
    }
    static fromData(d) { return new Bitmap(d.width, d.height, d.x0, d.y0, d.data); }
    get(c, r) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) {
            const i = c + r * this.width;
            const cell = Math.floor(i / 2);
            return i % 2 === 0 ? (this.buf[cell] & 0xf) : (this.buf[cell] & 0xf0) >> 4;
        }
        return 0;
    }
    set(c, r, v) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) {
            const i = c + r * this.width;
            const cell = Math.floor(i / 2);
            if (i % 2 === 0) this.buf[cell] = (this.buf[cell] & 0xf0) | (v & 0xf);
            else this.buf[cell] = (this.buf[cell] & 0x0f) | ((v & 0xf) << 4);
        }
    }
    data() { return { width: this.width, height: this.height, x0: this.x0, y0: this.y0, data: this.buf }; }
    dataLength() { return Math.ceil(this.width * this.height / 2); }
}
class Tilemap extends Bitmap {
    get(c, r) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) return this.buf[c + r * this.width];
        return 0;
    }
    set(c, r, v) {
        if (c < this.width && r < this.height && c >= 0 && r >= 0) this.buf[c + r * this.width] = v & 0xff;
    }
    dataLength() { return this.width * this.height; }
}
class TilemapData {
    constructor(tilemap, tileset, layers) { this.tilemap = tilemap; this.tileset = tileset; this.layers = layers; }
}
win.pxt = { sprite: { Bitmap, Tilemap, TilemapData, TILE_NAMESPACE: "myTiles" } };

/* ===== FakeTilemapProject（模拟官方 TilemapProject 关键方法） ===== */
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
        const tile = {
            internalID: this.getNewInternalId(),
            id: id || ("myTiles.tile" + this.calls.createNewTile),
            type: "tile",
            jresData: "f4base64-ignored",
            bitmap: { ...data, data: new Uint8ClampedArray(data.data) },
            meta: { displayName: displayName || id },
            isProjectTile: true
        };
        return this.collections.tile.add(tile);
    }
    blankTilemap(tileWidth, w, h) {
        this.calls.blankTilemap++;
        const tilemap = new Tilemap(w, h);
        const layers = new Bitmap(w, h);
        const tileset = { tileWidth, tiles: [this.getTransparency(tileWidth)] };
        return new TilemapData(tilemap, tileset, layers.data());
    }
    createNewTilemapFromData(data, name) {
        this.calls.createNewTilemapFromData++;
        this.onChange();
        const id = name || "level";
        this.collections.tilemap.add({
            internalID: this.getNewInternalId(), id,
            type: "tilemap", meta: { displayName: name || id }, data: data
        });
        return [id, data];
    }
}

/* ===== 加载注入模块 ===== */
win.eval(fs.readFileSync('tmx-import-inject.js', 'utf8'));

async function main() {
    const ti = win.__tmxImport;
    // 20x20=400 瓦片图集（40px，800x800）
    const bigPx = { w: 800, h: 800, data: new Uint8ClampedArray(800 * 800 * 4) };
    for (let t = 0; t < 400; t++) {
        const r = Math.floor(t / 20), c = t % 20;
        for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
            const i = ((r * 40 + y) * 800 + (c * 40 + x)) * 4;
            bigPx.data[i] = (t * 7) % 255; bigPx.data[i + 1] = (t * 13) % 255; bigPx.data[i + 2] = (t * 29) % 255; bigPx.data[i + 3] = 255;
        }
    }
    const tsxBig = `<tileset name="big" tilewidth="40" tileheight="40" tilecount="400" columns="20"><image source="big.png" width="800" height="800"/></tileset>`;
    // 220x16 地图，只用 gid 1..81（验证数据区 1..81 与 tiles 数组对齐）
    let csv = [];
    for (let i = 0; i < 220 * 16; i++) csv.push((i % 81) + 1);
    const tmxBig = `<map version="1.10" orientation="orthogonal" width="220" height="16" tilewidth="40" tileheight="40" infinite="0">
<tileset firstgid="1" source="big.tsx"/><layer name="g" width="220" height="16"><data encoding="csv">${csv.join(",")}</data></layer></map>`;

    const tmx = await ti.parseTmx(tmxBig, tsxBig);
    const result = ti.convert(tmx, bigPx, 16); // 40px → 16px（Arcade 支持尺寸）
    console.log('convert: tileAssets =', result.tileCount, '| used =', result.usedTileCount, '| w =', result.w, '| h =', result.h, '| tilewidth =', result.tilewidth, '| scaledFrom =', result.scaledFrom);

    const proj = new FakeTilemapProject();
    const written = ti.writeAssets(proj, result);
    console.log('writeAssets: tileCount =', written.tileCount, '| mapId =', written.mapId);
    console.log('API 调用: createNewTile =', proj.calls.createNewTile, '| blankTilemap =', proj.calls.blankTilemap, '| createNewTilemapFromData =', proj.calls.createNewTilemapFromData, '| onChange =', proj.calls.onChange);

    // 断言 1: 全量 400 瓦片（含透明 = 401）
    const tiles = proj.collections.tile.list;
    if (tiles.length !== 401) throw new Error('应 400+1 透明 = 401，实际 ' + tiles.length);
    // 断言 2: bitmap 是 BitmapData 对象（有 width/height/data），不是 Uint8Array
    const t0 = tiles.find(t => t.id === 'myTiles.tile0');
    if (!t0 || typeof t0.bitmap !== 'object' || t0.bitmap.width !== 16 || t0.bitmap.height !== 16 || !(t0.bitmap.data instanceof Uint8ClampedArray))
        throw new Error('tile0.bitmap 应为 BitmapData 对象 {width:16,height:16,data:Uint8ClampedArray}（40px 已缩放为 16px），实际 ' + JSON.stringify({ w: t0 && t0.bitmap.width, h: t0 && t0.bitmap.height, ctor: t0 && t0.bitmap.data && t0.bitmap.data.constructor.name }));
    // 断言 3: 地图资产存在且结构 = 官方（data.tilemap 是 Tilemap 实例、tiles=[透明+紧凑对齐用到的]）
    const map = proj.collections.tilemap.list[0];
    if (!map) throw new Error('没有地图资产');
    if (!(map.data.tilemap instanceof Tilemap)) throw new Error('map.data.tilemap 应为 Tilemap 实例');
    // v8.2: tileset.tiles 按紧凑索引对齐 = 1 透明 + usedTileCount（81）
    const refs = result.tilemap.tileset;
    if (map.data.tileset.tiles.length !== 1 + refs.length) throw new Error('tiles 应 1+用到的(' + refs.length + ')=' + (1 + refs.length) + '，实际 ' + map.data.tileset.tiles.length);
    if (map.data.tileset.tiles[0].id.indexOf('transparency') < 0) throw new Error('tiles[0] 应为透明');
    // 断言 3b（v8.2/v8.3 核心）: 格子索引与 tileset 引用对齐——格子索引 i → tiles[i] 对应 refs[i-1]
    // 用 meta.displayName（我们传入的 ta.id，不受官方 createNewTile 改名影响）比对
    const nameByIndex = new Map();
    map.data.tileset.tiles.forEach((t, i) => { if (i > 0) nameByIndex.set(i, (t.meta && t.meta.displayName) || t.id); });
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 220; x++) {
            const idx = map.data.tilemap.get(x, y);
            if (idx > 0) {
                const actual = nameByIndex.get(idx);
                const expect = refs[idx - 1];
                if (actual !== expect && (actual || '').split('.').pop() !== expect)
                    throw new Error('对齐错误: 格子(' + x + ',' + y + ') 索引 ' + idx + ' → ' + actual + '，期望 ' + expect);
            }
        }
    console.log('✓ tileset 与格子索引紧凑对齐（' + refs.length + ' 个用到的瓦片）');
    // 断言 4: 格子写入正确（索引应 1..81）
    const g0 = map.data.tilemap.get(0, 0), g1 = map.data.tilemap.get(1, 0), gl = map.data.tilemap.get(219, 15);
    if (!(g0 >= 1 && g0 <= 81)) throw new Error('tilemap.get(0,0) = ' + g0 + ' 应 1..81');
    // 断言 5: 渲染消费路径不崩溃（等价于编辑器 b.render 崩溃路径）
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 220; x++) {
            const idx = map.data.tilemap.get(x, y);
            const tile = map.data.tileset.tiles[idx];
            if (!tile) throw new Error('渲染崩溃点: tiles[' + idx + '] undefined at (' + x + ',' + y + ')');
            if (!tile.bitmap || tile.bitmap.width !== 16) throw new Error('tile 缺少 bitmap.width(16): ' + tile.id);
        }
    // 断言 6: 官方 getProjectTiles 过滤 bitmap.width === 16 → 透明 + 400 = 401（My Tiles 数据源）
    const projTiles = proj.collections.tile.list.filter(t => t.bitmap.width === 16);
    if (projTiles.length !== 401) throw new Error('getProjectTiles 应 401（透明+400），实际 ' + projTiles.length);
    // 断言 7: onChange 已触发（UI 刷新）
    if (proj.calls.onChange < 2) throw new Error('onChange 应 ≥2（瓦片+地图），实际 ' + proj.calls.onChange);

    console.log('✓ 瓦片 bitmap=BitmapData 对象（width=' + t0.bitmap.width + '）');
    console.log('✓ 地图 data.tilemap=Tilemap 实例，格子 (0,0)=' + g0 + ' (1,0)=' + g1 + ' (219,15)=' + gl);
    console.log('✓ 渲染消费全遍历无崩溃（220x16 全部格子的 tiles[idx] 有效）');
    console.log('✓ getProjectTiles(16px) = 401 个（透明+400，My Tiles 数据源）');
    console.log('✓ onChange 已触发 = ' + proj.calls.onChange + ' 次（UI 会刷新）');

    // === v8.3: 官方改名模拟场景 ===
    // 用户环境实测：createNewTile 传入 myTiles.tileN，若 id 冲突官方自动改名（generateNewID → 奇数命名）
    // 验证：即使资产实际 id 被改成奇数，writeAssets 按"创建顺序"对齐仍保证地图引用正确
    console.log('\n=== v8.3 改名模拟：createNewTile 自动改名（返回奇数 id）===');
    class RenamingProject extends FakeTilemapProject {
        createNewTile(data, id, displayName) {
            this.calls.createNewTile++;
            this.onChange();
            // 模拟官方 generateNewID：忽略传入 id，返回 myTiles.tile(2k+1)（奇数命名，同用户实测 tile585 机制）
            const k = this.calls.createNewTile;
            const renamed = "myTiles.tile" + (2 * k + 1);
            const tile = { internalID: this.getNewInternalId(), id: renamed, type: "tile", jresData: "f4", bitmap: { ...data, data: new Uint8ClampedArray(data.data) }, meta: { displayName: displayName || renamed }, isProjectTile: true };
            return this.collections.tile.add(tile);
        }
    }
    const projR = new RenamingProject();
    const writtenR = ti.writeAssets(projR, result);
    const mapR = projR.collections.tilemap.list[0];
    const nameR = new Map();
    mapR.data.tileset.tiles.forEach((t, i) => { if (i > 0) nameR.set(i, (t.meta && t.meta.displayName) || t.id); });
    let mismatch = 0;
    for (let y = 0; y < 16; y++)
        for (let x = 0; x < 220; x++) {
            const idx = mapR.data.tilemap.get(x, y);
            if (idx > 0) {
                const actual = nameR.get(idx);
                const expect = refs[idx - 1];
                if (actual !== expect && (actual || '').split('.').pop() !== expect) mismatch++;
            }
        }
    if (mismatch) throw new Error('改名模拟下仍有 ' + mismatch + ' 处格子引用错位');
    console.log('✓ 改名模拟：资产 id 全为奇数（如 tile1,tile3,...），地图 220x16 全部格子引用仍正确（displayName 对齐）');
    console.log('✓ 验证 createNewTile 改名不影响地图正确性（v8.3 顺序对齐）');
    console.log('=== v6/v8.2/v8.3 资产写入测试全部通过 ✓ ===');
    process.exit(0);
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
