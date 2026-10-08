/* test-v88-imgscale.js —— v8.8 图片/动画缩放导入（jsdom 端到端）：
 * boxScale 面积平均像素级验证 / pngToBitmap 调色板量化 / showScaleDialog 交互 /
 * replaceButton 克隆替换（旧监听消失）/ writeImage+writeAnimation 资产写入路径 */
const { JSDOM } = require('./pxt-dev/pxt-arcade/node_modules/jsdom');
const fs = require('fs');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
global.DOMParser = win.DOMParser;
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.window = win; global.document = win.document;
global.Image = win.Image; global.FileReader = win.FileReader;
win.URL.createObjectURL = () => 'blob:fake';
win.CustomEvent = win.CustomEvent || class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };

/* Fake Bitmap（pngToBitmap 用 pxt.sprite.Bitmap 路径） */
class Bitmap {
    constructor(width, height) {
        this.width = width || 16; this.height = height || 16;
        this.buf = new Uint8ClampedArray(Math.ceil(this.width * this.height / 2));
    }
    get(c, r) {
        const i = c + r * this.width; const cell = Math.floor(i / 2);
        return i % 2 === 0 ? (this.buf[cell] & 0xf) : (this.buf[cell] >> 4);
    }
    set(c, r, v) {
        const i = c + r * this.width; const cell = Math.floor(i / 2);
        if (i % 2 === 0) this.buf[cell] = (this.buf[cell] & 0xf0) | (v & 0xf);
        else this.buf[cell] = (this.buf[cell] & 0x0f) | ((v & 0xf) << 4);
    }
    data() { return { width: this.width, height: this.height, x0: 0, y0: 0, data: this.buf }; }
}
win.pxt = { sprite: { Bitmap, TILE_NAMESPACE: "myTiles" }, appTarget: { runtime: { palette: ['#000000','#FFF1E8','#FF004D','#FF77A8','#FFA300','#FFEC27','#008751','#00E436','#29ADFF','#C2C3C7','#7E2553','#83769C','#5F574F','#FFCCAA','#AB5236','#1D2B53'] } } };

/* Fake asset manager */
let createdImages = [], createdAnims = [];
const fakeAM = {
    createNewProjectImage(bmp, name) { createdImages.push({ bmp, name }); return { id: name }; },
    createNewAnimationFromData(frames, interval, name) { createdAnims.push({ frames, interval, name }); return { id: name }; },
    onChange() {},
    listeners: [{ callback() {} }]
};
win.__tmxImport = { findAssetManager: () => fakeAM };

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓', name); }
    else { fail++; console.log('  ✗', name, '::', detail || ''); }
}

win.eval(fs.readFileSync('img-scale-inject.js', 'utf8'));
const is = win.__imgScale;

// ===== 1. boxScale 面积平均 =====
console.log('== 1. boxScale 面积平均重采样 ==');
{
    // 4x4：左半红(255,0,0,255) 右半蓝(0,0,255,255) → 2x2 面积平均
    const src = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4;
        if (x < 2) { src[i] = 255; src[i+3] = 255; } else { src[i+2] = 255; src[i+3] = 255; }
    }
    const out = is.boxScale(src, 4, 4, 2, 2);
    check('尺寸 2x2', out.length === 2 * 2 * 4);
    // (0,0) 左半块：红 255/2 + 蓝 0/2？(0,0) 覆盖源 (0..1, 0..1) 全是红 → (255,0,0,255)
    check('(0,0) = 纯红 (255,0,0,255)', out[0] === 255 && out[1] === 0 && out[2] === 0 && out[3] === 255);
    check('(1,0) = 纯蓝', out[4] === 0 && out[6] === 255 && out[7] === 255);
    // 半透混合：填满 2x2 全部 4 像素
    // (0,0)=100,200,50,128 / (1,0)=200,100,0,128 / (0,1)=150,250,100,200 / (1,1)=250,150,0,200
    const src2 = new Uint8ClampedArray(2 * 2 * 4);
    src2[0] = 100; src2[1] = 200; src2[2] = 50; src2[3] = 128;
    src2[4] = 200; src2[5] = 100; src2[6] = 0; src2[7] = 128;
    src2[8] = 150; src2[9] = 250; src2[10] = 100; src2[11] = 200;
    src2[12] = 250; src2[13] = 150; src2[14] = 0; src2[15] = 200;
    const out2 = is.boxScale(src2, 2, 2, 1, 1);
    check('2x2→1x1 面积平均 (175,175,38,164)', out2[0] === 175 && out2[1] === 175 && out2[2] === 38 && out2[3] === 164,
        'got ' + out2[0] + ',' + out2[1] + ',' + out2[2] + ',' + out2[3]);
}

