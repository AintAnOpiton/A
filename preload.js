// preload.js - Exposes APIs to the renderer

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  closeApp: () => ipcRenderer.send('close-app'),
  // API file/URL drops from the renderer
  handleFileDrop: (pathOrUrl) => ipcRenderer.send('file-dropped', pathOrUrl),
  // API to process file on demand
  processFile: (pathOrUrl) => ipcRenderer.send('process-file', pathOrUrl),
  //API to receive updates from the main process about the dropped item
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  //API to receive processed file result
  onFileProcessed: (callback) => ipcRenderer.on('file-processed', (event, data) => callback(data)),
  openWithDefaultApp: (filePath) => ipcRenderer.send('open-with-default-app', filePath),
  fs, // EXPOSE FS TO RENDERER
  path, // expose path to renderer
  openDialog: () => ipcRenderer.send('show-open-dialog'),
  createFolder: (baseDir, folderName) => ipcRenderer.send('create-folder', baseDir, folderName),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),

  // IPC real-time dir watching
  startWatchingDirectory: (dirPath) => ipcRenderer.send('start-watching-directory', dirPath),
  stopWatchingDirectory: (dirPath) => ipcRenderer.send('stop-watching-directory', dirPath),
  onDirectoryChanged: (callback) => ipcRenderer.on('directory-changed', (_event, changedPath) => callback(changedPath)),
  onFolderCreated: (callback) => ipcRenderer.on('folder-created', (event, data) => callback(data)),
});
