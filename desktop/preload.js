const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('proeliumDesktop', { platform: process.platform, version: process.versions.electron });