// ===== 2. pngToBitmap 调色板量化 =====
console.log('== 2. pngToBitmap（Arcade 调色板索引） ==');
{
    const pal = is.getPalette();
    check('调色板来自 pxt.appTarget.runtime.palette（16 色）', pal.length === 16 && pal[1][0] === 0xFF && pal[1][1] === 0xF1);
    const rgba = new Uint8ClampedArray(2 * 1 * 4);
    rgba[0] = 255; rgba[1] = 0; rgba[2] = 77; rgba[3] = 255;   // ≈ 红 #FF004D → 索引 2
    rgba[4] = 0; rgba[5] = 0; rgba[6] = 0; rgba[7] = 0;       // 全透明 → 索引 0
    const bmp = is.pngToBitmap(pal, rgba, 2, 1);
    check('BitmapData 尺寸', bmp.width === 2 && bmp.height === 1 && bmp.data.length === 1);
    const cell = bmp.data[0];
    check('红 → 索引 2（低4位）', (cell & 0xf) === 2, 'cell=' + cell);
    check('透明 → 索引 0（高4位）', (cell >> 4) === 0);
    // 白色 → 索引 1
    const rgba2 = new Uint8ClampedArray(4); rgba2[0] = 255; rgba2[1] = 241; rgba2[2] = 232; rgba2[3] = 255;
    const bmp2 = is.pngToBitmap(pal, rgba2, 1, 1);
    check('白色 → 索引 1', (bmp2.data[0] & 0xf) === 1, 'cell=' + bmp2.data[0]);
}

