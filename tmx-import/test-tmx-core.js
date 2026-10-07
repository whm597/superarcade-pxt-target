/* Node 测试：tmx-import-core.js 转换链路（jsdom DOMParser + stub PNG 像素） */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

const core = require('/home/user/Doubao/chats/38441484283733762/tmx-import-core.js');

function makePx(w, h, colors) {
    // colors: Map key -> [r,g,b,a]；其余透明
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = colors.get(`${x},${y}`) || [0, 0, 0, 0];
        const i = (y * w + x) * 4;
        data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]; data[i+3] = c[3];
    }
    return { w, h, data };
}

async function main() {
    // === 测试 1: tmx(XML, 外部 tsx) → 转换 ===
    const tmxXml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down"
     width="4" height="3" tilewidth="16" tileheight="16" infinite="0">
 <tileset firstgid="1" source="tiles.tsx"/>
 <layer id="1" name="ground" width="4" height="3">
  <data encoding="csv">
1,1,1,1,
1,1,1,1,
1,1,1,1
  </data>
 </layer>
 <layer id="2" name="walls" width="4" height="3">
  <data encoding="csv">
2,0,0,2,
2,0,0,2,
2,2,2,2
  </data>
 </layer>
</map>`;
    const tsxXml = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="tiles" tilewidth="16" tileheight="16"
         tilecount="8" columns="4">
 <image source="tiles.png" width="64" height="32"/>
</tileset>`;
    // tileset 图 64x32: 8 个 tile（4列x2行）
    const colors = new Map();
    for (let t = 0; t < 8; t++) {
        const r = Math.floor(t / 4), c = t % 4;
        const rgb = [20 + t * 30, 100, 200];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
            colors.set(`${c*16+x},${r*16+y}`, [rgb[0], rgb[1], rgb[2], 255]);
    }
    const px = makePx(64, 32, colors);

    const tmx = await core.tmxpParseTmx(tmxXml, tsxXml);
    console.log('== 解析结果 ==');
    console.log('地图:', tmx.w + 'x' + tmx.h, 'tile', tmx.tilewidth + 'px');
    console.log('图层:', tmx.layers.map(l => l.name + '(' + l.gids.filter(g => g !== 0).length + '非0)').join(', '));
    console.log('tilesets:', JSON.stringify(tmx.tilesets.map(t => ({ firstgid: t.firstgid, tilewidth: t.tilewidth, imgW: t.imgW, imgH: t.imgH }))));
    console.log('诊断:', tmx.diag.join('; ') || '(无)');

    // 主图层 = 全部（ground+walls 合并），墙层 = walls
    const res = core.tmxpConvert(tmx, px, [0, 1], [1]);
    console.log('\n== 转换结果 ==');
    console.log('tile 数:', res.tileCount, '→', res.tileAssets.map(t => t.id).join(','));
    console.log('tileset 引用（用到的，重映射顺序）:', (res.tilemap.tileset || []).join(','));
    // 全量导入断言：图集 8 个瓦片全导入（含未用到的 gid 3..8）
    if (res.tileCount !== 8) throw new Error('全量导入应 8 个 tile，实际 ' + res.tileCount);
    if ((res.tilemap.tileset || []).length !== 2) throw new Error('tileset 引用应 2 个（地图用到的），实际 ' + res.tilemap.tileset.length);
    if (res.tilemap.tileset[0] !== res.tileAssets[0].id) throw new Error('tileset[0] 应对应 gid1（tile0），实际 ' + res.tilemap.tileset[0]);
    console.log('✓ 全量导入 + tileset 引用顺序正确');
    console.log('地图:', res.w + 'x' + res.h);
    const hexStr = atob(res.tilemap.data);
    const dataBytes = Uint8Array.from(hexStr.match(/../g).map(h => parseInt(h, 16)));
    console.log('tilemap.data (hex 前 40):', hexStr.substring(0, 80) + '...');
    // 校验 tilemap data 头
    if (dataBytes[0] !== 16) throw new Error('tileSize 头错误: ' + dataBytes[0]);
    const w = dataBytes[1] | (dataBytes[2] << 8), h = dataBytes[3] | (dataBytes[4] << 8);
    if (w !== 4 || h !== 3) throw new Error('w/h 头错误: ' + w + 'x' + h);
    console.log('tilemap 头校验: tileSize=16, ' + w + 'x' + h + ' ✓');
    // 校验 tile 索引区（4x3=12 字节）：ground 全 1，walls 的 2 → 重映射后应为 2（gid 2 = tile1 索引 2）
    const idx = dataBytes.slice(5, 5 + 12);
    console.log('tile 索引区:', Array.from(idx).join(','));
    // 校验碰撞区（墙层=2 → 1）
    const col = dataBytes.slice(5 + 12, 5 + 24);
    console.log('碰撞区:', Array.from(col).join(','));

    // === 测试 2: 纯 tsx 导入 ===
    const res2 = core.tmxpConvertTsxOnly(tsxXml, px);
    console.log('\n== 纯 tsx 导入 ==');
    console.log('tile 数:', res2.tileCount, 'tilewidth:', res2.tilewidth);
    if (res2.tileCount !== 8) throw new Error('tsx 导入 tile 数应为 8，实际 ' + res2.tileCount);

    // === 测试 2b: 20x20=400 瓦片大图集（验证 >255 全量导入 + 未用到的瓦片也入库）===
    const bigPx = makePx(800, 800, (() => {
        const m = new Map();
        for (let t = 0; t < 400; t++) {
            const r = Math.floor(t / 20), c = t % 20;
            for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++)
                m.set(`${c*40+x},${r*40+y}`, [(t * 7) % 255, (t * 13) % 255, (t * 29) % 255, 255]);
        }
        return m;
    })());
    const tsxBig = `<?xml version="1.0" encoding="UTF-8"?>
<tileset name="big" tilewidth="40" tileheight="40" tilecount="400" columns="20">
 <image source="big.png" width="800" height="800"/>
</tileset>`;
    const res2b = core.tmxpConvertTsxOnly(tsxBig, bigPx);
    console.log('\n== 20x20=400 大图集纯 tsx 导入 ==');
    console.log('tile 数:', res2b.tileCount, '| tilewidth:', res2b.tilewidth, '| scaledFrom:', res2b.scaledFrom);
    if (res2b.tileCount !== 400) throw new Error('大图集应 400 个 tile，实际 ' + res2b.tileCount);
    if (res2b.tilewidth !== 16) throw new Error('40px 应自动缩放到 16px，实际 ' + res2b.tilewidth);
    if (res2b.scaledFrom !== 40) throw new Error('scaledFrom 应为 40，实际 ' + res2b.scaledFrom);
    console.log('✓ 400 瓦片全量导入（>255 上限已放宽）+ 40px 自动缩放为 16px');

    // 大图集 + 地图只用其中 5 种 → tileAssets 全量 400，tileset 引用 5
    const tmxBig = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" orientation="orthogonal" width="10" height="8" tilewidth="40" tileheight="40" infinite="0">
 <tileset firstgid="1" source="big.tsx"/>
 <layer name="g" width="10" height="8">
  <data encoding="csv">
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5,
1,2,3,4,5,1,2,3,4,5
  </data>
 </layer>
