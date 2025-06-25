// renderer.js - heavy-render file(basically web page) that manages UI, Dom, user interaction and IPC communication

console.log('Renderer: renderer.js loaded.');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer: DOMContentLoaded event fired.');

    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');
    const filePreviewBox = document.getElementById('file-preview-box');
    const dropMessage = filePreviewBox.querySelector('.drop-message');
    const previewContent = filePreviewBox.querySelector('.preview-content');
    const processBtn = document.getElementById('process-btn');


    let mainDirPath = null;
    let expandedDirs = {}; // empty intialization
    let currentDirWatcherPath = null; 

    // minimize/collapse buttons
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            window.electronAPI.minimizeApp();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.closeApp();
        });
    }

    // double click to prev
    function isSupportedPreviewFile(ext) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
        return imageExtensions.includes(ext) || videoExtensions.includes(ext);
    }

    // handler double click
    if (filePreviewBox) {
        filePreviewBox.addEventListener('dblclick', (event) => {
            // try last path read
            const lastOpened = previewContent.dataset.lastOpenedPath;
            if (!lastOpened) return;

            const ext = (window.electronAPI.path.extname(lastOpened) || '').toLowerCase();
            if (isSupportedPreviewFile(ext)) {
                // open again
                window.electronAPI.handleFileDrop(lastOpened);
            } else {
                //fallback default app
                window.electronAPI.openWithDefaultApp(lastOpened);
            }
        });
    }

    let originalFilePath = null;
    let pendingFileToProcess = null;
    let lastProcessedFilePath = null;

    function showPreview(filePath) {
        previewContent.innerHTML = '';
        dropMessage.style.display = 'none'; // reset drop message once dropped file
        const ext = (window.electronAPI.path.extname(filePath) || '').toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];

        if (imageExtensions.includes(ext)) {
            const img = document.createElement('img');
            img.src = filePath;
            img.alt = 'Preview Image';

            previewContent.appendChild(img);
        } else if (videoExtensions.includes(ext)) {
           
          // -vid controls here
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';

            const video = document.createElement('video');
            video.src = filePath;

            video.setAttribute('preload', 'metadata'); // metadata = duration

            const videoControls = document.createElement('div');
            videoControls.className = 'video-controls';

            // paly-pause
            const playPauseBtn = document.createElement('button');
            playPauseBtn.className = 'video-btn';
            const playIcon = document.createElement('img');
            playIcon.className = 'video-icon';
            playIcon.src = 'Resources/play-button.png'; 
            playIcon.alt = 'Play';
            playPauseBtn.appendChild(playIcon);

            // progress bar
            const progressBar = document.createElement('input');
            progressBar.type = 'range';
            progressBar.className = 'video-progress';
            progressBar.min = '0';
            progressBar.value = '0';
            progressBar.step = '0.01'; 

            // current time on progress bar
            const timeDisplay = document.createElement('div');
            timeDisplay.className = 'video-time';
            timeDisplay.textContent = '00:00 / 00:00';

            // volume
            const volumeBtn = document.createElement('button');
            volumeBtn.className = 'video-btn';
            const volumeIcon = document.createElement('img');
            volumeIcon.className = 'video-icon';
            volumeIcon.src = 'Resources/volume-level.png'; 
            volumeIcon.alt = 'Volume';
            volumeBtn.appendChild(volumeIcon);

            const volumeSlider = document.createElement('input');
            volumeSlider.type = 'range';
            volumeSlider.className = 'video-progress'; // Reusing progress bar style
            volumeSlider.min = '0';
            volumeSlider.max = '1';
            volumeSlider.step = '0.01';
            volumeSlider.value = '1'; // Default to full volume

            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'video-volume-container';
            volumeContainer.appendChild(volumeBtn);
            volumeContainer.appendChild(volumeSlider);


            // Append controls to their container
            videoControls.appendChild(playPauseBtn);
            videoControls.appendChild(progressBar);
            videoControls.appendChild(timeDisplay);
            videoControls.appendChild(volumeContainer);

            // Append video and controls to the main video container
            videoContainer.appendChild(video);
            videoContainer.appendChild(videoControls);

            // Append the full video player to the preview content
            previewContent.appendChild(videoContainer);

            // --- Add Event Listeners for Custom Controls ---
            let isSeeking = false; 

            video.addEventListener('timeupdate', () => {
                if (!isSeeking) {
                    progressBar.value = video.currentTime;
                    const currentMinutes = Math.floor(video.currentTime / 60);
                    const currentSeconds = Math.floor(video.currentTime % 60);
                    const durationMinutes = Math.floor(video.duration / 60);
                    const durationSeconds = Math.floor(video.duration % 60);

                    const formatTime = (time) => String(time).padStart(2, '0');
                    timeDisplay.textContent = `${formatTime(currentMinutes)}:${formatTime(currentSeconds)} / ${formatTime(durationMinutes)}:${formatTime(durationSeconds)}`;
                }
            });

            video.addEventListener('loadedmetadata', () => {
                progressBar.max = video.duration;
                const durationMinutes = Math.floor(video.duration / 60);
                const durationSeconds = Math.floor(video.duration % 60);
                const formatTime = (time) => String(time).padStart(2, '0');
                timeDisplay.textContent = `00:00 / ${formatTime(durationMinutes)}:${formatTime(durationSeconds)}`;
            });

            playPauseBtn.addEventListener('click', () => {
                if (video.paused || video.ended) {
                    video.play();
                    playIcon.src = 'Resources/video-pause-button.png'; 
                } else {
                    video.pause();
                    playIcon.src = 'Resources/play-button.png'; 
                    playIcon.alt = 'Play';
                }
            });

            progressBar.addEventListener('mousedown', () => { isSeeking = true; });
            progressBar.addEventListener('mouseup', () => { isSeeking = false; });

            progressBar.addEventListener('input', () => {
                video.currentTime = progressBar.value;
                const currentMinutes = Math.floor(progressBar.value / 60);
                const currentSeconds = Math.floor(progressBar.value % 60);
                const durationMinutes = Math.floor(video.duration / 60);
                const durationSeconds = Math.floor(video.duration % 60);
                const formatTime = (time) => String(time).padStart(2, '0');
                timeDisplay.textContent = `${formatTime(currentMinutes)}:${formatTime(currentSeconds)} / ${formatTime(durationMinutes)}:${formatTime(durationSeconds)}`;
            });

            volumeSlider.addEventListener('input', () => {
                video.volume = volumeSlider.value;
                if (video.volume === 0) {
                    volumeIcon.src = 'Resources/music.png'; 
                } else if (video.volume < 0.5) {
                    volumeIcon.src = 'Resources/low-volume.png'; 
                } else {
                    volumeIcon.src = 'Resources/volume-level.png'; 
                }
            });


            volumeBtn.addEventListener('click', () => {
                if (video.volume > 0) {
                    video.dataset.lastVolume = video.volume; // Store current volume
                    video.volume = 0;
                    volumeSlider.value = 0;
                    volumeIcon.src = 'Resources/music.png';
                } else {
                    video.volume = video.dataset.lastVolume || 1; // Restore or set to full
                    volumeSlider.value = video.volume;
                    if (video.volume < 0.5 && video.volume > 0) {
                        volumeIcon.src = 'Resources/low-volume.png';
                    } else {
                        volumeIcon.src = 'Resources/volume-level.png';
                    }
                }
            });


            video.addEventListener('ended', () => {
                playIcon.src = 'Resources/play-button.png'; // Reset to play icon
                playIcon.alt = 'Play';
                progressBar.value = 0; // Reset progress bar
                video.currentTime = 0; // Reset video to start
            });
            // custom vid end

        } else {
            previewContent.textContent = 'Unsupported file type.';
        }
        previewContent.dataset.lastOpenedPath = filePath;
    }

    // Handle file drop/select: set original, pending, and preview
    function handleFileDropOrSelect(filePath) {
        if (window.electronAPI.fs && window.electronAPI.fs.existsSync && window.electronAPI.fs.statSync) {
            try {
                const stat = window.electronAPI.fs.statSync(filePath);
                if (stat.isDirectory()) {

                    if (mainDirPath !== filePath) {
                        mainDirPath = filePath;
                        setCurrentWatchedDir(filePath); 
                        expandedDirs = {}; 

                        if (currentDirWatcherPath && window.electronAPI.stopWatchingDirectory) {
                            window.electronAPI.stopWatchingDirectory(currentDirWatcherPath);
                            console.log(`[DEBUG] Stopped watching: ${currentDirWatcherPath}`);
                        }
                        // Start watching the new directory
                        if (window.electronAPI.startWatchingDirectory) {
                            window.electronAPI.startWatchingDirectory(mainDirPath);
                            currentDirWatcherPath = mainDirPath;
                            console.log(`[DEBUG] Started watching: ${mainDirPath}`);
                        } else {
                            console.warn('Electron API "startWatchingDirectory" not available. Real-time updates disabled.');
                        }
                    }
                    renderSideBox(mainDirPath, expandedDirs);
                    previewContent.innerHTML = '<div style="color:#bbb;font-size:1.5em;margin-top:2em;">Directory opened: ' + filePath + '</div>';
                    dropMessage.style.display = 'none';
                    return;
                }
            } catch (e) { /* ignore */ }
        }
        // Otherwise, treat as file
        originalFilePath = filePath;
        pendingFileToProcess = filePath;
        lastProcessedFilePath = null;
        showPreview(filePath);
    }

    // Listen for file preview (original)
    window.electronAPI.onFileOpened((data) => {
        if (data.status === 'success' && (data.type === 'image' || data.type === 'video')) {
            handleFileDropOrSelect(data.path);
            // If a file is opened (not a directory), set currentWatchedDir to the file's parent directory
            if (window.electronAPI.path && window.electronAPI.path.dirname) {
                setCurrentWatchedDir(window.electronAPI.path.dirname(data.path));
            } else if (window.electronAPI.getDesktopPath) {
                window.electronAPI.getDesktopPath().then((desktopPath) => {
                    setCurrentWatchedDir(desktopPath);
                });
            }
        } else if (data.status === 'success' && data.type === 'directory') {
            mainDirPath = data.path;
            setCurrentWatchedDir(data.path); // switch currentdir to the "new folder"
            expandedDirs = {};
            renderSideBox(mainDirPath, expandedDirs);
            previewContent.innerHTML = '<div style="color:#bbb;font-size:1.5em;margin-top:2em;">Directory opened: ' + data.path + '</div>';
            dropMessage.style.display = 'none';
            if (data.message) {
                dropMessage.style.display = 'block';
                dropMessage.textContent = data.message;
            }
            // double down with API watch once a dir opened
            if (currentDirWatcherPath && window.electronAPI.stopWatchingDirectory) {
                window.electronAPI.stopWatchingDirectory(currentDirWatcherPath);
                console.log(`[DEBUG] Stopped watching: ${currentDirWatcherPath}`);
            }
            if (window.electronAPI.startWatchingDirectory) {
                window.electronAPI.startWatchingDirectory(mainDirPath);
                currentDirWatcherPath = mainDirPath;
                console.log(`[DEBUG] Started watching: ${mainDirPath}`);
            } else {
                console.warn('Electron API "startWatchingDirectory" not available. Real-time updates disabled.');
            }
        } else {
            previewContent.textContent = data.message || 'Failed to open file.';
            dropMessage.style.display = 'block';
        }
    });

    // IPC listener for all in-dir changes(delete, create, rename files/folders etc)
    window.electronAPI.onDirectoryChanged((changedPath) => {
        // if change done, rerender elem sidebar
        if (mainDirPath && changedPath === mainDirPath) {
            console.log(`[DEBUG] Directory changed: ${changedPath}, re-rendering sidebar.`);
            renderSideBox(mainDirPath, expandedDirs);
        }
    });


    // Overlay elems
    let progressOverlay = null; // store overlayWrapper
    let progressBarFill = null;
    let progressTitle = null;
    let progressInterval = null;
    let progressDotCount = 1;
    let progressTimeout = null;

    function createProgressOverlay() {
        if (progressOverlay) progressOverlay.remove();

        // bounding rect mechanic
        const filePreviewBoxRect = filePreviewBox.getBoundingClientRect();
        console.log(`[DEBUG] filePreviewBoxRect: Left=${filePreviewBoxRect.left}, Top=${filePreviewBoxRect.top}, Width=${filePreviewBoxRect.width}, Height=${filePreviewBoxRect.height}`);

        const overlayWrapper = document.createElement('div');
        overlayWrapper.className = 'progress-overlay-wrapper'; 

        // The semi-transparent box that overlays the preview box
        const transparentBox = document.createElement('div');
        transparentBox.className = 'progress-transparent-box'; 
        // Match the position and size of filePreviewBox dynamically(Tthat's why didn't move to css)
        transparentBox.style.left = filePreviewBoxRect.left + 'px';
        transparentBox.style.top = filePreviewBoxRect.top + 'px';
        transparentBox.style.width = filePreviewBoxRect.width + 'px';
        transparentBox.style.height = filePreviewBoxRect.height + 'px';
        overlayWrapper.appendChild(transparentBox);
        console.log(`[DEBUG] TransparentBox Pos: Left=${transparentBox.style.left}, Top=${transparentBox.style.top}, Width=${transparentBox.style.width}, Height=${transparentBox.style.height}`);


        const contentContainer = document.createElement('div');
        contentContainer.className = 'progress-content-container'; 
        // Match position and size dynamically
        contentContainer.style.left = filePreviewBoxRect.left + 'px';
        contentContainer.style.top = filePreviewBoxRect.top + 'px';
        contentContainer.style.width = filePreviewBoxRect.width + 'px';
        contentContainer.style.height = filePreviewBoxRect.height + 'px';
        overlayWrapper.appendChild(contentContainer);
        console.log(`[DEBUG] ContentContainer Pos: Left=${contentContainer.style.left}, Top=${contentContainer.style.top}, Width=${contentContainer.style.width}, Height=${contentContainer.style.height}`);



        progressTitle = document.createElement('div');
        progressTitle.className = 'progress-title'; // Marks for how I moved initially dynamic styling to static CSS for better preprocessing
        progressTitle.textContent = 'Processing.';
        contentContainer.appendChild(progressTitle);


        const barContainer = document.createElement('div');
        barContainer.className = 'progress-bar-container'; 
        contentContainer.appendChild(barContainer);

        // Progress bar fill
        progressBarFill = document.createElement('div');
        progressBarFill.className = 'progress-bar-fill'; 
        progressBarFill.style.width = '0px'; // Dynamic, keep in JS
        barContainer.appendChild(progressBarFill);

        document.body.appendChild(overlayWrapper);
        progressOverlay = overlayWrapper; // Store the main wrapper for removal
    }

    function showProgressOverlay() {
        createProgressOverlay();
        let progress = 0;
        let maxWidth = 546; 
        progressBarFill.style.width = '0px';
        progressDotCount = 1;
        progressTitle.textContent = 'Processing.';
        // Progress bar animation(just simulate as no real trackers included in the executable)
        progressInterval = setInterval(() => {
            progress += 2; // 2% every 100ms (simulate ~5s total)
            if (progress > 100) progress = 100;
            progressBarFill.style.width = (progress * maxWidth / 100) + 'px';
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, 100);
        //Dots
        progressTimeout = setInterval(() => {
            progressDotCount = (progressDotCount % 3) + 1;
            progressTitle.textContent = 'Processing' + '.'.repeat(progressDotCount);
        }, 1000);
    }

    function hideProgressOverlay() {
        if (progressOverlay) progressOverlay.remove();
        progressOverlay = null;
        progressBarFill = null;
        progressTitle = null;
        if (progressInterval) clearInterval(progressInterval);
        if (progressTimeout) clearInterval(progressTimeout);
    }

    // Overlay show/hide logic
    if (processBtn) {
        processBtn.addEventListener('click', () => {
            if (pendingFileToProcess) {
                showProgressOverlay();
                window.electronAPI.processFile(pendingFileToProcess); // Process on demand
            }
        });
    }


    window.electronAPI.onFileProcessed(async (data) => {
        console.log('[DEBUG] Received processed file:', data);
        hideProgressOverlay();

        if (data.status === 'success' && (data.type === 'image' || data.type === 'video')) {
            lastProcessedFilePath = data.path;
            showPreview(data.path); // Show processed result in preview
        } 
        else if (data.status === 'success' && data.type === 'directory') {
            mainDirPath = data.path;
            setCurrentWatchedDir(data.path); // switch currentdir to the "new folder"
            expandedDirs = {};
            renderSideBox(mainDirPath, expandedDirs);
            previewContent.innerHTML = '<div style="color:#bbb;font-size:1.5em;margin-top:2em;">Directory opened: ' + data.path + '</div>';
            dropMessage.style.display = 'none';
            if (data.message) {
                dropMessage.style.display = 'block';
                dropMessage.textContent = data.message;
            }
        }
    });

    // --- File Drop Zone Logic ---
    if (filePreviewBox) {
        filePreviewBox.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
            filePreviewBox.classList.add('drag-over');
        });

        filePreviewBox.addEventListener('dragleave', (event) => {
            event.preventDefault();
            event.stopPropagation();
            filePreviewBox.classList.remove('drag-over');
        });

        filePreviewBox.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            filePreviewBox.classList.remove('drag-over');

            const dataTransfer = event.dataTransfer;
            let droppedItem = null;

            // Determine URL or local file
            const isValidURL = (text) => {
                try {
                    new URL(text);
                    return true;
                } catch (_) {
                    return false;
                }
            };

            if (dataTransfer.files.length > 0) {
                if (dataTransfer.files[0].path) {
                    droppedItem = dataTransfer.files[0].path;
                } else {
                    const uriList = dataTransfer.getData('text/uri-list');
                    const textPlain = dataTransfer.getData('text/plain');
                    if (uriList && isValidURL(uriList.trim())) {
                        droppedItem = uriList.trim();
                    } else if (textPlain && isValidURL(textPlain.trim())) {
                        droppedItem = textPlain.trim();
                    } else {
                        previewContent.textContent = `Cannot access file path for: ${dataTransfer.files[0].name || 'Unknown file'} (try dragging from Windows Explorer)`;
                        dropMessage.style.display = 'block';
                        return;
                    }
                }
            } else if (dataTransfer.getData('text/uri-list')) {
                const uriList = dataTransfer.getData('text/uri-list').trim();
                if (isValidURL(uriList)) {
                    droppedItem = uriList;
                }
            } else if (dataTransfer.getData('text/plain')) {
                const textData = dataTransfer.getData('text/plain').trim();
                if (isValidURL(textData)) {
                    droppedItem = textData;
                }
            }

            if (droppedItem) {
                window.electronAPI.handleFileDrop(droppedItem); // Only preview
            } else {
                dropMessage.style.display = 'block';
                previewContent.textContent = 'No valid file, directory, or URL detected.';
            }
        });
    }

    // --- File Title and Context Menu Logic ---
    const fileTitle = document.getElementById('file-title');
    const fileMenu = document.getElementById('file-context-menu');

    // Track current watched dir for "New Folder"
    window.currentWatchedDir = null; // For "New Folder" creation

    // update currentWatchedDir on directory open
    function setCurrentWatchedDir(dirPath) {
        window.currentWatchedDir = dirPath;
    }

    // Hide menu on click outside
    function hideFileMenu(e) {
        if (fileMenu.style.display === 'none') return;
        if (!fileMenu.contains(e.target) && e.target !== fileTitle) {
            fileMenu.style.display = 'none';
            document.removeEventListener('mousedown', hideFileMenu);
        }
    }

    if (fileTitle && fileMenu) {
        fileTitle.addEventListener('click', (e) => {
            // Toggle menu: if already open, close it
            if (fileMenu.style.display === 'block') {
                fileMenu.style.display = 'none';
                document.removeEventListener('mousedown', hideFileMenu);
                return;
            }
            fileMenu.innerHTML = `
                <button class="file-context-menu-option" id="file-menu-open">Open...</button>
                <div class="file-context-menu-divider"></div>
                <button class="file-context-menu-option" id="file-menu-new-folder">New Folder</button>
            `;
            fileMenu.style.display = 'block';
            setTimeout(() => document.addEventListener('mousedown', hideFileMenu), 0);

            // Open... handler
            document.getElementById('file-menu-open').onclick = async () => {
                fileMenu.style.display = 'none';
                if (window.electronAPI.openDialog) {
                    window.electronAPI.openDialog();
                } else {
                    alert('Open dialog not implemented in preload/main.');
                }
            };

            // New Folder handler
            document.getElementById('file-menu-new-folder').onclick = async () => {
                fileMenu.style.display = 'none';
                // Use the current watched dir, fallback to desktop
                let baseDir = await window.electronAPI.getDesktopPath();

                if (!baseDir) {
                    alert('Cannot determine folder to create new directory.');
                    return;
                }
                showFolderNameModal(baseDir);
            };
        });
    }

    // --- Custom modal for folder name input ---
    function showFolderNameModal(baseDir) {
        // Remove any existing modal
        let oldModal = document.getElementById('new-folder-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'new-folder-modal'; // keep id
        // Moved to css

        const box = document.createElement('div');
        box.classList.add('modal-box'); 
        // Css
        modal.appendChild(box);

        const label = document.createElement('label');
        label.textContent = 'New Folder Name:';
        // Css
        box.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = 'New Folder';
        // Css
        box.appendChild(input);

        const btnRow = document.createElement('div');
        btnRow.classList.add('button-row');
        // Css
        box.appendChild(btnRow);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'Create';
        okBtn.classList.add('create-btn');
        //Css

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.classList.add('cancel-btn'); 
        //Css

        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        box.appendChild(btnRow);

        modal.appendChild(box);
        document.body.appendChild(modal);

        input.focus();

        okBtn.onclick = () => {
            const folderName = input.value.trim();
            if (folderName) {
                if (window.electronAPI.createFolder) {
                    window.electronAPI.createFolder(baseDir, folderName);
                }
                modal.remove();
            }
        };
        cancelBtn.onclick = () => {
            modal.remove();
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') okBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        });
    }

    // ---Is stat dir?---
    function isDirectoryStat(stat) {
        if (!stat) return false;
        if (typeof stat.isDirectory === 'function') return stat.isDirectory();
        if (typeof stat.mode === 'number') return (stat.mode & 0o170000) === 0o040000;
        return false;
    }

    // just name, no path
    function getDirNameOnly(path) {
        if (!path) return '';
        const parts = path.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || path;
    }

    // ---Dir sidebar render---
    function renderSideBox(dirPath, expandedDirs = {}) {
        const sidebar = document.getElementById('side-box');
        const dirnameElem = document.getElementById('side-box-dirname');
        const listElem = document.getElementById('side-box-list');
        if (!sidebar || !dirnameElem || !listElem) return;

        dirnameElem.textContent = getDirNameOnly(dirPath);
        dirnameElem.style.display = 'block'; 
        listElem.innerHTML = '';
        listElem.className = 'side-box-list side-box-list-root'; 
        renderDirEntriesFlat(dirPath, listElem, expandedDirs, 0);
    }

    // Always show arrows for entries at depth >= 1(inside expanded first-level subdirs)
    function renderDirEntriesFlat(dirPath, containerElem, expandedDirs, depth) {
        if (window.electronAPI && window.electronAPI.fs && window.electronAPI.fs.readdirSync) {
            try {
                const files = window.electronAPI.fs.readdirSync(dirPath);
                files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                files.forEach(file => {
                    if (!file) return;
                    const filePath = window.electronAPI.path.join(dirPath, file);
                    let stat;
                    try { stat = window.electronAPI.fs.statSync(filePath); } catch { return; }
                    const isDir = isDirectoryStat(stat);
                    const entry = document.createElement('div');
                    entry.className = 'side-box-list-entry' + (isDir ? '' : ' file-entry');
                    entry.style.marginLeft = (depth * 24) + 'px'; 
                    if (depth >= 1) {
                        entry.setAttribute('data-depth', depth);
                    } else {
                        entry.removeAttribute('data-depth');
                    }

                    let arrow = null;
                    if (depth >= 1) {
                        console.log('Rendering arrow for', file, 'at depth', depth);
                        arrow = document.createElement('img');
                        arrow.className = 'arrow-emblem';
                        arrow.src = 'Resources/arrow.png';
                        arrow.alt = '>';
                        entry.appendChild(arrow); 
                    }

                    // Icon handle
                    const icon = document.createElement('img');
                    icon.className = isDir ? 'folder-emblem' : 'file-emblem';
                    if (isDir) {
                        icon.src = expandedDirs[filePath] ? 'Resources/folder_opened.png' : 'Resources/folder_cllosed.png'; // Fixed typo (still in JS for dynamic change)
                        icon.alt = 'Folder';
                    } else {
                        icon.src = 'Resources/new-document.png';
                        icon.alt = 'File';
                    }
                    entry.appendChild(icon);

                    // Name
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = file;
                    entry.appendChild(nameSpan);

                    //Precation for ico+arrow position
                    if (arrow && icon) {
                        entry.insertBefore(arrow, icon);
                    }

                    if (isDir) {
                        entry.onclick = (e) => {
                            e.stopPropagation();
                            expandedDirs[filePath] = !expandedDirs[filePath];
                            renderSideBox(dirPath, expandedDirs);
                        };
                    } else {
                        entry.onclick = (e) => {
                            e.stopPropagation();
                            handleFileDropOrSelect(filePath);
                        };
                    }
                    containerElem.appendChild(entry);
                    if (isDir && expandedDirs[filePath]) {
                        renderDirEntriesFlat(filePath, containerElem, expandedDirs, depth + 1);
                    }
                });
                if (files.length === 0 && depth === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.classList.add('empty-folder-message'); // Apply class
                    emptyMsg.textContent = '(Empty folder)';
                    containerElem.appendChild(emptyMsg);
                }
            } catch (e) {
                //Inline style, but for one-off err msg, so keep it in dynamic
                containerElem.innerHTML = `<div style=\"color:red;\">Error reading directory: ${e.message}</div>`;
            }
        } else {
            containerElem.innerHTML = '<div style=\"color:red;\">Filesystem API not available.</div>';
        }
    }

    // Listen for folder creation(used as a fallback apart the main process)
window.electronAPI.onFolderCreated((data) => {
    if (data.status === 'success') {
        console.log(`Folder created: ${data.path}`);
        
        mainDirPath = data.path; 
        setCurrentWatchedDir(data.path); 
        expandedDirs = {}; 
        renderSideBox(mainDirPath, expandedDirs); 

        // Update the preview box to indicate the new folder is opened
        previewContent.innerHTML = '<div style="color:#bbb;font-size:1.5em;margin-top:2em;">New folder created and opened: ' + data.path + '</div>';
        dropMessage.style.display = 'none'; // Ensure drop message is hidden

        // Ensure the directory watcher starts for the new folder
        if (currentDirWatcherPath && window.electronAPI.stopWatchingDirectory) {
            window.electronAPI.stopWatchingDirectory(currentDirWatcherPath);
            console.log(`[DEBUG] Stopped watching old directory: ${currentDirWatcherPath}`);
        }
        if (window.electronAPI.startWatchingDirectory) {
            window.electronAPI.startWatchingDirectory(mainDirPath);
            currentDirWatcherPath = mainDirPath;
            console.log(`[DEBUG] Started watching new directory: ${mainDirPath}`);
        } else {
            console.warn('Electron API "startWatchingDirectory" not available. Real-time updates disabled.');
        }

    } else if (data.status === 'exists') {
        console.log(`Folder already exists: ${data.path}`);
        // Replaced alert with a message in previewContent - best-pratice thingy
        previewContent.innerHTML = '<p style="color:red;">Failed to create folder: A folder with that name already exists on the Desktop.</p>';
        dropMessage.style.display = 'block';
    } else if (data.status === 'error') {
        previewContent.innerHTML = '<p style="color:red;">Failed to create folder: ' + (data.message || 'Unknown error') + '</p>';
        dropMessage.style.display = 'block';
    }
    });
});
