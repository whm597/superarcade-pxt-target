const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let server;
let serverPort;

// Start a local HTTP server to serve static files
// (pxt-arcade uses absolute paths like /main.js which don't work with file://)
function startServer() {
    const editorDir = path.join(__dirname, 'editor');
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.map': 'application/json',
        '.md': 'text/markdown',
        '.webmanifest': 'application/manifest+json'
    };

    server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0];
        let filePath = path.join(editorDir, urlPath);
        if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');

        // Route /reference/xxx -> /docs/reference/xxx.html
        if (!path.extname(filePath)) {
            const refPath = path.join(editorDir, 'docs', urlPath + '.html');
            if (fs.existsSync(refPath)) filePath = refPath;
            // Route /pkg/xxx -> /docs/pkg/xxx.html
            const pkgPath = path.join(editorDir, 'docs', urlPath + '.html');
            if (!fs.existsSync(filePath) && fs.existsSync(pkgPath)) filePath = pkgPath;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found: ' + req.url);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });

    server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        console.log('Editor server running at http://127.0.0.1:' + serverPort);
        createWindow();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Arcade Editor (Custom)',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true
        },
        icon: path.join(__dirname, 'icon.png')
    });

    // Handle WebUSB device selection (required for USB download)
    mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
        event.preventDefault();
        console.log('[USB] select-usb-device called, devices:', details.deviceList.map(d => d.productName || d.vendorId + ':' + d.productId));
        // Auto-select the first available device
        if (details.deviceList && details.deviceList.length > 0) {
            const device = details.deviceList[0];
            console.log('[USB] Auto-selecting:', device.productName || device.vendorId + ':' + device.productId);
            callback(device.deviceId);
        } else {
            console.log('[USB] No devices found');
            callback('');
        }
    });

    // Grant USB device access
    mainWindow.webContents.session.on('usb-device-added', (event, device) => {
        console.log('[USB] Device added:', device.productName || device.vendorId + ':' + device.productId);
    });

    mainWindow.webContents.session.on('usb-device-removed', (event, device) => {
        console.log('[USB] Device removed:', device.productName || device.vendorId + ':' + device.productId);
    });

    // Create application menu with DevTools
    const template = [
        {
            label: '文件',
            submenu: [
                { role: 'reload', label: '重新加载' },
                { role: 'forceReload', label: '强制重新加载' },
                { type: 'separator' },
                { role: 'toggleDevTools', label: '开发者工具 (F12)' },
                { type: 'separator' },
                { role: 'quit', label: '退出' }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                { role: 'selectAll', label: '全选' }
            ]
        },
        {
            label: '视图',
            submenu: [
                { role: 'resetZoom', label: '重置缩放' },
                { role: 'zoomIn', label: '放大' },
                { role: 'zoomOut', label: '缩小' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '全屏' }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Also register F12 and Ctrl+Shift+I for DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
        }
    });

    // Load from local HTTP server
    mainWindow.loadURL('http://127.0.0.1:' + serverPort + '/index.html');

    // Open DevTools for debugging (can be removed in production)
    // mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Inject custom CSS and JS after page loads (with delay for React rendering)
    function injectCustom() {
        try {
            const cssPath = path.join(__dirname, 'inject', 'inject.css');
            if (fs.existsSync(cssPath)) {
                const css = fs.readFileSync(cssPath, 'utf8');
                mainWindow.webContents.insertCSS(css);
            }
            const jsPath = path.join(__dirname, 'inject', 'inject.js');
            if (fs.existsSync(jsPath)) {
                const js = fs.readFileSync(jsPath, 'utf8');
                mainWindow.webContents.executeJavaScript(js);
                console.log('[Inject] inject.js loaded');
            }
        } catch (e) {
            console.error('Inject error:', e);
        }
    }
    mainWindow.webContents.on('did-finish-load', () => {
        // Delay injection to allow React app to render
        setTimeout(injectCustom, 2000);
        // Retry injection after 5s in case first attempt missed DOM
        setTimeout(injectCustom, 5000);
    });

    // Also inject on iframe loads (simulator runs in iframe)
    mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (!isMainFrame) {
            try {
                const jsPath = path.join(__dirname, 'inject', 'inject.js');
                if (fs.existsSync(jsPath)) {
                    const js = fs.readFileSync(jsPath, 'utf8');
                    mainWindow.webContents.executeJavaScriptInFrame(frameRoutingId, js);
                }
            } catch (e) { }
        }
    });

    // Log console errors for debugging
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level >= 2) { // error or warning
            console.log(`[Renderer ${level}] ${message} (${sourceId}:${line})`);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    startServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (server) server.close();
    if (process.platform !== 'darwin') app.quit();
});
//（注：内容由AI生成）
