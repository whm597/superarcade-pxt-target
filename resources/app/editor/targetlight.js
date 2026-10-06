var pxtTargetBundle = {
    "id": "arcade",
    "name": "arcade",
    "nickname": "arcade",
    "thumbnailName": "MakeCode Arcade",
    "title": "Microsoft MakeCode Arcade",
    "description": "Develop your programming skills by quickly creating and modding retro arcade games with Blocks and JavaScript in the MakeCode editor",
    "corepkg": "device",
    "cloud": {
        "workspace": false,
        "sharing": true,
        "thumbnails": true,
        "importing": true,
        "packages": true,
        "publishing": true,
        "githubPackages": true,
        "showBadges": true,
        "cloudProviders": {
            "github": {
                "id": "github",
                "name": "GitHub",
                "icon": "docs/static/providers/github-mark.png",
                "identity": false,
                "order": 4
            },
            "microsoft": {
                "id": "microsoft",
                "name": "Microsoft",
                "icon": "docs/static/providers/microsoft-logo.svg",
                "identity": true,
                "redirect": true,
                "order": 1
            },
            "google": {
                "id": "google",
                "name": "Google",
                "icon": "docs/static/providers/google-logo.svg",
                "identity": true,
                "redirect": true,
                "order": 2
            },
            "clever": {
                "id": "clever",
                "name": "Clever",
                "icon": "docs/static/providers/clever-logo.png",
                "identity": true,
                "redirect": true,
                "order": 3
            }
        }
    },
    "staticpkgdirs": {
        "base": [
            "libs/hw",
            "libs/hw---n3",
            "libs/hw---gdk",
            "libs/hw---n4",
            "libs/hw---samd51",
            "libs/hw---samd51adafruit",
            "libs/hw---stm32f401",
            "libs/hw---rp2040"
        ],
        "extensions": [
            "libs/accelerometer",
            "libs/color",
            "libs/edge-connector",
            "libs/esp32",
            "libs/feather",
            "libs/light",
            "libs/lightsensor",
            "libs/mqtt",
            "libs/net",
            "libs/net-game",
            "libs/palette",
            "libs/radio",
            "libs/radio-broadcast",
            "libs/serial",
            "libs/servo",
            "libs/settings",
            "libs/sevenseg",
            "libs/shader",
            "libs/thermometer"
        ]
    },
    "cacheusedblocksdirs": [
        "skillmap/space",
        "skillmap/platformer"
    ],
    "compile": {
        "useUF2": true,
        "deployDrives": "(ARCADE|PY|FTHR840BOOT|ARCD|RPI-RP2)",
        "deployFileMarker": "INFO_UF2.TXT",
        "driveName": "ARCADE",
        "floatingPoint": true,
        "taggedInts": true,
        "nativeType": "thumb",
        "gc": true,
        "upgrades": [],
        "webUSB": true,
        "saveAsPNG": true,
        "patches": {
            "0.0.0 - *": [
                {
                    "type": "missingPackage",
                    "map": {
                        "(DigitalPin|AnalogPin|pins)\\.P\\d\\d?": "edge-connector",
                        "serial\\.": "serial"
                    }
                }
            ],
            "0.0.0 - 0.1.1": [
                {
                    "type": "api",
                    "map": {
                        "controller\\.controlSprite": "controller.moveSprite",
                        "controller\\.controlPlayer": "controller.movePlayer"
                    }
                }
            ],
            "0.0.0 - 0.3.23": [
                {
                    "type": "package",
                    "map": {
                        "local-multiplayer": ""
                    }
                }
            ],
            "0.0.0 - 0.3.24": [
                {
                    "type": "api",
                    "map": {
                        "sprites\\.createEmptySprite\\(([^)]+)\\)": "sprites.create(img`.`, $1)"
                    }
                },
                {
                    "type": "blockId",
                    "map": {
                        "keysdx": "keydx",
                        "keysdy": "keydy"
                    }
                }
            ],
            "0.0.0 - 0.11.20": [
                {
                    "type": "api",
                    "map": {
                        "SpriteKind": "SpriteKindLegacy"
                    }
                }
            ],
            "0.0.0 - 0.14.57": [
                {
                    "type": "missingPackage",
                    "map": {
                        "scene\\.setTileMap": "color-coded-tilemap",
                        "scene\\.setTile": "color-coded-tilemap",
                        "scene\\.getTile": "color-coded-tilemap",
                        "scene\\.getTilesByType": "color-coded-tilemap",
                        "scene\\.placeOnRandomTile": "color-coded-tilemap",
                        "scene\\.setTileAt": "color-coded-tilemap",
                        "scene\\.onHitTile": "color-coded-tilemap",
                        "\\.tileHitFrom": "color-coded-tilemap"
                    }
                }
            ],
            "0.0.0 - 0.18.9": [
                {
                    "type": "api",
                    "map": {
                        "tilemap\\s*\\.\\s*createTileSprite": "tiles.createTileSprite",
                        "tilemap\\s*\\.\\s*coverAllTiles": "tiles.coverAllTiles",
                        "tilemap\\s*\\.\\s*createSpritesOnTiles": "tiles.createSpritesOnTiles",
                        "tilemap\\s*\\.\\s*destorySpritesOfKind": "tiles.destroySpritesOfKind",
                        "tilemap\\s*\\.\\s*tileIs": "tiles.tileIs",
                        "tilemap\\s*\\.\\s*tileIsWall": "tiles.tileIsWall",
                        "tilemap\\s*\\.\\s*forEachTileOfKind": "tiles.forEachTileOfKind",
                        "tilemap\\s*\\.\\s*forEachTileOfMap": "tiles.forEachTileOfMap",
                        "tilemap\\s*\\.\\s*replaceAllTiles": "tiles.replaceAllTiles",
                        "tilemap\\s*\\.\\s*columnInDirection": "tiles.columnInDirection",
                        "tilemap\\s*\\.\\s*rowInDirection": "tiles.rowInDirection",
                        "tilemap\\s*\\.\\s*forEachDirection": "tiles.forEachDirection",
                        "tilemap\\s*\\.\\s*centerCameraOnTile": "tiles.centerCameraOnTile",
                        "tilemap\\s*\\.\\s*locationOfSprite": "tiles.locationOfSprite",
                        "tilemap\\s*\\.\\s*RowCol": "tiles.RowCol",
                        "tilemap\\s*\\.\\s*spriteRowCol": "tiles.spriteRowCol",
                        "tilemap\\s*\\.\\s*locationColumn": "tiles.locationColumn",
                        "tilemap\\s*\\.\\s*locationRow": "tiles.locationRow",
                        "tilemap\\s*\\.\\s*XY": "tiles.XY",
                        "tilemap\\s*\\.\\s*locationXY": "tiles.locationXY",
                        "tilemap\\s*\\.\\s*locationInDirection": "tiles.locationInDirection",
                        "tilemap\\s*\\.\\s*_directionEditor": "tiles._directionEditor",
                        "tilemap\\s*\\.\\s*tileWidth": "tiles.tileWidth",
                        "tilemap\\s*\\.\\s*tilemapColumns": "tiles.tilemapColumns",
                        "tilemap\\s*\\.\\s*tilemapRows": "tiles.tilemapRows",
                        "tilemap\\s*\\.\\s*screenCoordinateToTile": "tiles.screenCoordinateToTile",
                        "tilemap\\s*\\.\\s*tileCoordinateToScreen": "tiles.tileCoordinateToScreen",
                        "tilemap\\s*\\.\\s*centeredTileCoordinateToScreen": "tiles.centeredTileCoordinateToScreen",
                        "tilemap\\s*\\.\\s*OVERWORLD_MAP_ID": "tiles.OVERWORLD_MAP_ID",
                        "tilemap\\s*\\.\\s*MAP_LOADED_EVENT": "tiles.MAP_LOADED_EVENT",
                        "tilemap\\s*\\.\\s*WorldMap": "tiles.WorldMap",
                        "tilemap\\s*\\.\\s*WorldMapConnection": "tiles.WorldMapConnection",
                        "tilemap\\s*\\.\\s*createMap": "tiles.createMap",
                        "tilemap\\s*\\.\\s*copyMap": "tiles.copyMap",
                        "tilemap\\s*\\.\\s*loadMap": "tiles.loadMap",
                        "tilemap\\s*\\.\\s*getLoadedMap": "tiles.getLoadedMap",
                        "tilemap\\s*\\.\\s*onMapLoaded": "tiles.onMapLoaded",
                        "tilemap\\s*\\.\\s*onMapUnloaded": "tiles.onMapUnloaded",
                        "tilemap\\s*\\.\\s*connectMapById": "tiles.connectMapById",
                        "tilemap\\s*\\.\\s*loadConnectedMap": "tiles.loadConnectedMap",
                        "tilemap\\s*\\.\\s*getConnectedMap": "tiles.getConnectedMap",
                        "tilemap\\s*\\.\\s*setWorldLocationToMap": "tiles.setWorldLocationToMap",
                        "tilemap\\s*\\.\\s*loadMapAt": "tiles.loadMapAt",
                        "tilemap\\s*\\.\\s*getMapAtWorldLocation": "tiles.getMapAtWorldLocation",
                        "tilemap\\s*\\.\\s*loadMapInDirection": "tiles.loadMapInDirection",
                        "tilemap\\s*\\.\\s*loadedWorldColumn": "tiles.loadedWorldColumn",
                        "tilemap\\s*\\.\\s*loadedWorldRow": "tiles.loadedWorldRow"
                    }
                }
            ],
            "0.0.0 - 1.9.0": [
                {
                    "type": "api",
                    "map": {
                        "myCorg\\s*\\.\\s*follow": "myCorg.cameraFollow"
                    }
                }
            ]
        },
        "switches": {},
        "jsRefCounting": false,
        "utf8": true
    },
    "compileService": {
        "buildEngine": "codal",
        "githubCorePackage": "lancaster-university/codal",
        "gittag": "v0.8.0",
        "dockerImage": "pext/yotta:latest",
        "codalTarget": {
            "branches": {}
        }
    },
    "variants": {
        "stm32f401": {
            "compile": {
                "hasHex": true,
                "openocdScript": "source [find interface/stlink-v2.cfg]; source [find target/stm32f4x.cfg]",
                "flashEnd": 524288,
                "uf2Family": "0x57755a57"
            },
            "compileService": {
                "codalTarget": {
                    "name": "codal-big-brainpad",
                    "url": "https://github.com/lancaster-university/codal-big-brainpad",
                    "branch": "v1.3.1",
                    "type": "git"
                },
                "codalBinary": "STM32",
                "serviceId": "codal2stm32",
                "dockerImage": "pext/yotta:latest"
            }
        },
        "samd51": {
            "compile": {
                "hasHex": true,
                "openocdScript": "source [find interface/cmsis-dap.cfg]; set CHIPNAME at91samd51g19; source [find target/atsame5x.cfg]",
                "openocdScriptAlt": "source [find interface/stlink-v2.cfg]; set CPUTAPID 0x2ba01477; set CHIPNAME at91samd51g19; source [find target/at91samdXX.cfg]",
                "ramSize": 196608,
                "flashEnd": 524288,
                "uf2Family": "0x55114460"
            },
            "compileService": {
                "codalTarget": {
                    "name": "codal-itsybitsy-m4",
                    "url": "https://github.com/lancaster-university/codal-itsybitsy-m4",
                    "branch": "v0.2.7",
                    "type": "git"
                },
                "codalBinary": "ITSYBITSY_M4",
                "serviceId": "codal2samd51",
                "dockerImage": "pext/yotta:latest"
            }
        },
        "nrf52840": {
            "compile": {
                "hasHex": true,
                "openocdScript": "source [find interface/cmsis-dap.cfg]; source [find target/nrf52.cfg]",
                "webUSB": false,
                "flashEnd": 1007616,
                "uf2Family": "0xada52840"
            },
            "compileService": {
                "codalTarget": {
                    "name": "codal-nrf52840-dk",
                    "url": "https://github.com/mmoskal/codal-nrf52840-dk",
                    "branch": "v1.1.7",
                    "type": "git"
                },
                "codalBinary": "NRF52840_DK",
                "serviceId": "codal2nrf52840",
                "dockerImage": "pext/yotta:latest",
                "yottaConfig": {
                    "pxt": {
                        "board": {
                            "id": "BOARD_ID_NRF52840"
                        }
                    }
                }
            }
        },
        "nrf52833": {
            "compile": {
                "hasHex": true,
                "openocdScript": "source [find interface/cmsis-dap.cfg]; source [find target/nrf52.cfg]",
                "webUSB": false,
                "useUF2": false,
                "deployDrives": ".*",
                "deployFileMarker": "DETAILS.TXT",
                "flashCodeAlign": 4096,
                "flashUsableEnd": 471040,
                "flashEnd": 524288
            },
            "compileService": {
                "buildEngine": "codal",
                "codalTarget": {
                    "name": "codal-microbit-v2",
                    "url": "https://github.com/thomasjball/codal-microbit-v2",
                    "branch": "13a0d323b3a9c18a59e3120535d78654b6c8a566",
                    "type": "git"
                },
                "codalBinary": "MICROBIT",
                "githubCorePackage": "lancaster-university/microbit-v2-samples",
                "gittag": "v0.2.13",
                "serviceId": "mbcodal2",
                "dockerImage": "pext/yotta:latest",
                "yottaConfigCompatibility": true
            }
        },
        "rp2040": {
            "compile": {
                "hasHex": true,
                "openocdScript": "???",
                "flashChecksumAddr": 0,
                "flashEnd": 2097152,
                "uf2Family": "0xe48bff56"
            },
            "compileService": {
                "codalTarget": {
                    "name": "codal-pi-pico",
                    "url": "https://github.com/lancaster-university/codal-pi-pico",
                    "branch": "v0.0.13",
                    "type": "git"
                },
                "gittag": "v0.9.0",
                "codalBinary": "PI-PICO",
                "serviceId": "codal2pico",
                "dockerImage": "pext/arm:gcc9"
            }
        },
        "rpi": {
            "compile": {
                "hasHex": true,
                "useELF": true,
                "runtimeIsARM": true,
                "flashCodeAlign": 256,
                "webUSB": false,
                "stackAlign": 2
            },
            "compileService": {
                "buildEngine": "dockermake",
                "dockerImage": "pext/rpi:alsa",
                "serviceId": "rpi"
            }
        },
        "vm": {
            "compile": {
                "hasHex": true,
                "useELF": true,
                "flashCodeAlign": 256,
                "webUSB": false,
                "nativeType": "vm",
                "stackAlign": 2
            },
            "compileService": {
                "buildEngine": "dockercross",
                "dockerImage": "pext/crossbuild",
                "serviceId": "crossbuild",
                "skipCloudBuild": true
            }
        }
    },
    "serial": {
        "useEditor": true,
        "log": true,
        "editorTheme": {
            "graphBackground": "#d9d9d9",
            "lineColors": [
                "#009DDC",
                "#FB48C7",
                "#40bf4a",
                "#8073E5",
                "#d25b33"
            ]
        }
    },
    "runtime": {
        "mathBlocks": true,
        "loopsBlocks": true,
        "logicBlocks": true,
        "variablesBlocks": true,
        "textBlocks": true,
        "functionBlocks": true,
        "breakBlock": true,
        "continueBlock": true,
        "pauseUntilBlock": {
            "category": "loops"
        },
        "functionsOptions": {
            "useNewFunctions": true,
            "extraFunctionEditorTypes": [
                {
                    "typeName": "Sprite",
                    "icon": "send",
                    "defaultName": "mySprite"
                },
                {
                    "typeName": "Image",
                    "icon": "image outline",
                    "defaultName": "myImage"
                },
                {
                    "label": "Location",
                    "typeName": "tiles.Location",
                    "icon": "tree",
                    "defaultName": "myLocation"
                }
            ]
        },
        "listsBlocks": true,
        "tilesetFieldEditorIdentity": "images._tile",
        "bannedCategories": [
            "pins",
            "control",
            "input",
            "serial",
            "power"
        ]
    },
    "simulator": {
        "autoRun": true,
        "autoRunLight": false,
        "emptyRunCode": "pxsim.pxtcore.updateScreen(new pxsim.RefImage(160, 120, 4))",
        "aspectRatio": 0.85,
        "dynamicBoardDefinition": true,
        "keymap": true,
        "themeLayouts": [
            {
                "id": "retro",
                "name": "Retro",
                "colorFields": [
                    {
                        "property": "background-color",
                        "label": "Console",
                        "defaultValue": "#FCF7E4"
                    },
                    {
                        "property": "button-stroke",
                        "label": "Button outline",
                        "defaultValue": "#5C406C"
                    },
                    {
                        "property": "text-color",
                        "label": "Text",
                        "defaultValue": "#5C406C"
                    },
                    {
                        "property": "button-a-fill",
                        "label": "A button background",
                        "defaultValue": "#FF8135"
                    },
                    {
                        "property": "button-b-fill",
                        "label": "B button background",
                        "defaultValue": "#FF91C4"
                    },
                    {
                        "property": "dpad-fill",
                        "label": "D-pad",
                        "defaultValue": "#A3809C"
                    },
                    {
                        "property": "console-border",
                        "label": "Console border",
                        "defaultValue": "#96266C"
                    },
                    {
                        "property": "screen-side-border",
                        "label": "Screen side border",
                        "defaultValue": "#2F99A1"
                    },
                    {
                        "property": "screen-top-bottom-border",
                        "label": "Screen top and bottom border",
                        "defaultValue": "#F290C1"
                    }
                ]
            },
            {
                "id": "high-contrast",
                "name": "High Contrast"
            },
            {
                "id": "zune",
                "name": "Zune"
            },
            {
                "id": "junior",
                "name": "Junior",
                "colorFields": [
                    {
                        "property": "background-color",
                        "label": "Console",
                        "defaultValue": "#EB4444"
                    },
                    {
                        "property": "button-stroke",
                        "label": "Button outline",
                        "defaultValue": "#670C0C"
                    },
                    {
                        "property": "text-color",
                        "label": "Button labels",
                        "defaultValue": "#FFFFFF"
                    },
                    {
                        "property": "button-fill",
                        "label": "Buttons",
                        "defaultValue": "#D54322"
                    }
                ]
            }
        ],
        "themePresets": [
            {
                "id": "default",
                "name": "Default",
                "theme": {
                    "background-color": "#249CA3",
                    "button-stroke": "#397382",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#397382",
                    "joystick-handle-stroke": "#999999",
                    "layout": "default"
                }
            },
            {
                "id": "high-contrast",
                "name": "High Contrast",
                "theme": {
                    "background-color": "#000000",
                    "button-stroke": "#FFFFFF",
                    "text-color": "#FFFFFF",
                    "button-fill": "#000000",
                    "dpad-fill": "#000000",
                    "joystick-handle-stroke": "#FFFFFF",
                    "layout": "high-contrast"
                }
            },
            {
                "id": "red",
                "name": "Red",
                "theme": {
                    "background-color": "#ED3636",
                    "button-stroke": "#8D2525",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#8D2525",
                    "joystick-handle-stroke": "#8D2525",
                    "layout": "default"
                }
            },
            {
                "id": "blue",
                "name": "Blue",
                "theme": {
                    "background-color": "#4E4EE9",
                    "button-stroke": "#3333A1",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#3333A1",
                    "joystick-handle-stroke": "#3333A1",
                    "layout": "default"
                }
            },
            {
                "id": "orange",
                "name": "Orange",
                "theme": {
                    "background-color": "#FF9A14",
                    "button-stroke": "#B0701A",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#B0701A",
                    "joystick-handle-stroke": "#B0701A",
                    "layout": "default"
                }
            },
            {
                "id": "green",
                "name": "Green",
                "theme": {
                    "background-color": "#4EB94E",
                    "button-stroke": "#245D24",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#245D24",
                    "joystick-handle-stroke": "#245D24",
                    "layout": "default"
                }
            },
            {
                "id": "brown",
                "name": "Brown",
                "theme": {
                    "background-color": "#8B4513",
                    "button-stroke": "#68320C",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#68320C",
                    "joystick-handle-stroke": "#68320C",
                    "layout": "default"
                }
            },
            {
                "id": "bubblegum",
                "name": "Bubblegum",
                "theme": {
                    "background-color": "#F7ABB9",
                    "button-stroke": "#71C1C9",
                    "text-color": "#4E4E4E",
                    "button-fill": "#92F5FF",
                    "dpad-fill": "#F7ABB9",
                    "joystick-handle-stroke": "#71C1C9",
                    "layout": "default"
                }
            },
            {
                "id": "purple",
                "name": "Purple",
                "theme": {
                    "background-color": "#660FC7",
                    "button-stroke": "#4C0B95",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#4C0B95",
                    "joystick-handle-stroke": "#4C0B95",
                    "layout": "default"
                }
            },
            {
                "id": "microcode",
                "name": "MicroCode",
                "theme": {
                    "background-color": "#3F3F3F",
                    "button-stroke": "#212121",
                    "text-color": "#D9D9D9",
                    "button-fill": "#2D2D2D",
                    "dpad-fill": "#212121",
                    "joystick-handle-stroke": "#212121",
                    "layout": "default"
                }
            },
            {
                "id": "zune",
                "name": "Zune",
                "theme": {
                    "background-color": "#564131",
                    "button-stroke": "#524F4E",
                    "text-color": "#E7E7E7",
                    "button-fill": "#333333",
                    "dpad-fill": "#524F4E",
                    "joystick-handle-stroke": "#524F4E",
                    "layout": "zune"
                }
            },
            {
                "id": "junior",
                "name": "Junior",
                "theme": {
                    "background-color": "#EB4444",
                    "button-stroke": "#670C0C",
                    "text-color": "#FFFFFF",
                    "button-fill": "#D54322",
                    "layout": "junior"
                }
            },
            {
                "id": "retro",
                "name": "Retro",
                "theme": {
                    "background-color": "#FCF7E4",
                    "button-stroke": "#5C406C",
                    "text-color": "#5C406C",
                    "button-a-fill": "#FF8135",
                    "button-b-fill": "#FF91C4",
                    "dpad-fill": "#A3809C",
                    "console-border": "#96266C",
                    "screen-side-border": "#2F99A1",
                    "screen-top-bottom-border": "#F290C1",
                    "layout": "retro"
                }
            },
            {
                "id": "teal",
                "name": "Teal",
                "theme": {
                    "background-color": "#249CA3",
                    "button-stroke": "#397382",
                    "text-color": "#CECECE",
                    "button-fill": "#333333",
                    "dpad-fill": "#397382",
                    "joystick-handle-stroke": "#999999",
                    "layout": "default"
                }
            }
        ]
    },
    "queryVariants": {
        "skillmap=1": {
            "appTheme": {
                "embeddedTutorial": true,
                "allowParentController": true,
                "shareFinishedTutorials": false,
                "hideReplaceMyCode": false
            }
        },
        "teachertool=1": {
            "appTheme": {
                "hideMenuBar": true,
                "workspaceSearch": true,
                "noReloadOnUpdate": true
            }
        },
        "ninja=1": {
            "appTheme": {
                "embeddedTutorial": true,
                "allowParentController": true,
                "shareFinishedTutorials": false,
                "hideReplaceMyCode": false
            }
        }
    },
    "unsupportedBrowsers": [
        {
            "id": "ie"
        }
    ],
    "uploadDocs": true,
    "noSimShims": true,
    "defaultBadges": [
        {
            "id": "skillmap-completion-save the forest",
            "type": "skillmap-completion",
            "image": "docs/static/badges/badge-forest.png",
            "lockedImage": "docs/static/badges/badge-forest-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/forest",
            "title": "Save the Forest"
        },
        {
            "id": "skillmap-completion-zookeeper",
            "type": "skillmap-completion",
            "image": "docs/static/badges/badge-zoo.png",
            "lockedImage": "docs/static/badges/badge-zoo-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/zoo",
            "title": "Zookeeper"
        },
        {
            "id": "skillmap-completion-rockstar",
            "image": "docs/static/badges/badge-rockstar.png",
            "lockedImage": "docs/static/badges/badge-rockstar-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/rockstar",
            "type": "skillmap-completion",
            "title": "80's Rockstar"
        },
        {
            "id": "skillmap-completion-build a platformer game!",
            "image": "docs/static/badges/badge-jungle.png",
            "lockedImage": "docs/static/badges/badge-jungle-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/jungle",
            "type": "skillmap-completion",
            "title": "Jungle Jump"
        },
        {
            "id": "skillmap-completion-space",
            "image": "docs/static/badges/badge-space.png",
            "lockedImage": "docs/static/badges/badge-space-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/space",
            "type": "skillmap-completion",
            "title": "Space Explorer"
        },
        {
            "id": "skillmap-completion-shark",
            "image": "docs/static/badges/badge-shark.png",
            "lockedImage": "docs/static/badges/badge-shark-locked.png",
            "sourceURL": "https://www.makecode.com/api/md/arcade/skillmap/shark",
            "type": "skillmap-completion",
            "title": "Shark Splash"
        }
    ],
    "versions": {
        "target": "4.2.1",
        "pxt": "13.2.1"
    },
    "blocksprj": {
        "id": "blocksprj",
        "config": {
            "name": "{0}",
            "dependencies": {
                "device": "*"
            },
            "description": "",
            "files": [
                "main.blocks",
                "main.ts",
                "README.md",
                "assets.json"
            ],
            "additionalFilePaths": []
        },
        "files": {
            "README.md": " ",
            "assets.json": "",
            "main.blocks": "<xml xmlns=\"http://www.w3.org/1999/xhtml\">\n  <variables></variables>\n  <block type=\"pxt-on-start\" x=\"0\" y=\"0\"></block>\n</xml>",
            "main.ts": " "
        }
    },
    "tsprj": {
        "id": "tsprj",
        "config": {
            "name": "{0}",
            "dependencies": {
                "device": "*"
            },
            "description": "",
            "files": [
                "main.ts",
                "README.md",
                "assets.json"
            ],
            "additionalFilePaths": []
        },
        "files": {
            "README.md": " ",
            "assets.json": "",
            "main.ts": " "
        }
    },
    "colorThemeMap": {
        "pxt-high-contrast": {
            "id": "pxt-high-contrast",
            "name": "High Contrast",
            "weight": 100,
            "defaultSimulatorTheme": "high-contrast",
            "monacoBaseTheme": "hc-black",
            "colors": {
                "pxt-header-background": "#000000",
                "pxt-header-foreground": "#FFFFFF",
                "pxt-header-background-hover": "#000000",
                "pxt-header-foreground-hover": "#FFFFFF",
                "pxt-header-stencil": "#FFFFFF",
                "pxt-primary-background": "#000000",
                "pxt-primary-foreground": "#FFFFFF",
                "pxt-primary-background-hover": "#000000",
                "pxt-primary-foreground-hover": "#FFFFFF",
                "pxt-primary-accent": "#000000",
                "pxt-secondary-background": "#000000",
                "pxt-secondary-foreground": "#FFFFFF",
                "pxt-secondary-background-hover": "#000000",
                "pxt-secondary-foreground-hover": "#FFFFFF",
                "pxt-secondary-accent": "#000000",
                "pxt-tertiary-background": "#000000",
                "pxt-tertiary-foreground": "#FFFFFF",
                "pxt-tertiary-background-hover": "#000000",
                "pxt-tertiary-foreground-hover": "#FFFFFF",
                "pxt-tertiary-accent": "#000000",
                "pxt-target-background1": "#000000",
                "pxt-target-foreground1": "#FFFFFF",
                "pxt-target-background1-hover": "#000000",
                "pxt-target-foreground1-hover": "#cccccc",
                "pxt-target-stencil1": "#FFFFFF",
                "pxt-target-background2": "#000000",
                "pxt-target-foreground2": "#FFFFFF",
                "pxt-target-background2-hover": "#000000",
                "pxt-target-foreground2-hover": "#cccccc",
                "pxt-target-stencil2": "#FFFFFF",
                "pxt-target-background3": "#000000",
                "pxt-target-foreground3": "#FFFFFF",
                "pxt-target-background3-hover": "#000000",
                "pxt-target-foreground3-hover": "#cccccc",
                "pxt-target-stencil3": "#FFFFFF",
                "pxt-neutral-background1": "#000000",
                "pxt-neutral-foreground1": "#FFFFFF",
                "pxt-neutral-background1-hover": "#000000",
                "pxt-neutral-foreground1-hover": "#FFFFFF",
                "pxt-neutral-stencil1": "#FFFFFF",
                "pxt-neutral-background2": "#000000",
                "pxt-neutral-foreground2": "#FFFFFF",
                "pxt-neutral-background2-hover": "#000000",
                "pxt-neutral-foreground2-hover": "#FFFFFF",
                "pxt-neutral-stencil2": "#FFFFFF",
                "pxt-neutral-background3": "#000000",
                "pxt-neutral-foreground3": "#FFFFFF",
                "pxt-neutral-background3-hover": "#000000",
                "pxt-neutral-foreground3-hover": "#FFFFFF",
                "pxt-neutral-stencil3": "#FFFFFF",
                "pxt-neutral-background3-alpha90": "#000000E5",
                "pxt-neutral-base": "rgba(255, 255, 255, 1)",
                "pxt-neutral-alpha0": "rgba(255, 255, 255, 0)",
                "pxt-neutral-alpha10": "rgba(255, 255, 255, 0.1)",
                "pxt-neutral-alpha20": "rgba(255, 255, 255, 0.2)",
                "pxt-neutral-alpha50": "rgba(255, 255, 255, 0.5)",
                "pxt-neutral-alpha80": "rgba(255, 255, 255, 0.8)",
                "pxt-link": "#807FFF",
                "pxt-link-hover": "#BBBBFF",
                "pxt-focus-border": "#FFFF00",
                "pxt-success": "#00FF00",
                "pxt-success-foreground": "#000000",
                "pxt-success-hover": "#00FF00",
                "pxt-success-alpha10": "#00FF0019",
                "pxt-warning": "#00FFFF",
                "pxt-warning-foreground": "#FFFFFF",
                "pxt-warning-hover": "#00FFFF",
                "pxt-warning-alpha10": "#00FFFF19",
                "pxt-error": "#880000",
                "pxt-error-foreground": "#FFFFFF",
                "pxt-error-hover": "#880000",
                "pxt-error-alpha10": "#88000019",
                "pxt-colors-purple-background": "#FF00FF",
                "pxt-colors-purple-foreground": "#000000",
                "pxt-colors-purple-hover": "#FF00FF",
                "pxt-colors-purple-alpha10": "#FF00FF19",
                "pxt-colors-orange-background": "#FF7F00",
                "pxt-colors-orange-foreground": "#000000",
                "pxt-colors-orange-hover": "#FF7F00",
                "pxt-colors-orange-alpha10": "#FF7F0019",
                "pxt-colors-brown-background": "#d1b7a3",
                "pxt-colors-brown-foreground": "#FFFFFF",
                "pxt-colors-brown-hover": "#d1b7a3",
                "pxt-colors-brown-alpha10": "#d1b7a319",
                "pxt-colors-blue-background": "#0078D7",
                "pxt-colors-blue-foreground": "#FFFFFF",
                "pxt-colors-blue-hover": "#0086F1",
                "pxt-colors-blue-alpha10": "#0078D719",
                "pxt-colors-green-background": "#00FF00",
                "pxt-colors-green-foreground": "#000000",
                "pxt-colors-green-hover": "#00FF00",
                "pxt-colors-green-alpha10": "#00FF0019",
                "pxt-colors-red-background": "#880000",
                "pxt-colors-red-foreground": "#FFFFFF",
                "pxt-colors-red-hover": "#880000",
                "pxt-colors-red-alpha10": "#88000019",
                "pxt-colors-teal-background": "#5BE0FF",
                "pxt-colors-teal-foreground": "#000000",
                "pxt-colors-teal-hover": "#5BE0FF",
                "pxt-colors-teal-alpha10": "#5BE0FF19",
                "pxt-colors-yellow-background": "#FFFF00",
                "pxt-colors-yellow-foreground": "#000000",
                "pxt-colors-yellow-hover": "#FFFF00",
                "pxt-colors-yellow-alpha10": "#FFFF0019"
            },
            "overrideCss": ".common-button {\n    color: var(--pxt-neutral-foreground2) !important;\n    background-color: var(--pxt-neutral-background2) !important;\n    border-color: var(--pxt-neutral-foreground2) !important;\n}\n\n.common-button:hover, .common-button:focus {\n    outline: 2px solid var(--pxt-colors-yellow-background) !important;\n    z-index: 1;\n}\n\n.common-button.home-share-button {\n    border: 1px solid var(--pxt-neutral-foreground2) !important;\n}\n\n/*\nOverride default button background for the area menu, which requires transparency,\nbut still use a fairly opaque one to keep focus/visibility on the main buttons.\n*/\n.area-menu-container .area-button {\n    background-color: var(--pxt-neutral-alpha80) !important;\n}\n\n/*\n * \"User-provided content\" header in the import modal.\n */\n.ui.violet.message .header {\n    color: var(--pxt-colors-purple-background) !important;\n}\n\n/*\n * Checkbox styles\n * In HC the neutral and primary colors are the same, so we need to differentiate with\n * a different background color when checked.\n */\n.common-checkbox.toggle input:checked~label:before,\ndiv.field .ui.toggle.checkbox input:checked~label:before {\n    background-color: var(--pxt-colors-purple-background) !important;\n}\n\n.common-checkbox-icon.checked {\n    background-color: var(--pxt-colors-purple-background);\n    color: var(--pxt-colors-purple-foreground);\n    border-color: var(--pxt-colors-purple-hover);\n}\n\n.common-checkbox-icon.checked i.fas.fa-check {\n    color: var(--pxt-colors-purple-foreground);\n}\n\n/*\n * Make toggle \"handle\" more visible for HC\n */\n.common-checkbox.toggle label:after {\n    background-color: var(--pxt-neutral-foreground1) !important;\n}\n\n/*\n * Selection highlights\n */\n\n.blocklyContextMenu {\n    border: 3px solid var(--pxt-colors-yellow-background) !important;\n}\n\n.blocklyWidgetDiv .blocklyMenu.blocklyContextMenu .blocklyMenuItem.blocklyMenuItemHighlight {\n    border: 3px solid var(--pxt-colors-yellow-background) !important;\n}\n\n/*\n * Toolbox\n */\n.blocklyTreeRow:hover {\n    outline: 3px solid var(--pxt-colors-yellow-background) !important;\n}\n\n#blocklySearchInput i {\n    color: var(--pxt-neutral-foreground1);\n    opacity: 1;\n}\n\n/*\n * Inverted image colors\n */\n.barcharticon,\n.blockly-ws-search-next-btn,\n.blockly-ws-search-previous-btn,\n.blockly-ws-search-close-btn {\n    filter: invert(1);\n}\n\n/* Sim toolbar */\n#simulator .editor-sidebar .simtoolbar .debug-button.active,\n#simulator .editor-sidebar .simtoolbar .debug-button.active:hover {\n    /* Make active state more apparent with a yellow border */\n    color: var(--pxt-neutral-foreground2) !important;\n    background: var(--pxt-neutral-background2) !important;\n    border: 3px solid var(--pxt-colors-yellow-background) !important;\n}\n\n/* Image Editor */\n.image-editor-topbar, .image-editor-bottombar, .image-editor-sidebar {\n    background: var(--pxt-neutral-background1) !important;\n}\n.image-editor-tool-buttons {\n    background: none !important;\n}\n.image-editor-button,\n.image-editor-input,\n.image-editor-confirm {\n    border: 1px solid var(--pxt-neutral-foreground1);\n}\n.image-editor-canvas, .image-editor-canvas:hover, .image-editor-canvas:focus {\n    outline: none !important;\n}\n.cursor-button {\n    /* remove margin since we now have a border around the cursor buttons and it looks better centered */\n    margin-right: 0;\n}\n\n/* Toolbox */\n.pxtToolbox:not(.invertedToolbox) span.blocklyTreeLabel {\n    color: var(--pxt-target-foreground3);\n}\n\n.pxtToolbox:not(.invertedToolbox) .blocklyTreeSelected span.blocklyTreeLabel,\n.pxtToolbox:not(.invertedToolbox) .blocklyTreeSelected span.blocklyTreeIcon {\n    color: var(--pxt-target-foreground3);\n}\n\n.pxtToolbox:not(.invertedToolbox) .blocklyTreeRow:not(.blocklyTreeSelected) .blocklyTreeLabel {\n    color: var(--pxt-target-foreground3);\n}\n\n.pxtToolbox:not(.invertedToolbox) .blocklyTreeRow:not(.blocklyTreeSelected):hover,\n.pxtToolbox:not(.invertedToolbox) .blocklyTreeRow:not(.blocklyTreeSelected):focus {\n    background-color: #404040;\n}\n\n.blocksEditorOuter #blocklyTrashIcon {\n    color: var(--pxt-primary-foreground);\n}\n\n/*\n * Teaching Bubbles\n */\n.teaching-bubble,\n.teaching-bubble .teaching-bubble-navigation-buttons > .common-button {\n    background: var(--pxt-neutral-background1) !important;\n    color: var(--pxt-neutral-foreground1) !important;\n    border: solid var(--pxt-neutral-foreground1) !important;\n}\n\n.teaching-bubble-cutout {\n    border: 0.25rem solid var(--pxt-neutral-alpha20);\n}\n\n.teaching-bubble .ai-footer {\n    opacity: 1 !important;\n}\n\n.teaching-bubble-arrow,\n.teaching-bubble .ai-footer-text,\n.teaching-bubble .feedback-button,\n.teaching-bubble .feedback-button.disabled,\n.teaching-bubble .teaching-bubble-steps {\n    color: var(--pxt-neutral-foreground1) !important;\n}\n\n/*\n * Side Docs\n */\n\n#sidedocs {\n    background-color: var(--pxt-neutral-foreground1);\n}\n\n#sidedocsbar a i,\n#sidedocsbar a span {\n    color: var(--pxt-neutral-background1) !important;\n}\n\n#sidedocsbar a:hover,\n#sidedocsbar a:focus {\n    /* Yellow does not contrast well against white background */\n    outline: 3px solid var(--pxt-neutral-background1) !important;\n}\n\n#sidedocsbar a:hover i,\n#sidedocsbar a:focus i,\n#sidedocsbar a:hover span,\n#sidedocsbar a:focus span {\n    color: var(--pxt-link-hover) !important;\n}\n\n/*\n * Editor Toggle\n */\n#editortoggle .selected.item {\n    transition: none;\n    &:focus {\n        box-shadow: inset 0 0 0 6px #000000 !important;\n    }\n    >.icon {\n        color: #000000 !important;\n    }\n}\n\n#editordropdown.ui.button.active > .icon {\n    color: #000000 !important;\n}\n\n/*\n * Dropdown Menu\n */\n.common-menu-dropdown-item:hover,\n.common-menu-dropdown > .menu-button.expanded {\n    outline: var(--pxt-focus-border) solid 3px !important;\n    outline-offset: -4px;\n    z-index: 1;\n}\n\ntable.diffview.update .diff-added .ch-added {\n    color: var(--pxt-neutral-background1) !important;\n    outline-color: var(--pxt-neutral-background1) !important;\n}\n\n.blocklyFieldSliderDropdown {\n    background-color: var(--pxt-neutral-background1) !important;\n    border-color: var(--pxt-neutral-foreground1) !important;\n}\n\n.blocklyFieldSliderDropdown .blocklyFieldSliderLabel {\n    color: var(--pxt-neutral-foreground1) !important;\n}\n\n.blocklyFieldSliderDropdown input[type=range].blocklyFieldSlider {\n    outline: none !important;\n    background-color: var(--pxt-neutral-background1) !important;\n    --blocklyFieldSliderBackgroundColor: var(--pxt-neutral-background1) !important;\n    --blocklyFieldSliderThumbColor: var(--pxt-neutral-foreground1) !important;\n    --blocklyFieldSliderThumbBorderColor: var(--pxt-neutral-foreground1) !important;\n}\n\n.blocklyFieldSliderDropdown input[type=range].blocklyFieldSlider:hover::-webkit-slider-runnable-track, .blocklyFieldSliderDropdown input[type=range].blocklyFieldSlider:focus-visible::-webkit-slider-runnable-track {\n    outline: solid 3px var(--pxt-focus-border) !important;\n}\n\ninput[type=range].blocklyFieldSlider::-webkit-slider-runnable-track {\n    border: solid 1px var(--pxt-neutral-foreground1) !important;\n    box-sizing: content-box;\n}\n\ninput[type=range].blocklyFieldSlider::-moz-range-track {\n    border: solid 1px var(--pxt-neutral-foreground1) !important;\n    box-sizing: content-box;\n}\n\n.blocklyFieldSliderDropdown input[type=range].blocklyFieldSlider:hover::-moz-range-track, .blocklyFieldSliderDropdown input[type=range].blocklyFieldSlider:focus-visible::-moz-range-track {\n    outline: solid 3px var(--pxt-focus-border) !important;\n}\n\n/*\n * Music editor gallery\n */\n.song-gallery-item .common-button.play-button {\n    background-color: var(--pxt-neutral-background1) !important;\n    color: var(--pxt-neutral-foreground1) !important;\n    border: solid 2px var(--pxt-neutral-foreground1) !important;\n}\n\n.song-gallery-item .common-button.play-button i.fas {\n    color: var(--pxt-neutral-foreground1) !important;\n}\n\n.song-gallery-item .common-button.play-button:focus, .song-gallery-item .common-button.play-button:focus-visible {\n    outline: none !important;\n}\n\n.song-gallery-item .common-button.play-button:focus::after, .song-gallery-item .common-button.play-button:focus-visible::after {\n    border-radius: 50% !important;\n    outline-offset: 10px !important;\n}\n"
        },
        "arcade-dark": {
            "id": "arcade-dark",
            "name": "Dark",
            "weight": 60,
            "monacoBaseTheme": "vs-dark",
            "colors": {
                "pxt-header-background": "#181818",
                "pxt-header-foreground": "#ffffff",
                "pxt-header-background-hover": "#252525",
                "pxt-header-foreground-hover": "#ffffff",
                "pxt-header-stencil": "#323232",
                "pxt-primary-background": "#0078D4",
                "pxt-primary-foreground": "#ffffff",
                "pxt-primary-background-hover": "#026EC1",
                "pxt-primary-foreground-hover": "#ffffff",
                "pxt-primary-accent": "#005ba1",
                "pxt-secondary-background": "#63276d",
                "pxt-secondary-foreground": "#f3f2f1",
                "pxt-secondary-background-hover": "#742e80",
                "pxt-secondary-foreground-hover": "#f3f2f1",
                "pxt-secondary-accent": "#411a47",
                "pxt-tertiary-background": "#0078d4",
                "pxt-tertiary-foreground": "#ffffff",
                "pxt-tertiary-background-hover": "#026EC1",
                "pxt-tertiary-foreground-hover": "#ffffff",
                "pxt-tertiary-accent": "#0894ff",
                "pxt-target-background1": "#1F1F1F",
                "pxt-target-foreground1": "#f3f2f1",
                "pxt-target-background1-hover": "#2c2c2c",
                "pxt-target-foreground1-hover": "#ffffff",
                "pxt-target-stencil1": "#3b3a39",
                "pxt-target-background2": "#181818",
                "pxt-target-foreground2": "#ffffff",
                "pxt-target-background2-hover": "#252525",
                "pxt-target-foreground2-hover": "#ffffff",
                "pxt-target-stencil2": "#323232",
                "pxt-target-background3": "#181818",
                "pxt-target-foreground3": "#ffffff",
                "pxt-target-background3-hover": "#252525",
                "pxt-target-foreground3-hover": "#ffffff",
                "pxt-target-stencil3": "#323232",
                "pxt-neutral-background1": "#1F1F1F",
                "pxt-neutral-foreground1": "#f3f2f1",
                "pxt-neutral-background1-hover": "#2c2c2c",
                "pxt-neutral-foreground1-hover": "#ffffff",
                "pxt-neutral-stencil1": "#3b3a39",
                "pxt-neutral-background2": "#181818",
                "pxt-neutral-foreground2": "#ffffff",
                "pxt-neutral-background2-hover": "#252525",
                "pxt-neutral-foreground2-hover": "#ffffff",
                "pxt-neutral-stencil2": "#3b3a39",
                "pxt-neutral-background3": "#2d2d2d",
                "pxt-neutral-foreground3": "#f3f2f1",
                "pxt-neutral-background3-hover": "#202020",
                "pxt-neutral-foreground3-hover": "#ffffff",
                "pxt-neutral-stencil3": "#070707",
                "pxt-neutral-background3-alpha90": "#2d2d2de6",
                "pxt-neutral-base": "rgba(180, 180, 180, 1)",
                "pxt-neutral-alpha0": "rgba(180, 180, 180, 0)",
                "pxt-neutral-alpha10": "rgba(180, 180, 180, 0.1)",
                "pxt-neutral-alpha20": "rgba(180, 180, 180, 0.2)",
                "pxt-neutral-alpha50": "rgba(180, 180, 180, 0.5)",
                "pxt-neutral-alpha80": "rgba(180, 180, 180, 0.8)",
                "pxt-link": "#479ef5",
                "pxt-link-hover": "#62abf5",
                "pxt-focus-border": "#5caae5",
                "pxt-colors-purple-background": "#63276d",
                "pxt-colors-purple-foreground": "#f3f2f1",
                "pxt-colors-purple-hover": "#742e80",
                "pxt-colors-purple-alpha10": "#63276d19",
                "pxt-colors-orange-background": "#7a2101",
                "pxt-colors-orange-foreground": "#ffffff",
                "pxt-colors-orange-hover": "#932801",
                "pxt-colors-orange-alpha10": "#7a210119",
                "pxt-colors-brown-background": "#50301a",
                "pxt-colors-brown-foreground": "#ffffff",
                "pxt-colors-brown-hover": "#633c20",
                "pxt-colors-brown-alpha10": "#50301a19",
                "pxt-colors-blue-background": "#0078D4",
                "pxt-colors-blue-foreground": "#ffffff",
                "pxt-colors-blue-hover": "#026EC1",
                "pxt-colors-blue-alpha10": "#0078D419",
                "pxt-colors-green-background": "#27ae60",
                "pxt-colors-green-foreground": "#ffffff",
                "pxt-colors-green-hover": "#1e8449",
                "pxt-colors-green-alpha10": "#27ae6019",
                "pxt-colors-red-background": "#e74c3c",
                "pxt-colors-red-foreground": "#ffffff",
                "pxt-colors-red-hover": "#c0392b",
                "pxt-colors-red-alpha10": "#e74c3c19",
                "pxt-colors-teal-background": "#1abc9c",
                "pxt-colors-teal-foreground": "#ffffff",
                "pxt-colors-teal-hover": "#16a085",
                "pxt-colors-teal-alpha10": "#1abc9c19",
                "pxt-colors-yellow-background": "#fde300",
                "pxt-colors-yellow-foreground": "#000000",
                "pxt-colors-yellow-hover": "#e4cc00",
                "pxt-colors-yellow-alpha10": "#fde30019"
            },
            "overrideCss": ".image-editor-change-name .image-editor-input {\n    /* The textbox background matches the footer of the image editor, so add a border */\n    border: 1px solid var(--pxt-neutral-stencil2);\n}\n\n#langmodal #availablelocales .langoption .header {\n    /* Better contrast than default, which is purple */\n    color: var(--pxt-neutral-foreground1);\n}\n\n.pxtToolbox span.blocklyTreeLabel,\n.pxtToolbox .blocklyTreeSelected span.blocklyTreeLabel,\n.pxtToolbox .blocklyTreeSelected .blocklyTreeIcon {\n    /* Better contrast in toolbox */\n    color: var(--pxt-target-foreground3);\n}\n\n.pxtToolbox .blocklyTreeIcon,\n.tutorial-container span.docs.inlineblock {\n    /* Better contrast in toolbox & tutorial block colors, but try to preserve some of the icon color */\n    filter: brightness(1.2) saturate(2);\n}\n\n#mainmenu {\n    /* Some parts of the app use the same color as a background. This keeps the menu from blending in */\n    border-bottom: 1px solid var(--pxt-header-stencil);\n}\n\n.projectsdialog .ui.card:hover {\n    /* Neutral and target colors are the same in dark theme, so it helps to have a clearer border when hovering over cards. */\n    border-color: var(--pxt-focus-border) !important;\n}\n\n/* \n * Inverted image colors\n */\n.barcharticon,\n.blockly-ws-search-next-btn,\n.blockly-ws-search-previous-btn,\n.blockly-ws-search-close-btn {\n    filter: invert(1);\n}\n\n.modals .ui.button.immersive-reader-button,\n#mainmenu .immersive-reader-button.ui.item,\n#simulator .editor-sidebar .immersive-reader-button.ui.item {\n    background-image: url(\"/static/icons/immersive-reader-light.svg\") !important;\n}\n\n.carouselarrow {\n    /* Better contrast, especially against images in carousels */\n    opacity: 0.9;\n}\n\n/* For inverted buttons, it almost always looks better to have the background be dark instead of light (even though non-inverted has a light foreground) */\nbutton.ui.button.inverted:not(.teaching-bubble-button),\nbutton.common-button.inverted:not(.teaching-bubble-button) {\n    background-color: var(--pxt-neutral-background2) !important;\n}\n\nbutton.ui.button.inverted:hover:not(.teaching-bubble-button),\nbutton.common-button.inverted:hover:not(.teaching-bubble-button) {\n    background-color: var(--pxt-neutral-background2-hover) !important;\n}\n\n/* Fix for Problems panel hover visibility in dark theme */\n.errorList .errorListInner .ui.selection.list .item:focus,\n.errorList .errorListInner .ui.selection.list .item:hover {\n    /* Ensure text remains visible when hovering over error messages in Problems panel */\n    color: var(--pxt-neutral-foreground1) !important;\n}\n"
        },
        "arcade-light": {
            "id": "arcade-light",
            "name": "Light",
            "weight": 40,
            "colors": {
                "pxt-header-background": "#116E79",
                "pxt-header-foreground": "#FFFFFF",
                "pxt-header-background-hover": "#041d20",
                "pxt-header-foreground-hover": "#FFFFFF",
                "pxt-header-stencil": "#0b454c",
                "pxt-primary-background": "#5D4FBA",
                "pxt-primary-foreground": "#FFFFFF",
                "pxt-primary-background-hover": "#4d3eb1",
                "pxt-primary-foreground-hover": "#FFFFFF",
                "pxt-primary-accent": "#403587",
                "pxt-secondary-background": "#5D4FBA",
                "pxt-secondary-foreground": "#F8FAFC",
                "pxt-secondary-background-hover": "#483c9a",
                "pxt-secondary-foreground-hover": "#F8FAFC",
                "pxt-secondary-accent": "#403587",
                "pxt-tertiary-background": "#116E79",
                "pxt-tertiary-foreground": "#FFFFFF",
                "pxt-tertiary-background-hover": "#0b454c",
                "pxt-tertiary-foreground-hover": "#FFFFFF",
                "pxt-tertiary-accent": "#041d20",
                "pxt-target-background1": "#F8FAFC",
                "pxt-target-foreground1": "#000000",
                "pxt-target-background1-hover": "#d4e0ed",
                "pxt-target-foreground1-hover": "#000000",
                "pxt-target-stencil1": "#e1e1e1",
                "pxt-target-background2": "#F8FAFC",
                "pxt-target-foreground2": "#000000",
                "pxt-target-background2-hover": "#d4e0ed",
                "pxt-target-foreground2-hover": "#000000",
                "pxt-target-stencil2": "#e1e1e1",
                "pxt-target-background3": "#F8FAFC",
                "pxt-target-foreground3": "#000000",
                "pxt-target-background3-hover": "#d4e0ed",
                "pxt-target-foreground3-hover": "#000000",
                "pxt-target-stencil3": "#e1e1e1",
                "pxt-neutral-background1": "#FFFFFF",
                "pxt-neutral-foreground1": "rgba(0,0,0,.85)",
                "pxt-neutral-background1-hover": "#f2f2f2",
                "pxt-neutral-foreground1-hover": "rgba(0,0,0,.85)",
                "pxt-neutral-stencil1": "rgba(34, 74, 114, 0.15)",
                "pxt-neutral-background2": "#F8F8F8",
                "pxt-neutral-foreground2": "rgba(0,0,0,.85)",
                "pxt-neutral-background2-hover": "#ebebeb",
                "pxt-neutral-foreground2-hover": "rgba(0,0,0,.85)",
                "pxt-neutral-stencil2": "#e9eef2",
                "pxt-neutral-background3": "#4e5758",
                "pxt-neutral-foreground3": "#FFFFFF",
                "pxt-neutral-background3-hover": "#424a4a",
                "pxt-neutral-foreground3-hover": "#FFFFFF",
                "pxt-neutral-stencil3": "#FFFFFF",
                "pxt-neutral-background3-alpha90": "#4E5758E5",
                "pxt-neutral-base": "rgba(0, 0, 0, 1)",
                "pxt-neutral-alpha0": "rgba(0, 0, 0, 0)",
                "pxt-neutral-alpha10": "rgba(0, 0, 0, 0.1)",
                "pxt-neutral-alpha20": "rgba(0, 0, 0, 0.2)",
                "pxt-neutral-alpha50": "rgba(0, 0, 0, 0.5)",
                "pxt-neutral-alpha80": "rgba(0, 0, 0, 0.8)",
                "pxt-link": "#3977B4",
                "pxt-link-hover": "#204467",
                "pxt-focus-border": "#0078D4",
                "pxt-colors-purple-background": "#6B4F76",
                "pxt-colors-purple-foreground": "#FFFFFF",
                "pxt-colors-purple-hover": "#483c9a",
                "pxt-colors-purple-alpha10": "#6b4f7619",
                "pxt-colors-orange-background": "#F76820",
                "pxt-colors-orange-foreground": "#FFFFFF",
                "pxt-colors-orange-hover": "#dc4f08",
                "pxt-colors-orange-alpha10": "#F7682019",
                "pxt-colors-brown-background": "#663905",
                "pxt-colors-brown-foreground": "#FFFFFF",
                "pxt-colors-brown-hover": "#351e03",
                "pxt-colors-brown-alpha10": "#66390519",
                "pxt-colors-blue-background": "#116e79",
                "pxt-colors-blue-foreground": "#FFFFFF",
                "pxt-colors-blue-hover": "#0b454c",
                "pxt-colors-blue-alpha10": "#116e7919",
                "pxt-colors-green-background": "#2ecc71",
                "pxt-colors-green-foreground": "#FFFFFF",
                "pxt-colors-green-hover": "#22be64",
                "pxt-colors-green-alpha10": "#2ecc7119",
                "pxt-colors-red-background": "#a80000",
                "pxt-colors-red-foreground": "#FFFFFF",
                "pxt-colors-red-hover": "#8f0000",
                "pxt-colors-red-alpha10": "#a8000019",
                "pxt-colors-teal-background": "#116e79",
                "pxt-colors-teal-foreground": "#FFFFFF",
                "pxt-colors-teal-hover": "#0b454c",
                "pxt-colors-teal-alpha10": "#116e7919",
                "pxt-colors-yellow-background": "#f1c40f",
                "pxt-colors-yellow-foreground": "#000000",
                "pxt-colors-yellow-hover": "#c29d0b",
                "pxt-colors-yellow-alpha10": "#f1c40f19"
            },
            "overrideCss": ".gallerysegment .ui.card.link.cloudprojectscard {\n    /* Differentiate from New Project button */\n    background-color: var(--pxt-colors-teal-background) !important;\n    color: var(--pxt-colors-teal-foreground) !important;\n}\n"
        },
        "arcade-orange": {
            "id": "arcade-orange",
            "name": "Orange",
            "weight": 20,
            "colors": {
                "pxt-header-background": "#F76820",
                "pxt-header-foreground": "#FFFFFF",
                "pxt-header-background-hover": "#ab3d06",
                "pxt-header-foreground-hover": "#FFFFFF",
                "pxt-header-stencil": "#dc4f08",
                "pxt-primary-background": "#F76820",
                "pxt-primary-foreground": "#FFFFFF",
                "pxt-primary-background-hover": "#dc4f08",
                "pxt-primary-foreground-hover": "#FFFFFF",
                "pxt-primary-accent": "#C5561F",
                "pxt-secondary-background": "#028B9B",
                "pxt-secondary-background-hover": "#015e69",
                "pxt-secondary-foreground": "#FFFFFF",
                "pxt-secondary-foreground-hover": "#FFFFFF",
                "pxt-secondary-accent": "#015964",
                "pxt-tertiary-background": "#028B9B",
                "pxt-tertiary-foreground": "#FFFFFF",
                "pxt-tertiary-background-hover": "#015e69",
                "pxt-tertiary-foreground-hover": "#FFFFFF",
                "pxt-tertiary-accent": "#013136",
                "pxt-target-background1": "#FEF3E0",
                "pxt-target-foreground1": "#000000",
                "pxt-target-background1-hover": "#fce0af",
                "pxt-target-foreground1-hover": "#000000",
                "pxt-target-stencil1": "#e4d9c7",
                "pxt-target-background2": "#B1E1DA",
                "pxt-target-foreground2": "#000000",
                "pxt-target-background2-hover": "#8cd3c9",
                "pxt-target-foreground2-hover": "#000000",
                "pxt-target-stencil2": "#b0b0b0",
                "pxt-target-background3": "#FEF3E0",
                "pxt-target-foreground3": "#000000",
                "pxt-target-background3-hover": "#E4E4E4",
                "pxt-target-foreground3-hover": "#000000",
                "pxt-target-stencil3": "#e4d9c7",
                "pxt-neutral-background1": "#FFFFFF",
                "pxt-neutral-foreground1": "rgba(0,0,0,.85)",
                "pxt-neutral-background1-hover": "#f2f2f2",
                "pxt-neutral-foreground1-hover": "rgba(0,0,0,.85)",
                "pxt-neutral-stencil1": "rgba(34, 36, 38, .15)",
                "pxt-neutral-background2": "#F8F8F8",
                "pxt-neutral-foreground2": "rgba(0,0,0,.85)",
                "pxt-neutral-background2-hover": "#ebebeb",
                "pxt-neutral-foreground2-hover": "rgba(0,0,0,.85)",
                "pxt-neutral-stencil2": "#e9eef2",
                "pxt-neutral-background3": "#4e5758",
                "pxt-neutral-foreground3": "#FFFFFF",
                "pxt-neutral-background3-hover": "#424a4a",
                "pxt-neutral-foreground3-hover": "#FFFFFF",
                "pxt-neutral-stencil3": "#FFFFFF",
                "pxt-neutral-background3-alpha90": "#4E5758E5",
                "pxt-neutral-base": "rgba(0, 0, 0, 1)",
                "pxt-neutral-alpha0": "rgba(0, 0, 0, 0)",
                "pxt-neutral-alpha10": "rgba(0, 0, 0, 0.1)",
                "pxt-neutral-alpha20": "rgba(0, 0, 0, 0.2)",
                "pxt-neutral-alpha50": "rgba(0, 0, 0, 0.5)",
                "pxt-neutral-alpha80": "rgba(0, 0, 0, 0.8)",
                "pxt-link": "#3977B4",
                "pxt-link-hover": "#204467",
                "pxt-focus-border": "#0078D4",
                "pxt-warning": "#FFD43A",
                "pxt-warning-foreground": "#000000",
                "pxt-warning-hover": "#FFCE21",
                "pxt-warning-alpha10": "#FFD43A19",
                "pxt-colors-purple-background": "#6B4F76",
                "pxt-colors-purple-foreground": "#FFFFFF",
                "pxt-colors-purple-hover": "#4f3b57",
                "pxt-colors-purple-alpha10": "#6b4f7619",
                "pxt-colors-orange-background": "#ff7f50",
                "pxt-colors-orange-foreground": "#FFFFFF",
                "pxt-colors-orange-hover": "#ff5a1d",
                "pxt-colors-orange-alpha10": "#ff7f5019",
                "pxt-colors-brown-background": "#663905",
                "pxt-colors-brown-foreground": "#FFFFFF",
                "pxt-colors-brown-hover": "#351e03",
                "pxt-colors-brown-alpha10": "#66390519",
                "pxt-colors-blue-background": "#028b9b",
                "pxt-colors-blue-foreground": "#FFFFFF",
                "pxt-colors-blue-hover": "#015e69",
                "pxt-colors-blue-alpha10": "#028b9b19",
                "pxt-colors-green-background": "#2ecc71",
                "pxt-colors-green-foreground": "#FFFFFF",
                "pxt-colors-green-hover": "#22be64",
                "pxt-colors-green-alpha10": "#2ecc7119",
                "pxt-colors-red-background": "#a80000",
                "pxt-colors-red-foreground": "#FFFFFF",
                "pxt-colors-red-hover": "#8f0000",
                "pxt-colors-red-alpha10": "#a8000019",
                "pxt-colors-teal-background": "#028B9B",
                "pxt-colors-teal-foreground": "#FFFFFF",
                "pxt-colors-teal-hover": "#015e69",
                "pxt-colors-teal-alpha10": "#028b9b19",
                "pxt-colors-yellow-background": "#f1c40f",
                "pxt-colors-yellow-foreground": "#000000",
                "pxt-colors-yellow-hover": "#c29d0b",
                "pxt-colors-yellow-alpha10": "#f1c40f19"
            },
            "overrideCss": ".fullscreensim #boardview {\n    background: var(--pxt-target-background2);\n}"
        },
        "arcade-tokyo-night": {
            "id": "arcade-tokyo-night",
            "name": "Tokyo Night",
            "weight": 80,
            "defaultSimulatorTheme": "purple",
            "monacoBaseTheme": "vs-dark",
            "colors": {
                "pxt-header-background": "#16161E",
                "pxt-header-foreground": "#C0CAF5",
                "pxt-header-background-hover": "#24283B",
                "pxt-header-foreground-hover": "#FFFFFF",
                "pxt-header-stencil": "#3B4261",
                "pxt-primary-background": "#7AA2F7",
                "pxt-primary-foreground": "#16161E",
                "pxt-primary-background-hover": "#A9BFF8",
                "pxt-primary-foreground-hover": "#16161E",
                "pxt-primary-accent": "#3D59A1",
                "pxt-secondary-background": "#BB9AF7",
                "pxt-secondary-foreground": "#16161E",
                "pxt-secondary-background-hover": "#C7AEFA",
                "pxt-secondary-foreground-hover": "#16161E",
                "pxt-secondary-accent": "#6D4F8E",
                "pxt-tertiary-background": "#7DCFFF",
                "pxt-tertiary-foreground": "#16161E",
                "pxt-tertiary-background-hover": "#A9DCFF",
                "pxt-tertiary-foreground-hover": "#16161E",
                "pxt-tertiary-accent": "#3D7A99",
                "pxt-target-background1": "#1A1B26",
                "pxt-target-foreground1": "#C0CAF5",
                "pxt-target-background1-hover": "#24283B",
                "pxt-target-foreground1-hover": "#FFFFFF",
                "pxt-target-stencil1": "#3B4261",
                "pxt-target-background2": "#16161E",
                "pxt-target-foreground2": "#C0CAF5",
                "pxt-target-background2-hover": "#24283B",
                "pxt-target-foreground2-hover": "#FFFFFF",
                "pxt-target-stencil2": "#3B4261",
                "pxt-target-background3": "#24283B",
                "pxt-target-foreground3": "#C0CAF5",
                "pxt-target-background3-hover": "#292E42",
                "pxt-target-foreground3-hover": "#FFFFFF",
                "pxt-target-stencil3": "#3B4261",
                "pxt-neutral-background1": "#1A1B26",
                "pxt-neutral-foreground1": "#C0CAF5",
                "pxt-neutral-background1-hover": "#24283B",
                "pxt-neutral-foreground1-hover": "#FFFFFF",
                "pxt-neutral-stencil1": "#3B4261",
                "pxt-neutral-background2": "#16161E",
                "pxt-neutral-foreground2": "#C0CAF5",
                "pxt-neutral-background2-hover": "#24283B",
                "pxt-neutral-foreground2-hover": "#FFFFFF",
                "pxt-neutral-stencil2": "#3B4261",
                "pxt-neutral-background3": "#292E42",
                "pxt-neutral-foreground3": "#C0CAF5",
                "pxt-neutral-background3-hover": "#3B4261",
                "pxt-neutral-foreground3-hover": "#FFFFFF",
                "pxt-neutral-stencil3": "#565F89",
                "pxt-neutral-background3-alpha90": "#292E42E6",
                "pxt-neutral-base": "rgba(192, 202, 245, 1)",
                "pxt-neutral-alpha0": "rgba(192, 202, 245, 0)",
                "pxt-neutral-alpha10": "rgba(192, 202, 245, 0.1)",
                "pxt-neutral-alpha20": "rgba(192, 202, 245, 0.2)",
                "pxt-neutral-alpha50": "rgba(192, 202, 245, 0.5)",
                "pxt-neutral-alpha80": "rgba(192, 202, 245, 0.8)",
                "pxt-link": "#7AA2F7",
                "pxt-link-hover": "#A9BFF8",
                "pxt-focus-border": "#BB9AF7",
                "pxt-warning": "#E0AF68",
                "pxt-warning-foreground": "#16161E",
                "pxt-warning-hover": "#F2C77F",
                "pxt-warning-alpha10": "#E0AF6819",
                "pxt-colors-purple-background": "#BB9AF7",
                "pxt-colors-purple-foreground": "#16161E",
                "pxt-colors-purple-hover": "#C7AEFA",
                "pxt-colors-purple-alpha10": "#BB9AF719",
                "pxt-colors-orange-background": "#FF9E64",
                "pxt-colors-orange-foreground": "#16161E",
                "pxt-colors-orange-hover": "#FFB080",
                "pxt-colors-orange-alpha10": "#FF9E6419",
                "pxt-colors-brown-background": "#C17F59",
                "pxt-colors-brown-foreground": "#16161E",
                "pxt-colors-brown-hover": "#D39A78",
                "pxt-colors-brown-alpha10": "#C17F5919",
                "pxt-colors-blue-background": "#7AA2F7",
                "pxt-colors-blue-foreground": "#16161E",
                "pxt-colors-blue-hover": "#A9BFF8",
                "pxt-colors-blue-alpha10": "#7AA2F719",
                "pxt-colors-green-background": "#9ECE6A",
                "pxt-colors-green-foreground": "#16161E",
                "pxt-colors-green-hover": "#B4D98A",
                "pxt-colors-green-alpha10": "#9ECE6A19",
                "pxt-colors-red-background": "#F7768E",
                "pxt-colors-red-foreground": "#16161E",
                "pxt-colors-red-hover": "#FA94A7",
                "pxt-colors-red-alpha10": "#F7768E19",
                "pxt-colors-teal-background": "#73DACA",
                "pxt-colors-teal-foreground": "#16161E",
                "pxt-colors-teal-hover": "#93E3D7",
                "pxt-colors-teal-alpha10": "#73DACA19",
                "pxt-colors-yellow-background": "#E0AF68",
                "pxt-colors-yellow-foreground": "#16161E",
                "pxt-colors-yellow-hover": "#F2C77F",
                "pxt-colors-yellow-alpha10": "#E0AF6819"
            },
            "overrideCss": ".image-editor-change-name .image-editor-input {\n    /* The textbox background matches the footer of the image editor, so add a border */\n    border: 1px solid var(--pxt-neutral-stencil2);\n}\n\n#langmodal #availablelocales .langoption .header {\n    /* Better contrast than default, which is purple */\n    color: var(--pxt-neutral-foreground1);\n}\n\n.pxtToolbox span.blocklyTreeLabel,\n.pxtToolbox .blocklyTreeSelected span.blocklyTreeLabel,\n.pxtToolbox .blocklyTreeSelected .blocklyTreeIcon {\n    /* Better contrast in toolbox */\n    color: var(--pxt-target-foreground3);\n}\n\n.pxtToolbox .blocklyTreeIcon,\n.tutorial-container span.docs.inlineblock {\n    /* Better contrast in toolbox & tutorial block colors, but try to preserve some of the icon color */\n    filter: brightness(1.2) saturate(2);\n}\n\n#mainmenu {\n    /* Some parts of the app use the same color as a background. This keeps the menu from blending in */\n    border-bottom: 1px solid var(--pxt-header-stencil);\n}\n\n.projectsdialog .ui.card:hover {\n    /* Neutral and target colors are the same in dark theme, so it helps to have a clearer border when hovering over cards. */\n    border-color: var(--pxt-focus-border) !important;\n}\n\n/* \n * Inverted image colors\n */\n.barcharticon,\n.blockly-ws-search-next-btn,\n.blockly-ws-search-previous-btn,\n.blockly-ws-search-close-btn {\n    filter: invert(1);\n}\n\n.modals .ui.button.immersive-reader-button,\n#mainmenu .immersive-reader-button.ui.item,\n#simulator .editor-sidebar .immersive-reader-button.ui.item {\n    background-image: url(\"/static/icons/immersive-reader-light.svg\") !important;\n}\n\n.carouselarrow {\n    /* Better contrast, especially against images in carousels */\n    opacity: 0.9;\n}\n\n/* For inverted buttons, it almost always looks better to have the background be dark instead of light (even though non-inverted has a light foreground) */\nbutton.ui.button.inverted:not(.teaching-bubble-button),\nbutton.common-button.inverted:not(.teaching-bubble-button) {\n    background-color: var(--pxt-neutral-background2) !important;\n}\n\nbutton.ui.button.inverted:hover:not(.teaching-bubble-button),\nbutton.common-button.inverted:hover:not(.teaching-bubble-button) {\n    background-color: var(--pxt-neutral-background2-hover) !important;\n}\n\n/* Fix for Problems panel hover visibility in dark theme */\n.errorList .errorListInner .ui.selection.list .item:focus,\n.errorList .errorListInner .ui.selection.list .item:hover {\n    /* Ensure text remains visible when hovering over error messages in Problems panel */\n    color: var(--pxt-neutral-foreground1) !important;\n}\n\n#mainmenu .help-dropdown-menuitem > button.common-button,\n#mainmenu .settings-menuitem > button.common-button {\n    color: var(--pxt-header-foreground);\n}\n\n.fullscreen.extensions-browser > .common-modal > .common-modal-header .common-button.menu-button {\n    color: var(--pxt-header-foreground);\n}\n\n.common-menubar.header .common-button.menu-button {\n    color: var(--pxt-header-foreground);\n}\n\n.tutorial-controls > .ui.button {\n    color: var(--pxt-colors-blue-foreground);\n}\n\n.debugtoolbar .ui.menu .dbg-btn.dbg-step.disabled,\n.debugtoolbar .ui.menu .dbg-btn.dbg-step.disabled:hover {\n    color: var(--pxt-neutral-foreground1) !important;\n    opacity: 1;\n}\n\n.detailview .ui.grid.stackable .actions .card-action .button.approve {\n    background-color: var(--pxt-primary-background);\n    color: var(--pxt-primary-foreground);\n}\n\n.detailview .ui.grid.stackable .actions .card-action .card-action-button-link.common-link:hover,\n.detailview .ui.grid.stackable .actions .card-action .card-action-button-link.common-link:visited,\n.detailview .ui.grid.stackable .actions .card-action .card-action-button-link.common-link:focus,\n.detailview .ui.grid.stackable .actions .card-action .card-action-button-link.common-link:active {\n    color: var(--pxt-primary-foreground) !important;\n}\n\nbody.pxt-theme-root .ui.modal .actions a.ui.button.approve.secondary:focus,\nbody.pxt-theme-root .ui.modal .actions a.ui.button.approve.secondary:active {\n    background-color: var(--pxt-secondary-background-hover);\n    color: var(--pxt-secondary-foreground-hover);\n}\n\n.monaco-editor.vs-dark .suggest-widget .monaco-list .monaco-list-row.focused .details-label {\n    color: var(--pxt-colors-blue-foreground) !important;\n    opacity: 1;\n}\n"
        }
    }
}