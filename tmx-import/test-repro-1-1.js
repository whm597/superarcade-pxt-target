/* test-repro-1-1.js —— 真实 1-1.tmx 复现：检查背景瓦片 85 与地图索引 */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const zlib = require('zlib');
const fs = require('fs');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const core = require('/home/user/Doubao/chats/38441484283733762/tmx-import-core.js');

// 解析 map.png → px（复用 PNG 解码器）
function decodePng(path) {
    const buf = fs.readFileSync(path);
    let pos = 8;
    const chunks = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        chunks.push({ type, data: buf.slice(pos + 8, pos + 8 + len) });
        pos += 12 + len;
    }
    const ihdr = chunks.find(c => c.type === 'IHDR').data;
    const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
    const bitDepth = ihdr[8], colorType = ihdr[9];
    let palette = null;
    const plt = chunks.find(c => c.type === 'PLTE');
    if (plt) { palette = []; for (let i = 0; i < plt.data.length; i += 3) palette.push([plt.data[i], plt.data[i+1], plt.data[i+2]]); }
    const idat = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
    const raw = zlib.inflateSync(idat);
    const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
    const stride = w * bpp;
    const pixels = Buffer.alloc(w * h * 4);
    let off = 0;
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
        const f = raw[off++];
        const line = raw.slice(off, off + stride);
        off += stride;
        const recon = Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? recon[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let val = line[x];
            if (f === 1) val += a;
            else if (f === 2) val += b;
            else if (f === 3) val += Math.floor((a + b) / 2);
            else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); val += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
            recon[x] = val & 0xff;
        }
        for (let x = 0; x < w; x++) {
            const s = x * bpp;
            if (colorType === 6) { const i = (y*w+x)*4; pixels[i] = recon[s]; pixels[i+1] = recon[s+1]; pixels[i+2] = recon[s+2]; pixels[i+3] = recon[s+3]; }
            else if (colorType === 2) { const i = (y*w+x)*4; pixels[i] = recon[s]; pixels[i+1] = recon[s+1]; pixels[i+2] = recon[s+2]; pixels[i+3] = 255; }
            else if (colorType === 3) { const i = (y*w+x)*4; const p = palette[recon[s]]; pixels[i] = p[0]; pixels[i+1] = p[1]; pixels[i+2] = p[2]; pixels[i+3] = 255; }
        }
        prev = recon;
    }
    return { w, h, data: new Uint8ClampedArray(pixels) };
}

async function main() {
    const px = decodePng('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.png');
    console.log('PNG:', px.w + 'x' + px.h);
    const tmxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/1-1.tmx', 'utf8');
    const tsxXml = fs.readFileSync('/home/user/.doubao/agent_mode/workspace/.sessions/38441484283733762/attachments/map.tsx', 'utf8');
    const tmx = await core.tmxpParseTmx(tmxXml, tsxXml);
    console.log('地图:', tmx.w + 'x' + tmx.h, 'tile', tmx.tilewidth + 'px');
    console.log('图层:', tmx.layers.map(l => l.name + '(' + l.gids.filter(g => g !== 0).length + '非0)').join(', '));
    console.log('tilesets:', JSON.stringify(tmx.tilesets));

    // 主图层全部，无墙层 → 16px 缩放
    const res = core.tmxpConvert(tmx, px, null, [], 16);
    console.log('\ntile 数:', res.tileCount, '| tilewidth:', res.tilewidth, '| scaledFrom:', res.scaledFrom);

    // 找 gid 85 → 资产 id：gidLookup 顺序 gid 1..400 → tile0..399，所以 gid85 → tile84
    // 检查 tile84 的 f4 数据是否非 0（透明）
    const t84 = res.tileAssets.find(t => t.id === 'tile84');
    if (t84) {
        const b64 = t84.data;
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        console.log('\ntile84 (gid85, 背景) f4 头:', Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '), '| 总长:', bytes.length);
        const hdr = bytes[0] === 0x87 && bytes[1] === 4;
        console.log('f4 头合法:', hdr, '| 尺寸:', bytes[2] | (bytes[3] << 8), 'x', bytes[4] | (bytes[5] << 8));
        // 统计非透明像素（4bpp 索引 0 = 透明）
        const body = bytes.slice(8);
        let nonzero = 0;
        for (const b of body) { if ((b & 0x0f) !== 0) nonzero++; if ((b >> 4) !== 0) nonzero++; }
        console.log('非透明像素 nibble 数:', nonzero, '/', body.length * 2);
        // 常见颜色索引分布
        const cnt = new Map();
        for (const b of body) { cnt.set(b & 0x0f, (cnt.get(b & 0x0f) || 0) + 1); cnt.set(b >> 4, (cnt.get(b >> 4) || 0) + 1); }
        console.log('颜色索引分布:', [...cnt.entries()].sort((a,b) => b[1] - a[1]).slice(0,6).map(([k,v]) => k + 'x' + v).join(' '));
    } else console.log('\n! 未找到 tile84');

    // 检查地图索引区：背景格子（原 gid 85）应非 0
    const dataBytes = Uint8Array.from(atob(res.tilemap.data), c => c.charCodeAt(0));
    const w = dataBytes[1] | (dataBytes[2] << 8), h = dataBytes[3] | (dataBytes[4] << 8);
    console.log('\ntilemap 头: tileSize=' + dataBytes[0], w + 'x' + h);
    const idx = dataBytes.slice(5, 5 + w * h);
    const zeroCnt = idx.filter(v => v === 0).length;
    console.log('索引区 0 值格子数:', zeroCnt, '/', w * h);
    // 第一行前 20 格
    console.log('第一行前 20 格索引:', Array.from(idx.slice(0, 20)).join(','));
    // gid85 的重映射索引是多少
    console.log('背景 gid85 → 索引:', idx[0]);
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