</map>`;
    const tmxB = await core.tmxpParseTmx(tmxBig, tsxBig);
    const resB = core.tmxpConvert(tmxB, bigPx, [0], []);
    console.log('\n== 大图集 + 地图(只用 5 种) ==');
    console.log('tileAssets:', resB.tileCount, '| tileset 引用:', (resB.tilemap.tileset || []).length, '| tilewidth:', resB.tilewidth, '| scaledFrom:', resB.scaledFrom);
    if (resB.tileCount !== 400) throw new Error('应全量导入 400，实际 ' + resB.tileCount);
    if ((resB.tilemap.tileset || []).length !== 5) throw new Error('tileset 引用应 5，实际 ' + (resB.tilemap.tileset || []).length);
    if (resB.tilewidth !== 16) throw new Error('40px 地图应缩放为 16px，实际 ' + resB.tilewidth);
    const hexB = atob(resB.tilemap.data);
    const dB = Uint8Array.from(hexB.match(/../g).map(h => parseInt(h, 16)));
    const idxB = dB.slice(5, 5 + 10 * 8);
    if (Math.max(...idxB) > 5) throw new Error('数据区索引应为 1..5（重映射），出现 >5: ' + Array.from(idxB).join(','));
    console.log('✓ 数据区索引 1..5 重映射正确（全量 400 资产 + 地图引用 5）');

    // 用户显式指定 targetTW=32：40px → 32px
    const resB32 = core.tmxpConvert(tmxB, bigPx, [0], [], 32);
    console.log('\n== 用户指定缩放 40 → 32px ==');
    console.log('tilewidth:', resB32.tilewidth, '| scaledFrom:', resB32.scaledFrom, '| tile 数:', resB32.tileCount);
    if (resB32.tilewidth !== 32) throw new Error('应缩放为 32px，实际 ' + resB32.tilewidth);
    if (resB32.scaledFrom !== 40) throw new Error('scaledFrom 应为 40，实际 ' + resB32.scaledFrom);
    if (resB32.tileCount !== 400) throw new Error('应仍 400 瓦片，实际 ' + resB32.tileCount);
    // 校验 32px 瓦片 f4 头尺寸
    const b32 = atob(resB32.tileAssets[0].data);
    const u32 = Uint8Array.from(b32, c => c.charCodeAt(0));
    if (u32[2] !== 32 || u32[4] !== 32) throw new Error('32px 瓦片 f4 头应 w=h=32，实际 ' + u32[2] + 'x' + u32[4]);
    console.log('✓ 40px → 32px 用户指定缩放正确（瓦片 f4 头 w=h=32）');

    // 非法 targetTW 应报错
    try {
        core.tmxpConvert(tmxB, bigPx, [0], [], 24);
        throw new Error('24px 应被拒绝');
    } catch (e) {
        if (String(e.message).indexOf('不受 Arcade 支持') < 0) throw new Error('应提示不支持，实际: ' + e.message);
        console.log('✓ 非法目标尺寸 24px 被拒绝并提示');
    }

    // === 测试 3: base64 zlib 图层解码（DecompressionStream）===
    const gidRaw = [1, 2, 3, 4, 5, 6];
    const raw = new Uint8Array(gidRaw.length * 4);
    gidRaw.forEach((g, i) => {
        raw[i*4] = g & 0xff; raw[i*4+1] = (g >> 8) & 0xff; raw[i*4+2] = (g >> 16) & 0xff; raw[i*4+3] = 0;
    });
    const zlib = require('zlib');
    const comp = zlib.deflateSync(raw);
    const b64 = Buffer.from(comp).toString('base64');
    if (typeof global.DecompressionStream === 'undefined') {
        console.log('\n(Node 无 DecompressionStream，跳过 zlib 解码测试)');
    } else {
        const gids = await core.tmxpDecodeTileData(b64, 'base64', 'zlib', 6, 1);
        console.log('\n== zlib 解码 ==');
        console.log('gids:', gids.join(','));
        if (gids.join(',') !== gidRaw.join(',')) throw new Error('zlib 解码错误');
    }

    console.log('\n=== 全部测试通过 ✓ ===');
}
main().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
