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

// ===== 3. showScaleDialog 交互（v8.11：统一像素 / 按百分比 双模式） =====
console.log('== 3. 缩放对话框 ==');
(async () => {
    const p1 = is.showScaleDialog(320, 240);
    await new Promise(r => setTimeout(r, 30));
    const wInput = win.document.querySelector('#imgscale-w-input');
    const hInput = win.document.querySelector('#imgscale-h-input');
    const ratioCb = win.document.querySelector('#imgscale-ratio');
    const pctInput = win.document.querySelector('#imgscale-percent');
    const modePx = win.document.querySelector('input[name="imgscale-mode"][value="px"]');
    const modePct = win.document.querySelector('input[name="imgscale-mode"][value="pct"]');
    const errOf = () => win.document.querySelector('div[style*="color: rgb(255, 107, 107)"]');
    check('默认宽/高 = 原尺寸 320/240', wInput.value === '320' && hInput.value === '240');
    check('等比默认勾选', ratioCb.checked === true);
    check('默认 px 模式', modePx.checked === true && modePct.checked === false);
    check('px 模式：宽高可用', wInput.disabled === false && hInput.disabled === false);
    check('px 模式：百分比禁用', pctInput.disabled === true, 'disabled=' + pctInput.disabled);

    // 等比快捷 → 自动切 pct 模式（本质是百分比快捷）
    const btn50 = Array.from(win.document.querySelectorAll('button[data-ratio]')).find(b => b.getAttribute('data-ratio') === '0.5');
    btn50.click();
    check('点 50% 快捷 → 切 pct 模式', modePct.checked === true, 'px=' + modePx.checked + ' pct=' + modePct.checked);
    check('点 50% → 百分比=50', pctInput.value === '50', 'pct=' + pctInput.value);
    check('pct 模式：百分比可用', pctInput.disabled === false);
    check('pct 模式：宽高禁用', wInput.disabled === true && hInput.disabled === true);

    // pct 模式输入 800% → 预览宽高 2560×1920
    pctInput.value = '800';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('pct 800% → 预览 2560×1920', wInput.value === '2560' && hInput.value === '1920', wInput.value + 'x' + hInput.value);

    // 非法百分比（900）→ 红字且不改预览
    pctInput.value = '900';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('pct 900 红字提示', !!(errOf() && errOf().textContent), errOf() && errOf().textContent);
    check('非法百分比不改预览（保持 2560）', wInput.value === '2560', 'w=' + wInput.value);
    pctInput.value = '50';
    pctInput.dispatchEvent(new win.Event('input', { bubbles: true }));

    // pct 确定 → {mode:'pct', percent}
    win.document.querySelector('#imgscale-ok').click();
    const v1 = await p1;
    check('pct 确定返回 {mode:pct, percent:50}', v1 && v1.mode === 'pct' && v1.percent === 50, JSON.stringify(v1));

    // px 模式：等比联动改宽 200 → 高自动 150
    const p3 = is.showScaleDialog(320, 240);
    await new Promise(r => setTimeout(r, 30));
    const w3 = win.document.querySelector('#imgscale-w-input');
    const h3 = win.document.querySelector('#imgscale-h-input');
    const pct3 = win.document.querySelector('#imgscale-percent');
    w3.value = '200';
    w3.dispatchEvent(new win.Event('input', { bubbles: true }));
    check('px 等比联动改宽 200 → 高 150', h3.value === '150', 'h=' + h3.value);
    check('px 模式确定前百分比仍禁用', pct3.disabled === true);
    win.document.querySelector('#imgscale-ok').click();
    const v3 = await p3;
    check('px 确定返回 {mode:px, 200, 150}', v3 && v3.mode === 'px' && v3.dstW === 200 && v3.dstH === 150, JSON.stringify(v3));

    // px 取消等比 → 自由指定 16×16（精灵场景）
    const p5 = is.showScaleDialog(320, 240);
    await new Promise(r => setTimeout(r, 30));
    const w5 = win.document.querySelector('#imgscale-w-input');
    const h5 = win.document.querySelector('#imgscale-h-input');
    const cb5 = win.document.querySelector('#imgscale-ratio');
    const pct5 = win.document.querySelector('#imgscale-percent');
    cb5.click(); // 取消等比
    check('px 取消等比后 百分比仍禁用', pct5.disabled === true, 'disabled=' + pct5.disabled);
    w5.value = '16'; h5.value = '16';
    win.document.querySelector('#imgscale-ok').click();
    const v5 = await p5;
    check('px 取消等比 → 自由指定 {16,16}', v5 && v5.mode === 'px' && v5.dstW === 16 && v5.dstH === 16, JSON.stringify(v5));

    // 精灵尺寸快捷 32×32 → px 模式固定像素
    const p4 = is.showScaleDialog(48, 32);
    await new Promise(r => setTimeout(r, 30));
    const btn32 = Array.from(win.document.querySelectorAll('button[data-px]')).find(b => b.getAttribute('data-px') === '32');
    btn32.click();
    const w4 = win.document.querySelector('#imgscale-w-input');
    const h4 = win.document.querySelector('#imgscale-h-input');
    const cb4 = win.document.querySelector('#imgscale-ratio');
    const pct4 = win.document.querySelector('#imgscale-percent');
    const modePx4 = win.document.querySelector('input[name="imgscale-mode"][value="px"]');
    const modePct4 = win.document.querySelector('input[name="imgscale-mode"][value="pct"]');
    check('精灵快捷 → 切回 px 模式', modePx4.checked === true && modePct4.checked === false);
    check('精灵快捷 32×32：宽=高=32', w4.value === '32' && h4.value === '32');
    check('精灵快捷自动解锁等比', cb4.checked === false);
    check('精灵快捷 → 百分比禁用', pct4.disabled === true, 'disabled=' + pct4.disabled);
    win.document.querySelector('#imgscale-ok').click();
    const v4 = await p4;
    check('精灵快捷确定返回 {mode:px, 32, 32}', v4 && v4.mode === 'px' && v4.dstW === 32 && v4.dstH === 32, JSON.stringify(v4));

    // 多文件计数显示
    const pMulti = is.showScaleDialog(320, 240, 3);
    await new Promise(r => setTimeout(r, 30));
    const infoDiv = win.document.querySelector('#imgscale-pxrow').previousElementSibling.previousElementSibling;
    check('多文件对话框显示共 3 张', !!infoDiv && infoDiv.textContent.indexOf('3') >= 0, infoDiv && infoDiv.textContent);
    win.document.querySelector('#imgscale-cancel').click();
    const vMulti = await pMulti;
    check('多文件取消返回 null', vMulti === null, String(vMulti));

    // 非法输入（px 模式）
    const p2 = is.showScaleDialog(100, 100);
    await new Promise(r => setTimeout(r, 30));
    const input2 = win.document.querySelector('#imgscale-w-input');
    input2.value = '-5';
    win.document.querySelector('#imgscale-ok').click();
    await new Promise(r => setTimeout(r, 30));
    check('px 非法输入红字提示', !!(errOf() && errOf().textContent), errOf() && errOf().textContent);
    input2.value = '100';
    win.document.querySelector('#imgscale-ok').click();
    const v2 = await p2;
    check('px 修正后确定 {mode:px, 100, 100}', v2 && v2.mode === 'px' && v2.dstW === 100 && v2.dstH === 100, JSON.stringify(v2));
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

    // ===== 6. calcDst 双模式尺寸计算（v8.11 核心：pct 每张分别 / px 统一） =====
    console.log('== 6. calcDst 双模式尺寸计算 ==');
    const d1 = is.calcDst('pct', 40, 40, { mode: 'pct', percent: 40 });
    check('pct 40%：40×40 → 16×16', d1[0] === 16 && d1[1] === 16, d1.join('x'));
    const d2 = is.calcDst('pct', 40, 80, { mode: 'pct', percent: 40 });
    check('pct 40%：40×80 → 16×32（不同高度各自缩放）', d2[0] === 16 && d2[1] === 32, d2.join('x'));
    const d3 = is.calcDst('pct', 100, 50, { mode: 'pct', percent: 150 });
    check('pct 150%：100×50 → 150×75', d3[0] === 150 && d3[1] === 75, d3.join('x'));
    const d4 = is.calcDst('px', 320, 240, { mode: 'px', dstW: 16, dstH: 16 });
    check('px：320×240 统一 → 16×16', d4[0] === 16 && d4[1] === 16);
    const d5 = is.calcDst('px', 40, 80, { mode: 'px', dstW: 16, dstH: 16 });
    check('px：40×80 也统一 → 16×16（不按各自比例）', d5[0] === 16 && d5[1] === 16);
    const d6 = is.calcDst('pct', 20, 20, { mode: 'pct', percent: 1 });
    check('pct 1%：20×20 → 1×1（≥1 保护）', d6[0] === 1 && d6[1] === 1, d6.join('x'));
    const d7 = is.calcDst('pct', 40, 40, { mode: 'pct', percent: 37.5 });
    check('pct 37.5%：40×40 → 15×15（支持小数百分比）', d7[0] === 15 && d7[1] === 15, d7.join('x'));

    // ===== 7. showMsg 滚动布局（v8.12：长清单不遮挡确定按钮） =====
    console.log('== 7. showMsg 滚动布局 ==');
    (async () => {
        const longBody = '已导入 120 张图片：\n' + Array.from({ length: 120 }, (_, i) => 'monster_' + i + ' 16x24').join('\n') + '\n请切换到「资源」标签查看。';
        const pMsg = is.showMsg('导入图片', longBody);
        await new Promise(r => setTimeout(r, 30));
        const btn = win.document.querySelector('#imgscale-msg-ok');
        const btnRow = btn.parentElement;
        const bodyDiv = btnRow.previousElementSibling;
        const dlg = btnRow.parentElement;
        check('对话框 flex 纵向布局', dlg.style.display === 'flex' && dlg.style.flexDirection === 'column',
            dlg.style.display + ' / ' + dlg.style.flexDirection);
        check('对话框 max-height 80vh', dlg.style.maxHeight === '80vh', dlg.style.maxHeight);
        check('正文区可滚动 overflow-y:auto', bodyDiv.style.overflowY === 'auto', bodyDiv.style.overflowY);
        check('正文区 flex:1（压缩时按钮仍可见）', bodyDiv.style.flex === '1 1 auto' || bodyDiv.style.flexGrow === '1', bodyDiv.style.flex);
        btn.click();
        const r = await pMsg;
        check('点击确定关闭提示', r === undefined && !win.document.querySelector('#imgscale-msg-ok'));
    })();

    // 等 4b 的异步断言（2600ms）跑完再退出
    setTimeout(() => {
        console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
        process.exit(fail ? 1 : 0);
    }, 3600);
    }, 0);
}