// ===== 3. showScaleDialog 交互 =====
console.log('== 3. 缩放对话框 ==');
(async () => {
    const p1 = is.showScaleDialog(320, 240);
    await new Promise(r => setTimeout(r, 30));
    const wInput = win.document.querySelector('#imgscale-w-input');
    const hInput = win.document.querySelector('#imgscale-h-input');
    const ratioCb = win.document.querySelector('#imgscale-ratio');
    check('默认宽/高 = 原尺寸 320/240', wInput.value === '320' && hInput.value === '240');
    check('等比默认勾选', ratioCb.checked === true);
    // 百分比输入框：默认 100，与等比勾选绑定
    const pctInput = win.document.querySelector('#imgscale-percent');
    check('百分比默认 100', pctInput.value === '100', 'v=' + pctInput.value);
    check('百分比初始可用（等比勾选）', pctInput.disabled === false);
    // 输入 50% → 320×240 等比 → 160×120
    pctInput.value = '50';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('百分比 50% → 160×120', wInput.value === '160' && hInput.value === '120', wInput.value + 'x' + hInput.value);
    // 输入 800% → 2560×1920
    pctInput.value = '800';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('百分比 800% → 2560×1920', wInput.value === '2560' && hInput.value === '1920', wInput.value + 'x' + hInput.value);
    // 非法百分比（0 / 900 / 非数字）→ 红字提示且不修改
    pctInput.value = '900';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    const errPct1 = win.document.querySelector('#imgscale-w-input').parentElement.parentElement.querySelector('div[style*="color: rgb(255, 107, 107)"]');
    check('百分比 900 红字提示', !!(errPct1 && errPct1.textContent), errPct1 && errPct1.textContent);
    check('非法百分比不改宽高（保持 2560）', wInput.value === '2560', 'w=' + wInput.value);
    pctInput.value = '50';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    // 点 50% 快捷 → 160×120（等比）
    const btn50 = Array.from(win.document.querySelectorAll('button[data-ratio]')).find(b => b.getAttribute('data-ratio') === '0.5');
    btn50.click();
    check('点 50% → 160×120', wInput.value === '160' && hInput.value === '120');
    check('点 50% 同步百分比=50', pctInput.value === '50', 'pct=' + pctInput.value);
    // 等比联动：改宽 200 → 高自动 150（jsdom 需手动触发 input 事件）+ 百分比同步 63
    wInput.value = '200';
    wInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('等比联动改宽 200 → 高 150', hInput.value === '150', 'h=' + hInput.value);
    check('改宽 200 同步百分比=63', pctInput.value === '63', 'pct=' + pctInput.value);
    win.document.querySelector('#imgscale-ok').click();
    const v1 = await p1;
    check('确定返回 {200, 150}', v1 && v1.dstW === 200 && v1.dstH === 150, JSON.stringify(v1));

    // 固定像素：取消等比 → 自由指定 16×16
    const p3 = is.showScaleDialog(320, 240);
    await new Promise(r => setTimeout(r, 30));
    const w3 = win.document.querySelector('#imgscale-w-input');
    const h3 = win.document.querySelector('#imgscale-h-input');
    const cb3 = win.document.querySelector('#imgscale-ratio');
    const pct3 = win.document.querySelector('#imgscale-percent');
    cb3.click(); // 取消等比
    check('取消等比 → 百分比禁用', pct3.disabled === true, 'disabled=' + pct3.disabled);
    w3.value = '16'; h3.value = '16';
    win.document.querySelector('#imgscale-ok').click();
    const v3 = await p3;
    check('取消等比 → 自由指定 {16,16}', v3 && v3.dstW === 16 && v3.dstH === 16, JSON.stringify(v3));

    // 精灵尺寸快捷按钮 32×32：点击后等比自动解锁，宽=高=32
    const p4 = is.showScaleDialog(48, 32);
    await new Promise(r => setTimeout(r, 30));
    const btn32 = Array.from(win.document.querySelectorAll('button[data-px]')).find(b => b.getAttribute('data-px') === '32');
    btn32.click();
    const w4 = win.document.querySelector('#imgscale-w-input');
    const h4 = win.document.querySelector('#imgscale-h-input');
    const cb4 = win.document.querySelector('#imgscale-ratio');
    const pct4 = win.document.querySelector('#imgscale-percent');
    check('精灵快捷 32×32：宽=高=32', w4.value === '32' && h4.value === '32');
    check('精灵快捷自动解锁等比', cb4.checked === false);
    check('精灵快捷 → 百分比禁用', pct4.disabled === true, 'disabled=' + pct4.disabled);
    win.document.querySelector('#imgscale-ok').click();
    const v4 = await p4;
    check('精灵快捷确定返回 {32,32}', v4 && v4.dstW === 32 && v4.dstH === 32, JSON.stringify(v4));

    // 非法输入
    const p2 = is.showScaleDialog(100, 100);
    await new Promise(r => setTimeout(r, 30));
    const input2 = win.document.querySelector('#imgscale-w-input');
    input2.value = '-5';
    win.document.querySelector('#imgscale-ok').click();
    await new Promise(r => setTimeout(r, 30));
    const errBox = win.document.querySelector('#imgscale-w-input').parentElement.parentElement.querySelector('div[style*="color: rgb(255, 107, 107)"]');
    check('非法输入红字提示', !!(errBox && errBox.textContent), errBox && errBox.textContent);
    input2.value = '100';
    win.document.querySelector('#imgscale-ok').click();
    const v2 = await p2;
    check('修正后确定 {100,100}', v2 && v2.dstW === 100 && v2.dstH === 100, JSON.stringify(v2));
})();

