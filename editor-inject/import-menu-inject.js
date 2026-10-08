(function () {
    'use strict';
    /* ============================================================
     * [ImportMenu] 导入按钮收纳为顶部「导入▾」下拉菜单（v8.9.3）
     * 背景：6 个导入按钮（Tiled/MIDI/GIF/SB3/动画/图片）fixed top:60px
     *   从右往左横排，覆盖编辑区右上角，会遮挡地图编辑器的墙显示开关。
     * 方案：隐藏全部原按钮（保留监听），在顶部导航栏主页按钮左侧放
     *   一个「导入▾」下拉按钮，点击弹出 6 项菜单 → 触发对应原按钮 click。
     *   图片/动画按钮已被 img-scale 接管（新监听弹缩放对话框），触发
     *   click 仍走新流程。持续监听：每次重复注入新建的按钮也被隐藏并
     *   由菜单接管。
     * ============================================================ */
    function log() { console.log.apply(console, ['[ImportMenu]'].concat(Array.prototype.slice.call(arguments))); }

    var BTN_DEFS = [
        { id: 'tmx-import-btn', label: '导入Tiled' },
        { id: 'arcade-import-midi-btn', label: '导入MIDI' },
        { id: 'arcade-import-gif-btn', label: '导入GIF' },
        { id: 'arcade-import-sb3-btn', label: '导入SB3' },
        { id: 'arcade-import-anim-btn', label: '导入动画' },
        { id: 'arcade-import-btn', label: '导入图片' }
    ];

    function hideAll() {
        BTN_DEFS.forEach(function (d) {
            document.querySelectorAll('#' + d.id).forEach(function (b) { b.style.display = 'none'; });
        });
    }

    function trigger(id) {
        var b = document.getElementById(id);
        if (!b) { log('触发失败：' + id + ' 尚未创建'); return; }
        b.click();
    }

    function setupMenu() {
        if (document.getElementById('import-menu-root')) return;
        var btn = document.createElement('button');
        btn.id = 'import-menu-root';
        btn.textContent = '导入 ▾';
        btn.title = '导入外部资源（Tiled 地图 / 图片 / 动画 / GIF / SB3 / MIDI）';
        btn.style.cssText = 'position:fixed;top:64px;right:350px;z-index:99999;' +
            'padding:6px 14px;background:#ffffff;color:#333;border:1px solid #ccc;border-radius:4px;' +
            'cursor:pointer;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:sans-serif;';
        var panel = document.createElement('div');
        panel.id = 'import-menu-panel';
        panel.style.cssText = 'position:fixed;top:100px;right:350px;z-index:99999;display:none;' +
            'background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.2);' +
            'min-width:130px;padding:4px 0;font-family:sans-serif;';
        BTN_DEFS.forEach(function (d) {
            var item = document.createElement('div');
            item.textContent = d.label;
            item.style.cssText = 'padding:8px 16px;font-size:13px;color:#333;cursor:pointer;white-space:nowrap;';
            item.addEventListener('mouseenter', function () { item.style.background = '#f0f5ff'; });
            item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                panel.style.display = 'none';
                trigger(d.id);
            });
            panel.appendChild(item);
        });
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        });
        document.addEventListener('click', function () { panel.style.display = 'none'; });
        document.body.appendChild(btn);
        document.body.appendChild(panel);
        log('顶部导入菜单已创建');
    }

    function install() {
        log('install 开始: readyState=' + document.readyState);
        var run = function () { setupMenu(); hideAll(); };
        run();
        var MO = window.MutationObserver || globalThis.MutationObserver;
        if (typeof MO === 'function' && document.body) {
            try {
                var mo = new MO(function () { run(); });
                mo.observe(document.body, { childList: true, subtree: true });
                log('MutationObserver 已挂载（持续监听）');
            } catch (e) { log('MutationObserver 挂载失败:', e.message); }
        }
        setInterval(run, 2000);
        log('顶部导入菜单已启用');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();

    window.__importMenu = { hideAll: hideAll, trigger: trigger, setupMenu: setupMenu, install: install };
})();
