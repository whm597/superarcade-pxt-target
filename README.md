# superarcade-pxt-target — SuperArcade 定制 MakeCode Arcade 编辑器注入文件与自改源码

> 这是整个定制系统**最核心的备份仓库**。云编译所用的全部定制代码都内嵌在 `target.js` 里，丢失它等于丢失整个定制系统。

## 项目背景

SuperArcade 掌机运行定制版 MakeCode Arcade 编辑器（Electron 桌面版）。定制方式：向编辑器主 JS 文件 `resources/app/editor/target.js` **注入**自定义代码（JavaScript + 内嵌 C++），实现：

- **游戏存档**：自移植 RAFFS 文件系统跑在外置 W25Q16 SPI Flash 上（48K 双半区，环形结构）
- **外置 SPI Flash 驱动**：软 SPI（SCK=PA15 / MOSI=PB3 / MISO=PB5 / CS=PB4），带"读-合并-写"防覆盖、擦除后校验重试
- **显示初始化**：ILI9341 / FSMC 4bpp 320×240
- **云编译修复**：codal 仓库 URL 指向 GitHub 镜像（原 gitee 跨洋 clone 失败）
- **诊断日志**：find/mount/GC 打印，用于串口排查

## 文件清单

| 文件 | 说明 |
|---|---|
| `target.js` | **8.6MB 完整工作副本**（MD5 见 `target.js.md5`）。含全部内嵌定制 C++ 与 JS。**本仓库一号资产** |
| `target.js.md5` | target.js 的 MD5 校验值（`58ca5172af9bd72a14e3bcd3da5fc21f`），用于核对版本是否分叉 |
| `extracted-sources/RAFFS.cpp` | 从 target.js 提取出的 RAFFS 存档实现（C++ 独立源码，v11.3 修复版，MD5 `944c03f9e7d879ca06ffe6ad6a99b896`），便于直接阅读/改代码 |
| `delta-save-hwspi-48k-v113.zip` | **最新增量包**。内含 `resources/app/editor/target.js`，是覆盖编辑器时的标准交付物（与仓库内 target.js 逐字节一致） |
| `tmx-import/` | **Tiled 瓦片地图导入功能（v8.5 验收闭环）**：注入模块源码 + 版本链备份 + 测试 + 增量包 + README（详见该目录 README.md） |

## 覆盖编辑器（恢复注入）

桌面版编辑器安装目录结构：`.../resources/app/editor/target.js`

1. 备份编辑器现有的 `target.js`（防止回退）
2. 解压 `delta-save-hwspi-48k-v113.zip`，把里面的 `resources/app/editor/target.js` 复制覆盖到编辑器同路径
3. 重启编辑器 → 云端编译即使用本 target 的 libs（含 RAFFS.cpp v11.3 修复）

> 注意：编辑器加载后运行的是 JS 运行时；云编译时由内嵌 pxtTargetBundle 提供 C++ 源码（含 RAFFS.cpp）到 codal 构建。**云编译不从 GitHub 的 codal-stm32f412-arcade 仓库取 RAFFS.cpp**（该仓库只有 codal 核心 inc/ld/src/utils）。

## 存档系统版本历史（防混淆）

| 版本 | 内容 |
|---|---|
| v4 ~ v10 | 外置 SPI Flash 存档系列：hwspi0/5/13，分区 32K→48K，写失败/读失败多轮修复 |
| v11 | Flash 层根治：读-合并-写（保留旧值 0xFF）+ erasePage 擦后 8B 校验重试 |
| v11.2 | find 诊断增强：`[R] find/t/HASH_OK/MEM_OK->HIT/SKIP/miss` |
| **v11.3** | **存读档闭环**：修复 `FS::read()` 参数 `bytes` 遮蔽成员变量（3 处 `bytes/2` → `this->bytes/2`）。此前两段式读档第一段 `want=0` 恒触发损坏记录判断 → 永远返回 -1 |

## 防分叉铁律（重要）

1. **所有 C++ 改动必须落在这个 `target.js` 工作副本上**，改完用 `node --check` 验证语法，再打增量包
2. 增量包路径固定为：`resources/app/editor/target.js` 和 `resources/app/inject/inject.js`
3. 打包时增量包内的 target.js 必须与本仓库这份**逐字节一致**（对 MD5）
4. 自改 C++ 源码（RAFFS.cpp 等）随备份保存在 `extracted-sources/`，杜绝"本地改了、云端不认"的孤儿副本
5. 修改 Keil/XML 配置文件（.uvprojx 等）写入必须 UTF-8 **无 BOM**，否则 Keil 打不开工程

## 固件基准（实测正常）

云编译固件特征：`pc=0x0803e545, exec ver=0x00004210, bytecode ptr=0x0804f400, bytecode[0]=0x923b8e70`，存读档正常。异常固件特征：`pc=0x08038a7d, ver=0x08010801`（垃圾/残缺数据，勿刷）。