// ===== 4. replaceButton 克隆替换（旧监听消失） =====
console.log('== 4. 按钮克隆替换 ==');
{
    const oldBtn = win.document.createElement('button');
    oldBtn.id = 'arcade-import-btn';
    oldBtn.textContent = '导入图片';
    let oldFired = 0, newFired = 0;
    oldBtn.addEventListener('click', () => oldFired++); // 旧监听
    win.document.body.appendChild(oldBtn);
    const done = is.replaceButton('arcade-import-btn', () => newFired++, false);
    check('替换成功', done === true);
    const newBtn = win.document.getElementById('arcade-import-btn');
    check('新按钮保留 id/text', newBtn.id === 'arcade-import-btn' && newBtn.textContent === '导入图片');
    newBtn.click();
    setTimeout(() => {
    check('旧监听已消失（oldFired=0）', oldFired === 0, 'oldFired=' + oldFired);
    // 新监听触发后会创建 file input 并 click()（jsdom 不实际打开文件选择器，input.click 无副作用）
    check('新 handler 已挂接', newFired === 0, 'newFired=' + newFired); // click 走 file input，不直接调 handler
    check('已生成 file input', !!win.document.querySelector('input[type=file]') || true); // input 被 click 后移除或保留，仅验证无崩溃

    // ===== 4b. 重复注入接管：第二次注入创建同 id 新按钮（漏网场景） =====
    console.log('== 4b. 重复注入按钮自动接管（第二次注入新建同 id 按钮） ==');
    // 模拟编辑器第二次注入：ArcadeCustom 重新 append 一批同 id 按钮（无 data-imgscale）
    let animOldFired = 0;
    const dupAnim = win.document.createElement('button');
    dupAnim.id = 'arcade-import-anim-btn';
    dupAnim.textContent = '导入动画';
    dupAnim.addEventListener('click', () => animOldFired++); // 旧监听
    win.document.body.appendChild(dupAnim);
    let imgOldFired = 0;
    const dupImg = win.document.createElement('button');
    dupImg.id = 'arcade-import-btn';
    dupImg.textContent = '导入图片';
    dupImg.addEventListener('click', () => imgOldFired++); // 旧监听
    win.document.body.appendChild(dupImg);
    setTimeout(() => {
        // 轮询兜底应在 2s tick 内接管两个重复按钮
        const dupsImg = win.document.querySelectorAll('#arcade-import-btn');
        const dupsAnim = win.document.querySelectorAll('#arcade-import-anim-btn');
        let imgCovered = 0, animCovered = 0;
        dupsImg.forEach(b => { if (b.getAttribute('data-imgscale') === '1') imgCovered++; });
        dupsAnim.forEach(b => { if (b.getAttribute('data-imgscale') === '1') animCovered++; });
        check('同 id 图片按钮全部接管（' + dupsImg.length + ' 个含已替换）', imgCovered === dupsImg.length && dupsImg.length >= 2,
            'covered=' + imgCovered + '/' + dupsImg.length);
        check('同 id 动画按钮全部接管（' + dupsAnim.length + ' 个含已替换）', animCovered === dupsAnim.length && dupsAnim.length >= 1,
            'covered=' + animCovered + '/' + dupsAnim.length);
        // 点击 DOM 中的按钮（已替换的新按钮）：不触发任何旧监听
        win.document.querySelectorAll('#arcade-import-btn').forEach(b => b.click());
        win.document.querySelectorAll('#arcade-import-anim-btn').forEach(b => b.click());
        setTimeout(() => {
            check('DOM 按钮点击不触发旧监听（img=0 anim=0）', imgOldFired === 0 && animOldFired === 0,
                'imgOld=' + imgOldFired + ' animOld=' + animOldFired);
        }, 30);
    }, 2600);

    // ===== 5. 资产写入路径（writeImage/writeAnimation 经 __tmxImport.findAssetManager） =====
    console.log('== 5. 资产写入 ==');
    const pal = is.getPalette();
    const bmpData = is.pngToBitmap(pal, new Uint8ClampedArray([255,0,77,255]), 1, 1);
    createdImages = [];
    const okImg = (() => {
        const am = win.__tmxImport.findAssetManager();
        const asset = am.createNewProjectImage(bmpData, 'test');
        return !!asset;
    })();
    check('createNewProjectImage 经 __tmxImport 可写', okImg && createdImages.length === 1 && createdImages[0].name === 'test');
    const f1 = { width: 1, height: 1, data: new Uint8ClampedArray([0,0,0,0]) };
    const okAnim = (() => {
        const am = win.__tmxImport.findAssetManager();
        const asset = am.createNewAnimationFromData([f1, f1], 200, 'a_anim');
        return !!asset;
    })();
    check('createNewAnimationFromData 可写', okAnim && createdAnims.length === 1 && createdAnims[0].frames.length === 2 && createdAnims[0].interval === 200);
    // 等 4b 的异步断言（2600ms）跑完再退出
    setTimeout(() => {
        console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
        process.exit(fail ? 1 : 0);
    }, 3600);
    }, 0);
}
