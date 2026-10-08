// test-import-menu.js —— 顶部导入▾下拉菜单（v8.9.3）端到端测试
const { JSDOM } = require('/home/user/Doubao/chats/38441484283733762/pxt-dev/pxt-arcade/node_modules/jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + ' :: ' + (detail || '')); }
}

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
global.window = win; global.document = win.document;
win.pxt = { sprite: {}, appTarget: { runtime: { palette: [] } } };
win.__tmxImport = { findAssetManager: () => null };
const captured = [];
const is = win.__imgScale = {};
is.getPalette = () => [];
is.pngToBitmap = (pal, d, w, h) => ({ width: w, height: h, data: d });
is.findClosestColor = () => 0;

// 先创建 6 个模拟按钮（带各自旧监听计数）
const fired = {};
['tmx-import-btn','arcade-import-midi-btn','arcade-import-gif-btn','arcade-import-sb3-btn','arcade-import-anim-btn','arcade-import-btn'].forEach(id => {
    const b = win.document.createElement('button');
    b.id = id;
    b.textContent = 'btn';
    fired[id] = 0;
    b.addEventListener('click', () => fired[id]++);
    win.document.body.appendChild(b);
});
// 模拟 img-scale 已接管的图片/动画按钮（带 data-imgscale，点击创建 file input）
win.document.getElementById('arcade-import-btn').setAttribute('data-imgscale', '1');
win.document.getElementById('arcade-import-anim-btn').setAttribute('data-imgscale', '1');

// 注入 import-menu 模块
win.eval(fs.readFileSync('/home/user/Doubao/chats/38441484283733762/import-menu-inject.js', 'utf8'));
const im = win.__importMenu;
im.install(); // jsdom 停在 readyState=loading（DOMContentLoaded 不触发），手动执行 install

console.log('== 1. 原按钮隐藏 ==');
['tmx-import-btn','arcade-import-midi-btn','arcade-import-gif-btn','arcade-import-sb3-btn','arcade-import-anim-btn','arcade-import-btn'].forEach(id => {
    const b = win.document.getElementById(id);
    check('隐藏 ' + id, !!b && b.style.display === 'none', b && b.style.display);
});

console.log('== 2. 顶部菜单按钮 ==');
const root = win.document.getElementById('import-menu-root');
check('菜单按钮已创建', !!root && root.textContent.indexOf('导入') === 0);
const panel = win.document.getElementById('import-menu-panel');
check('菜单面板初始隐藏', !!panel && panel.style.display === 'none');

console.log('== 3. 点击展开菜单 ==');
root.click();
check('点击展开（display=block）', panel.style.display === 'block', panel.style.display);

console.log('== 4. 菜单项触发对应按钮 ==');
const items = panel.querySelectorAll('div');
check('菜单 6 项', items.length === 6);
// 点「导入Tiled」项
items[0].click();
check('点击后菜单收起', panel.style.display === 'none');
check('Tiled 旧监听被触发', fired['tmx-import-btn'] === 1, 'fired=' + fired['tmx-import-btn']);
// 点「导入图片」项（img-scale 已接管按钮 → click 走新监听创建 file input）
root.click(); // 重新展开
const imgItem = panel.querySelectorAll('div')[5];
imgItem.click();
check('图片按钮 click 被触发（走新监听）', fired['arcade-import-btn'] === 1, 'fired=' + fired['arcade-import-btn']);

console.log('== 5. 重复注入新按钮也被隐藏 ==');
// 模拟第二次注入创建同 id 新按钮（无 data-imgscale）
const dup = win.document.createElement('button');
dup.id = 'arcade-import-midi-btn';
dup.textContent = 'new';
dup.addEventListener('click', () => fired['arcade-import-midi-btn']++);
win.document.body.appendChild(dup);
setTimeout(() => {
    const all = win.document.querySelectorAll('#arcade-import-midi-btn');
    let hidden = 0;
    all.forEach(b => { if (b.style.display === 'none') hidden++; });
    check('重复注入按钮全部隐藏（' + all.length + ' 个）', hidden === all.length && all.length >= 2, 'hidden=' + hidden + '/' + all.length);
    // 菜单点击「导入MIDI」→ 触发最新按钮
    const panel2 = win.document.getElementById('import-menu-panel');
    win.document.getElementById('import-menu-root').click();
    const midiItem = panel2.querySelectorAll('div')[1];
    const before = fired['arcade-import-midi-btn'];
    midiItem.click();
    check('菜单触发最新 MIDI 按钮（含重复注入）', fired['arcade-import-midi-btn'] === before + 1,
        'before=' + before + ' after=' + fired['arcade-import-midi-btn']);
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
}, 2600);
