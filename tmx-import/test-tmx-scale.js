/* Node 测试：面积平均（box filter）缩放保留砖缝等细线（40→16 非整数倍） */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

const core = require('/home/user/Doubao/chats/38441484283733762/tmx-import-core.js');

function makePx(w, h, colors) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = colors.get(`${x},${y}`) || [0, 0, 0, 0];
        const i = (y * w + x) * 4;
        data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]; data[i+3] = c[3];
    }
    return { w, h, data };
}

// 40×40 源 tile：砖色(红 255,33,33 = PALETTE 2) 背景，y=20 处一条 1px 白色横缝（PALETTE 1），x=20 处一条 1px 白色竖缝
const colors = new Map();
for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    if (y === 20) colors.set(`${x},${y}`, [255, 255, 255, 255]);
    else if (x === 20) colors.set(`${x},${y}`, [255, 255, 255, 255]);
    else colors.set(`${x},${y}`, [255, 33, 33, 255]);
}
const px = makePx(40, 40, colors);
const tsx = `<tileset name="t" tilewidth="40" tileheight="40" tilecount="400" columns="20"><image source="t.png" width="800" height="800"/></tileset>`;

// 面积平均 40→16
const res = core.tmxpConvertTsxOnly(tsx, px, 16);
const tile0 = res.tileAssets[0];
// 解码 f4 → 行优先像素矩阵
const b = Uint8Array.from(atob(tile0.data), c => c.charCodeAt(0));
const w = b[2] | (b[3] << 8), h = b[4] | (b[5] << 8);
if (w !== 16 || h !== 16) throw new Error('应 16×16，实际 ' + w + 'x' + h);
const pix = new Uint8Array(w * h);
let p = 8;
for (let x = 0; x < w; x++) {
    let bitInByte = 0;
    for (let y = 0; y < h; y++) {
        pix[y * w + x] = (b[p] >> (bitInByte * 4)) & 0xf;
        bitInByte++;
        if (bitInByte === 2) { p++; bitInByte = 0; }
    }
    if (bitInByte !== 0) p++;
    while (p & 3) p++;
}

// 检查横缝：输出 y=8（对应源 y≈20）那一行应有非纯砖色（白色混入 → 颜色变亮，非索引 2 的纯红）
// 检查竖缝：输出 x=8 那一列应有非纯砖色
const redIdx = 2;
let horizMix = 0, vertMix = 0;
for (let x = 0; x < 16; x++) if (pix[8 * 16 + x] !== redIdx) horizMix++;
for (let y = 0; y < 16; y++) if (pix[y * 16 + 8] !== redIdx) vertMix++;
console.log('横缝行(y=8) 非纯红像素数:', horizMix, '| 竖缝列(x=8) 非纯红像素数:', vertMix);

if (horizMix === 0) throw new Error('横缝丢失：面积平均后 y=8 行应保留白缝混色（否则就是最近邻跳缝的老问题）');
if (vertMix === 0) throw new Error('竖缝丢失');
// 边缘像素（无缝）应仍为纯红
if (pix[0 * 16 + 0] !== redIdx || pix[15 * 16 + 15] !== redIdx)
    throw new Error('角落应保持纯砖色，实际 ' + pix[0] + '/' + pix[255]);

console.log('✓ 面积平均缩放保留横缝与竖缝（细线不再被跳过），角落色保持');
console.log('=== 砖缝保留测试通过 ✓ ===');
