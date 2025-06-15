// Main file that handles the window, system-grade events and IPC from renderer

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron'); // core for Electron
const path = require('path'); //f path ahndle
const fs = require('fs');
const { execFile } = require('child_process'); // node.js child
const https = require('https');
const http = require('http');
const os = require('os'); //os info and temp dirs
const chokidar = require('chokidar'); //chokidar lib for sys watchers

let currentWatcher = null; 

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // secure measure bypass to get file paths in drag-drop
    }
  });

  mainWindow.loadFile('index.html');

  ipcMain.on('minimize-app', () => {
    mainWindow.minimize();
  });

  ipcMain.on('close-app', () => {
    mainWindow.close();
  });

  function downloadFile(url, dest, cb) {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (response) => {
      if (response.statusCode !== 200) {
        cb(new Error('Failed to get file: ' + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => cb(null, dest));
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => cb(err));
    });
  }

  ipcMain.on('file-dropped', (event, pathOrUrl) => {
    if (!pathOrUrl) {
      event.sender.send('file-opened', { type: 'unknown', status: 'error', message: 'No valid item provided.' });
      return;
    }

    const isURL = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

    if (isURL) {
      // prev from temp
      const ext = path.extname(pathOrUrl.split('?')[0]).toLowerCase() || '.png';
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, 'electron_url_' + Date.now() + ext);
      downloadFile(pathOrUrl, tempFile, (err, localPath) => {
        if (err) {
          event.sender.send('file-opened', { type: 'url', path: pathOrUrl, status: 'error', message: 'Download failed: ' + err.message });
          return;
        }
        // prev file, no proc
        event.sender.send('file-opened', { type: imageExtensions.includes(ext) ? 'image' : 'video', path: localPath, status: 'success' });
      });
      return;
    } else if (fs.existsSync(pathOrUrl)) {
      const ext = path.extname(pathOrUrl).toLowerCase();
      const stat = fs.statSync(pathOrUrl);
      if (stat.isDirectory()) {
        event.sender.send('file-opened', { type: 'directory', path: pathOrUrl, status: 'success' });
      } else if (imageExtensions.includes(ext) || videoExtensions.includes(ext)) {
        // prev casual
        event.sender.send('file-opened', { type: imageExtensions.includes(ext) ? 'image' : 'video', path: pathOrUrl, status: 'success' });
      } else {
        event.sender.send('file-opened', { type: 'unknown', path: pathOrUrl, status: 'error', message: 'Unsupported file type.' });
      }
    } else {
      event.sender.send('file-opened', { type: 'unknown', path: pathOrUrl, status: 'error', message: 'File does not exist.' });
    }
  });

  // IPC to dir watch
  ipcMain.on('start-watching-directory', (event, dirPath) => {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      console.warn(`Attempted to watch non-existent or non-directory path: ${dirPath}`);
      return;
    }

    // shut down redundant watchers
    if (currentWatcher) {
      currentWatcher.close();
      console.log(`Stopped watching old directory:`, currentWatcher.getWatched());
    }

    currentWatcher = chokidar.watch(dirPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 0 
    });

    currentWatcher
      .on('add', (path) => {
        console.log(`File ${path} has been added`);
        event.sender.send('directory-changed', dirPath); 
      })
      .on('change', (path) => {
        console.log(`File ${path} has been changed`);
        event.sender.send('directory-changed', dirPath); 
      })
      .on('unlink', (path) => {
        console.log(`File ${path} has been removed`);
        event.sender.send('directory-changed', dirPath); 
      })
      .on('addDir', (path) => {
        console.log(`Directory ${path} has been added`);
        event.sender.send('directory-changed', dirPath); 
      })
      .on('unlinkDir', (path) => {
        console.log(`Directory ${path} has been removed`);
        event.sender.send('directory-changed', dirPath);
      })
      .on('error', (error) => console.error(`Watcher error for ${dirPath}:`, error));

    console.log(`Started watching directory: ${dirPath}`);
  });

  // IPC stop watch
  ipcMain.on('stop-watching-directory', (event, dirPath) => {
    if (currentWatcher) {
      // chokidar using paths as key ids
      const watchedPaths = Object.keys(currentWatcher.getWatched());
      if (watchedPaths.includes(dirPath)) { 
        currentWatcher.close();
        currentWatcher = null;
        console.log(`Stopped watching directory: ${dirPath}`);
      }
    }
  });

  ipcMain.on('process-file', (event, pathOrUrl) => {
    if (!pathOrUrl) {
      event.sender.send('file-processed', { type: 'unknown', status: 'error', message: 'No valid item provided.' });
      return;
    }
    const isURL = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    const getProcessedPath = (inputPath) => {
      const parentDir = path.dirname(inputPath);
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const ext = path.extname(inputPath);
      const resultsDir = path.join(parentDir, 'Results_of_Detection');
      const processedName = baseName + '_faces' + ext;
      const processedPath = path.join(resultsDir, processedName);
      if (fs.existsSync(processedPath)) return processedPath;
      // Urls to desktop
      const desktop = app.getPath('desktop');
      const desktopProcessed = path.join(desktop, processedName);
      if (fs.existsSync(desktopProcessed)) return desktopProcessed;
      return null;
    };
    if (isURL) {
      const ext = path.extname(pathOrUrl.split('?')[0]).toLowerCase() || '.png';
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, 'electron_url_' + Date.now() + ext);
      downloadFile(pathOrUrl, tempFile, (err, localPath) => {
        if (err) {
          event.sender.send('file-processed', { type: 'url', path: pathOrUrl, status: 'error', message: 'Download failed: ' + err.message });
          return;
        }
        execFile('mainCV.exe', [localPath], (error, stdout, stderr) => {
          console.log('[DEBUG] mainCV.exe stdout:', stdout);
          // last non-empty as path - simple logic, which may fail easily, but yet works... Tho' fallback ahead
          const lines = stdout.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
          const processedPath = lines.length > 0 ? lines[lines.length - 1].trim() : '';
          setTimeout(() => {
            if (fs.existsSync(processedPath)) {
              console.log('[DEBUG] Processed file exists:', processedPath);
              event.sender.send('file-processed', { type: imageExtensions.includes(ext) ? 'image' : 'video', path: processedPath, status: 'success' });
            } else {
              console.log('[DEBUG] Processed file does NOT exist:', processedPath);
              event.sender.send('file-processed', { type: 'image', path: localPath, status: 'success', message: 'Face detection failed.' });
            }
            fs.unlink(localPath, () => {});
          }, 200);
        });
      });
      return;
    } else if (fs.existsSync(pathOrUrl)) {
      const ext = path.extname(pathOrUrl).toLowerCase();
      const stat = fs.statSync(pathOrUrl);
      if (stat.isDirectory()) {
        event.sender.send('file-processed', { type: 'directory', path: pathOrUrl, status: 'success' });
      } else if (imageExtensions.includes(ext) || videoExtensions.includes(ext)) {
        execFile('mainCV.exe', [pathOrUrl], (error, stdout, stderr) => {
          console.log('[DEBUG] mainCV.exe stdout:', stdout);
          //last non-empty
          const lines = stdout.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
          const processedPath = lines.length > 0 ? lines[lines.length - 1].trim() : '';
          setTimeout(() => {
            if (fs.existsSync(processedPath)) {
              console.log('[DEBUG] Processed file exists:', processedPath);
              event.sender.send('file-processed', { type: imageExtensions.includes(ext) ? 'image' : 'video', path: processedPath, status: 'success' });
            } else {
              console.log('[DEBUG] Processed file does NOT exist:', processedPath);
              event.sender.send('file-processed', { type: imageExtensions.includes(ext) ? 'image' : 'video', path: pathOrUrl, status: 'success', message: 'Face detection failed.' });
            }
          }, 200);
        });
      } else {
        event.sender.send('file-processed', { type: 'unknown', path: pathOrUrl, status: 'error', message: 'Unsupported file type.' });
      }
    } else {
      event.sender.send('file-processed', { type: 'unknown', path: pathOrUrl, status: 'error', message: 'File does not exist.' });
    }
  });

  //supposed to be opened with default app, but not sure whether working. Check later
  ipcMain.on('open-with-default-app', (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.on('show-open-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open File or Folder',
      properties: ['openFile'], // flag for files only, dirs can't be selected(Electron restriction)
      filters: [
        { name: 'Supported', extensions: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      if (fs.existsSync(selectedPath)) {
        //reserve check whether the ext is correct
        const ext = path.extname(selectedPath).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
        if (imageExtensions.includes(ext)) {
          event.sender.send('file-opened', { type: 'image', path: selectedPath, status: 'success' });
        } else if (videoExtensions.includes(ext)) {
          event.sender.send('file-opened', { type: 'video', path: selectedPath, status: 'success' });
        } else {
          // Fallback default app open
          shell.openPath(selectedPath)
            .then(() => event.sender.send('file-opened', { type: 'file', path: selectedPath, status: 'success' }))
            .catch(err => event.sender.send('file-opened', { type: 'file', path: selectedPath, status: 'error', message: err.message }));
        }
      } else {
        event.sender.send('file-opened', { type: 'file', path: selectedPath, status: 'error', message: 'Selected path does not exist.' });
      }
    }
  });

  ipcMain.on('create-folder', (event, baseDir, folderName) => {
    let targetDir = baseDir;
    if (!targetDir || !fs.existsSync(targetDir)) {
      targetDir = app.getPath('desktop');
    }
    const newFolderPath = path.join(targetDir, folderName);
    try {
      if (!fs.existsSync(newFolderPath)) {
        fs.mkdirSync(newFolderPath);
        event.sender.send('folder-created', { path: newFolderPath, status: 'success' });
      } else {
        event.sender.send('folder-created', { path: newFolderPath, status: 'exists', message: 'Folder already exists.' });
      }
    } catch (err) {
      event.sender.send('folder-created', { path: newFolderPath, status: 'error', message: err.message });
    }
  });

  ipcMain.handle('get-desktop-path', () => {
    return app.getPath('desktop');
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // close all watchers when app terminated
  if (currentWatcher) {
    currentWatcher.close();
    console.log('Closed all file system watchers on app quit.');
  }
  if (process.platform !== 'darwin') app.quit();
});
