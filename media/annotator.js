/* global window, document, acquireVsCodeApi, ImageAnnotatorCanvas */
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const cloneAnnotations = ImageAnnotatorCanvas.cloneAnnotations;

  function cloneState(state) {
    return {
      annotations: cloneAnnotations(state.annotations),
      reviewed: state.reviewed,
      selectedId: state.selectedId
    };
  }

  class AnnotatorApp {
    constructor() {
      this.image = document.getElementById('image');
      this.imageDisplay = document.getElementById('imageDisplay');
      this.imageDisplayContext = this.imageDisplay.getContext('2d', { willReadFrequently: true });
      this.canvas = document.getElementById('overlay');
      this.stage = document.getElementById('stage');
      this.imageList = document.getElementById('imageList');
      this.annotationList = document.getElementById('annotationList');
      this.labelSelect = document.getElementById('labelSelect');
      this.labelPopup = document.getElementById('labelPopup');
      this.newLabelInput = document.getElementById('newLabelInput');
      this.newHotkeyInput = document.getElementById('newHotkeyInput');
      this.addLabelButton = document.getElementById('addLabelButton');
      this.labelManageList = document.getElementById('labelManageList');
      this.reviewedInput = document.getElementById('reviewedInput');
      this.betaInput = document.getElementById('betaInput');
      this.alphaInput = document.getElementById('alphaInput');
      this.gammaInput = document.getElementById('gammaInput');
      this.claheInput = document.getElementById('claheInput');
      this.betaValue = document.getElementById('betaValue');
      this.alphaValue = document.getElementById('alphaValue');
      this.gammaValue = document.getElementById('gammaValue');
      this.resetViewButton = document.getElementById('resetViewButton');
      this.saveStatus = document.getElementById('saveStatus');
      this.openImageButton = document.getElementById('openImageButton');
      this.openFolderButton = document.getElementById('openFolderButton');
      this.counter = document.getElementById('counter');
      this.prevButton = document.getElementById('prevButton');
      this.nextButton = document.getElementById('nextButton');
      this.sidePrevButton = document.getElementById('sidePrevButton');
      this.sideNextButton = document.getElementById('sideNextButton');
      this.fitButton = document.getElementById('fitButton');
      this.zoomOutButton = document.getElementById('zoomOutButton');
      this.zoomInButton = document.getElementById('zoomInButton');
      this.saveButton = document.getElementById('saveButton');
      this.deleteButton = document.getElementById('deleteButton');

      this.mode = 'single';
      this.images = [];
      this.labels = [];
      this.currentIndex = 0;
      this.currentData = this.emptyAnnotation('');
      this.currentLabel = 'left_gripper';
      this.selectedId = undefined;
      this.zoom = 'fit';
      this.beta = 0;
      this.alpha = 1;
      this.gamma = 1;
      this.clahe = false;
      this.pendingEnhancementFrame = 0;
      this.dirty = false;
      this.loadedHadSavedData = false;
      this.imageButtons = new Map();
      this.undoStack = [];
      this.redoStack = [];

      this.canvasController = new ImageAnnotatorCanvas.CanvasController({
        canvas: this.canvas,
        image: this.image,
        onChange: () => this.markDirty(),
        onSelect: (id) => this.handleSelection(id),
        onCreateBox: (bbox, beforeSnapshot) => this.openLabelPopup(bbox, beforeSnapshot),
        getCurrentLabel: () => this.currentLabel,
        getStateSnapshot: () => this.getStateSnapshot(),
        pushHistory: (before, after) => this.pushHistory(before, after)
      });

      this.wireEvents();
      vscode.postMessage({ type: 'ready' });
    }

    wireEvents() {
      window.addEventListener('message', (event) => this.handleExtensionMessage(event.data));
      this.image.addEventListener('load', () => this.handleImageLoad());
      this.openImageButton.addEventListener('click', () => this.openImageDialog());
      this.openFolderButton.addEventListener('click', () => this.openFolderDialog());
      this.prevButton.addEventListener('click', () => this.switchByOffset(-1));
      this.nextButton.addEventListener('click', () => this.switchByOffset(1));
      this.sidePrevButton.addEventListener('click', () => this.switchByOffset(-1));
      this.sideNextButton.addEventListener('click', () => this.switchByOffset(1));
      this.fitButton.addEventListener('click', () => this.setFit());
      this.zoomOutButton.addEventListener('click', () => this.zoomBy(0.8));
      this.zoomInButton.addEventListener('click', () => this.zoomBy(1.25));
      this.saveButton.addEventListener('click', () => this.saveCurrent());
      this.deleteButton.addEventListener('click', () => this.deleteSelected());
      this.labelSelect.addEventListener('change', () => this.changeLabel(this.labelSelect.value));
      this.addLabelButton.addEventListener('click', () => this.addLabel());
      this.newLabelInput.addEventListener('keydown', (event) => this.handleLabelInputKeyDown(event));
      this.newHotkeyInput.addEventListener('keydown', (event) => this.handleLabelInputKeyDown(event));
      this.reviewedInput.addEventListener('change', () => this.setReviewed(this.reviewedInput.checked));
      this.betaInput.addEventListener('input', () => this.updateImageEnhancement());
      this.alphaInput.addEventListener('input', () => this.updateImageEnhancement());
      this.gammaInput.addEventListener('input', () => this.updateImageEnhancement());
      this.claheInput.addEventListener('change', () => this.updateImageEnhancement());
      this.resetViewButton.addEventListener('click', () => this.resetViewAdjustments());
      window.addEventListener('keydown', (event) => this.handleKeyDown(event));
      window.addEventListener('resize', () => this.scheduleDisplayRender());
      document.addEventListener('mousedown', (event) => this.handleDocumentMouseDown(event));
    }

    handleExtensionMessage(message) {
      if (!message || typeof message.type !== 'string') {
        return;
      }

      if (message.type === 'loadSession') {
        this.mode = message.mode;
        this.currentIndex = message.currentIndex;
        this.images = message.images;
        this.labels = message.labels;
        this.currentLabel = this.labels[0]?.name ?? this.currentLabel;
        this.renderLabels();
        this.renderLabelManager();
        this.renderImages();
        this.updateCounter();
        return;
      }

      if (message.type === 'loadImage') {
        this.currentIndex = message.imageIndex;
        this.labels = message.labels;
        this.images = message.imageStatuses;
        this.currentData = message.annotationData;
        this.selectedId = undefined;
        this.undoStack = [];
        this.redoStack = [];
        this.dirty = false;
        this.loadedHadSavedData = message.annotationData.annotations.length > 0 || message.annotationData.reviewed === true;
        this.renderLabels();
        this.renderLabelManager();
        this.renderImages();
        this.loadImageUri(message.imageUri);
        this.setStatus('Loaded');
        return;
      }

      if (message.type === 'saveState') {
        if (message.ok) {
          this.dirty = false;
          this.loadedHadSavedData = this.currentData.annotations.length > 0 || this.currentData.reviewed;
        }
        if (message.imageStatuses) {
          this.images = message.imageStatuses;
          this.renderImages();
        }
        this.setStatus(message.message, message.ok ? 'ok' : 'error');
        return;
      }

      if (message.type === 'labelsUpdated') {
        if (message.ok) {
          this.labels = message.labels;
          if (!this.labels.some((label) => label.name === this.currentLabel)) {
            this.currentLabel = this.labels[0]?.name ?? '';
          }
        } else if (message.labels) {
          this.labels = message.labels;
        }
        this.renderLabels();
        this.renderLabelManager();
        this.setStatus(message.message, message.ok ? 'ok' : 'error');
        return;
      }

      if (message.type === 'error') {
        this.setStatus(message.message, 'error');
      }
    }

    loadImageUri(imageUri) {
      this.image.removeAttribute('src');
      this.clearDisplayCanvas();
      this.applyZoom();
      this.image.src = imageUri;
    }

    handleImageLoad() {
      if (!this.currentData.width) {
        this.currentData.width = this.image.naturalWidth;
      }
      if (!this.currentData.height) {
        this.currentData.height = this.image.naturalHeight;
      }
      this.canvasController.setImageSize(this.image.naturalWidth, this.image.naturalHeight);
      this.canvasController.setAnnotations(this.currentData.annotations);
      this.reviewedInput.checked = this.currentData.reviewed;
      this.renderAnnotations();
      this.updateCounter();
      this.applyZoom();
      requestAnimationFrame(() => {
        this.renderDisplayImage();
        this.canvasController.syncCanvas();
      });
    }

    emptyAnnotation(image) {
      return {
        image,
        width: 0,
        height: 0,
        reviewed: false,
        annotations: []
      };
    }

    getStateSnapshot() {
      this.syncFromCanvas();
      return cloneState({
        annotations: this.currentData.annotations,
        reviewed: this.currentData.reviewed,
        selectedId: this.selectedId
      });
    }

    applyStateSnapshot(snapshot) {
      this.currentData.annotations = cloneAnnotations(snapshot.annotations);
      this.currentData.reviewed = snapshot.reviewed;
      this.reviewedInput.checked = snapshot.reviewed;
      this.selectedId = snapshot.selectedId;
      this.canvasController.replaceAnnotations(this.currentData.annotations, this.selectedId);
      this.renderAnnotations();
      this.renderLabels();
      this.markDirty();
    }

    pushHistory(before, after) {
      if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) {
        return;
      }
      this.undoStack.push({ before, after });
      this.redoStack = [];
    }

    undo() {
      const entry = this.undoStack.pop();
      if (!entry) {
        return;
      }
      this.redoStack.push(entry);
      this.applyStateSnapshot(entry.before);
    }

    redo() {
      const entry = this.redoStack.pop();
      if (!entry) {
        return;
      }
      this.undoStack.push(entry);
      this.applyStateSnapshot(entry.after);
    }

    syncFromCanvas() {
      this.currentData.annotations = this.canvasController.getAnnotations();
      this.currentData.reviewed = this.reviewedInput.checked;
      this.currentData.width = this.image.naturalWidth || this.currentData.width;
      this.currentData.height = this.image.naturalHeight || this.currentData.height;
    }

    saveCurrent() {
      this.syncFromCanvas();
      if (!this.hasSavableData()) {
        this.setStatus('No annotations to save');
        return;
      }
      vscode.postMessage({
        type: 'saveAnnotation',
        imageIndex: this.currentIndex,
        annotationData: this.currentData
      });
      this.setStatus('Saving...');
    }

    saveAndLoad(targetIndex) {
      if (targetIndex < 0 || targetIndex >= this.images.length || targetIndex === this.currentIndex) {
        return;
      }
      this.closeLabelPopup();
      this.syncFromCanvas();
      if (!this.hasSavableData()) {
        vscode.postMessage({
          type: 'requestImage',
          imageIndex: targetIndex
        });
        this.setStatus('Skipped empty image');
        return;
      }
      vscode.postMessage({
        type: 'saveAndLoadImage',
        currentIndex: this.currentIndex,
        targetIndex,
        annotationData: this.currentData
      });
      this.setStatus('Saving...');
    }

    openImageDialog() {
      this.closeLabelPopup();
      this.syncFromCanvas();
      if (this.dirty && this.hasSavableData()) {
        vscode.postMessage({
          type: 'saveAndOpenImageDialog',
          currentIndex: this.currentIndex,
          annotationData: this.currentData
        });
        this.setStatus('Saving...');
        return;
      }
      vscode.postMessage({ type: 'openImageDialog' });
      this.setStatus('Opening image...');
    }

    openFolderDialog() {
      this.closeLabelPopup();
      this.syncFromCanvas();
      if (this.dirty && this.hasSavableData()) {
        vscode.postMessage({
          type: 'saveAndOpenFolderDialog',
          currentIndex: this.currentIndex,
          annotationData: this.currentData
        });
        this.setStatus('Saving...');
        return;
      }
      vscode.postMessage({ type: 'openFolderDialog' });
      this.setStatus('Opening folder...');
    }

    hasSavableData() {
      return this.currentData.annotations.length > 0 || this.currentData.reviewed || this.loadedHadSavedData;
    }

    switchByOffset(offset) {
      this.saveAndLoad(this.currentIndex + offset);
    }

    deleteSelected() {
      this.closeLabelPopup();
      if (this.canvasController.deleteSelected()) {
        this.renderAnnotations();
        this.renderLabels();
      }
    }

    openLabelPopup(bbox, beforeSnapshot) {
      this.labelPopup.replaceChildren();
      const title = document.createElement('div');
      title.className = 'label-popup-title';
      title.textContent = 'Select label';
      this.labelPopup.append(title);

      for (const label of this.labels) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'label-popup-item';
        button.textContent = label.hotkey ? `${label.hotkey}  ${label.name}` : label.name;
        button.addEventListener('click', () => {
          this.currentLabel = label.name;
          this.closeLabelPopup();
          this.canvasController.addAnnotation(label.name, bbox, beforeSnapshot);
          this.syncFromCanvas();
          this.renderLabels();
          this.renderAnnotations();
        });
        this.labelPopup.append(button);
      }

      const displayBox = this.canvasController.imageBoxToDisplayBox(bbox);
      const imageRect = this.image.getBoundingClientRect();
      const left = Math.min(Math.max(displayBox.x2 + 8, 8), Math.max(8, imageRect.width - 188));
      const top = Math.min(Math.max(displayBox.y1, 8), Math.max(8, imageRect.height - 128));
      this.labelPopup.style.left = `${left}px`;
      this.labelPopup.style.top = `${top}px`;
      this.labelPopup.hidden = false;
      this.labelPopup.querySelector('button')?.focus();
    }

    closeLabelPopup() {
      this.labelPopup.hidden = true;
      this.labelPopup.replaceChildren();
    }

    changeLabel(label) {
      if (!label) {
        return;
      }
      this.currentLabel = label;
      if (this.selectedId) {
        this.canvasController.changeSelectedLabel(label);
        this.syncFromCanvas();
        this.renderAnnotations();
      }
      this.renderLabels();
    }

    addLabel() {
      const name = this.newLabelInput.value.trim();
      const hotkey = this.newHotkeyInput.value.trim();
      if (!name) {
        this.setStatus('Label name is required', 'error');
        this.newLabelInput.focus();
        return;
      }
      if (this.labels.some((label) => label.name === name)) {
        this.setStatus('Label already exists', 'error');
        return;
      }
      if (hotkey && this.labels.some((label) => label.hotkey === hotkey)) {
        this.setStatus('Hotkey already exists', 'error');
        return;
      }

      this.labels = [...this.labels, { name, hotkey: hotkey || undefined }];
      this.currentLabel = name;
      this.newLabelInput.value = '';
      this.newHotkeyInput.value = '';
      this.renderLabels();
      this.renderLabelManager();
      this.saveLabels();
    }

    deleteLabel(name) {
      if (this.labels.length <= 1) {
        this.setStatus('At least one label is required', 'error');
        return;
      }
      const used = this.currentData.annotations.some((annotation) => annotation.label === name);
      if (used && !window.confirm(`Delete label "${name}" from the label list? Existing boxes keep this label until reassigned.`)) {
        return;
      }

      this.labels = this.labels.filter((label) => label.name !== name);
      if (this.currentLabel === name) {
        this.currentLabel = this.labels[0]?.name ?? '';
      }
      this.renderLabels();
      this.renderLabelManager();
      this.saveLabels();
    }

    saveLabels() {
      vscode.postMessage({
        type: 'updateLabels',
        labels: this.labels
      });
      this.setStatus('Saving labels...');
    }

    handleLabelInputKeyDown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.addLabel();
      }
      event.stopPropagation();
    }

    setReviewed(reviewed) {
      if (this.currentData.reviewed === reviewed) {
        return;
      }
      const before = {
        annotations: cloneAnnotations(this.canvasController.getAnnotations()),
        reviewed: this.currentData.reviewed,
        selectedId: this.selectedId
      };
      this.currentData.reviewed = reviewed;
      this.pushHistory(before, this.getStateSnapshot());
      this.markDirty();
    }

    handleSelection(id) {
      this.selectedId = id;
      const selected = this.currentData.annotations.find((annotation) => annotation.id === id);
      if (selected) {
        this.currentLabel = selected.label;
      }
      this.renderLabels();
      this.renderAnnotations();
    }

    markDirty() {
      this.syncFromCanvas();
      this.dirty = true;
      this.renderAnnotations();
      this.setStatus('Unsaved');
    }

    setStatus(text, tone) {
      this.saveStatus.textContent = text;
      this.saveStatus.dataset.tone = tone ?? '';
    }

    setFit() {
      this.zoom = 'fit';
      this.applyZoom();
      requestAnimationFrame(() => {
        this.renderDisplayImage();
        this.canvasController.syncCanvas();
      });
    }

    zoomBy(factor) {
      const currentWidth = this.image.getBoundingClientRect().width || this.image.naturalWidth;
      const baseZoom = currentWidth / this.image.naturalWidth;
      this.zoom = Math.min(Math.max(baseZoom * factor, 0.1), 8);
      this.applyZoom();
      requestAnimationFrame(() => {
        this.renderDisplayImage();
        this.canvasController.syncCanvas();
      });
    }

    applyZoom() {
      if (this.zoom === 'fit') {
        this.image.style.width = '';
        this.image.style.height = '';
        this.image.classList.add('fit-image');
      } else {
        this.image.classList.remove('fit-image');
        this.image.style.width = `${this.image.naturalWidth * this.zoom}px`;
        this.image.style.height = 'auto';
      }
    }

    updateImageEnhancement() {
      this.beta = Number(this.betaInput.value);
      this.alpha = Number(this.alphaInput.value);
      this.gamma = Number(this.gammaInput.value);
      this.clahe = this.claheInput.checked;
      this.betaValue.textContent = String(this.beta);
      this.alphaValue.textContent = this.alpha.toFixed(2);
      this.gammaValue.textContent = this.gamma.toFixed(2);
      this.scheduleDisplayRender();
    }

    resetViewAdjustments() {
      this.betaInput.value = '0';
      this.alphaInput.value = '1';
      this.gammaInput.value = '1';
      this.claheInput.checked = false;
      this.updateImageEnhancement();
    }

    scheduleDisplayRender() {
      if (this.pendingEnhancementFrame) {
        cancelAnimationFrame(this.pendingEnhancementFrame);
      }
      this.pendingEnhancementFrame = requestAnimationFrame(() => {
        this.pendingEnhancementFrame = 0;
        this.renderDisplayImage();
        this.canvasController.syncCanvas();
      });
    }

    clearDisplayCanvas() {
      this.imageDisplayContext.clearRect(0, 0, this.imageDisplay.width, this.imageDisplay.height);
    }

    syncDisplayCanvasSize() {
      const rect = this.image.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      this.imageDisplay.style.width = `${rect.width}px`;
      this.imageDisplay.style.height = `${rect.height}px`;
      if (this.imageDisplay.width !== width || this.imageDisplay.height !== height) {
        this.imageDisplay.width = width;
        this.imageDisplay.height = height;
      }
      return { width, height };
    }

    renderDisplayImage() {
      if (!this.image.complete || !this.image.naturalWidth || !this.image.naturalHeight) {
        return;
      }

      const { width, height } = this.syncDisplayCanvasSize();
      this.imageDisplayContext.clearRect(0, 0, width, height);
      this.imageDisplayContext.drawImage(this.image, 0, 0, width, height);

      if (this.beta === 0 && this.alpha === 1 && this.gamma === 1 && !this.clahe) {
        return;
      }

      try {
        const imageData = this.imageDisplayContext.getImageData(0, 0, width, height);
        this.applyLinearContrastGamma(imageData.data);
        if (this.clahe) {
          this.applyClahe(imageData.data, width, height);
        }
        this.imageDisplayContext.putImageData(imageData, 0, 0);
      } catch {
        this.setStatus('View enhancement unavailable for this image', 'error');
      }
    }

    applyLinearContrastGamma(data) {
      const gammaExponent = this.gamma;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = this.enhanceChannel(data[i], gammaExponent);
        data[i + 1] = this.enhanceChannel(data[i + 1], gammaExponent);
        data[i + 2] = this.enhanceChannel(data[i + 2], gammaExponent);
      }
    }

    enhanceChannel(value, gammaExponent) {
      const linear = this.clamp(this.alpha * value + this.beta, 0, 255);
      return this.clamp(Math.round(255 * Math.pow(linear / 255, gammaExponent)), 0, 255);
    }

    applyClahe(data, width, height) {
      const tilesX = 8;
      const tilesY = 8;
      const clipFactor = 3;
      const tileWidth = Math.ceil(width / tilesX);
      const tileHeight = Math.ceil(height / tilesY);

      for (let tileY = 0; tileY < tilesY; tileY += 1) {
        for (let tileX = 0; tileX < tilesX; tileX += 1) {
          const xStart = tileX * tileWidth;
          const yStart = tileY * tileHeight;
          const xEnd = Math.min(width, xStart + tileWidth);
          const yEnd = Math.min(height, yStart + tileHeight);
          this.applyClaheTile(data, width, xStart, yStart, xEnd, yEnd, clipFactor);
        }
      }
    }

    applyClaheTile(data, width, xStart, yStart, xEnd, yEnd, clipFactor) {
      const hist = new Array(256).fill(0);
      const tilePixels = Math.max(1, (xEnd - xStart) * (yEnd - yStart));

      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const offset = (y * width + x) * 4;
          hist[this.luma(data[offset], data[offset + 1], data[offset + 2])] += 1;
        }
      }

      const clipLimit = Math.max(1, Math.floor((tilePixels / 256) * clipFactor));
      let clipped = 0;
      for (let i = 0; i < hist.length; i += 1) {
        if (hist[i] > clipLimit) {
          clipped += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      const redistribute = Math.floor(clipped / 256);
      const remainder = clipped % 256;
      for (let i = 0; i < hist.length; i += 1) {
        hist[i] += redistribute + (i < remainder ? 1 : 0);
      }

      const map = new Array(256);
      let cdf = 0;
      for (let i = 0; i < hist.length; i += 1) {
        cdf += hist[i];
        map[i] = this.clamp(Math.round((cdf / tilePixels) * 255), 0, 255);
      }

      // CLAHE is applied to luminance, then RGB is scaled to preserve color as much as possible.
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const offset = (y * width + x) * 4;
          const oldLuma = this.luma(data[offset], data[offset + 1], data[offset + 2]);
          const newLuma = map[oldLuma];
          if (oldLuma === 0) {
            data[offset] = newLuma;
            data[offset + 1] = newLuma;
            data[offset + 2] = newLuma;
          } else {
            const ratio = newLuma / oldLuma;
            data[offset] = this.clamp(Math.round(data[offset] * ratio), 0, 255);
            data[offset + 1] = this.clamp(Math.round(data[offset + 1] * ratio), 0, 255);
            data[offset + 2] = this.clamp(Math.round(data[offset + 2] * ratio), 0, 255);
          }
        }
      }
    }

    luma(r, g, b) {
      return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    renderLabels() {
      this.labelSelect.replaceChildren();
      if (!this.labels.some((label) => label.name === this.currentLabel)) {
        this.currentLabel = this.labels[0]?.name ?? '';
      }
      for (const label of this.labels) {
        const option = document.createElement('option');
        option.value = label.name;
        option.textContent = label.hotkey ? `${label.hotkey}  ${label.name}` : label.name;
        this.labelSelect.append(option);
      }
      const selected = this.currentData.annotations.find((annotation) => annotation.id === this.selectedId);
      this.labelSelect.value = selected?.label ?? this.currentLabel;
    }

    renderLabelManager() {
      this.labelManageList.replaceChildren();
      for (const label of this.labels) {
        const row = document.createElement('div');
        row.className = 'label-manage-row';

        const name = document.createElement('span');
        name.className = 'label-manage-name';
        name.textContent = label.hotkey ? `${label.hotkey}  ${label.name}` : label.name;
        name.title = label.name;
        row.append(name);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'label-delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => this.deleteLabel(label.name));
        row.append(deleteButton);

        this.labelManageList.append(row);
      }
    }

    renderImages() {
      if (this.imageButtons.size !== this.images.length) {
        this.imageButtons.clear();
        const fragment = document.createDocumentFragment();
        for (const image of this.images) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'image-item';
          button.addEventListener('click', () => this.saveAndLoad(image.imageIndex));
          this.imageButtons.set(image.imageIndex, button);
          fragment.append(button);
        }
        this.imageList.replaceChildren(fragment);
      }

      for (const image of this.images) {
        const button = this.imageButtons.get(image.imageIndex);
        if (!button) {
          continue;
        }
        button.classList.toggle('active', image.imageIndex === this.currentIndex);
        const status = image.reviewed ? '✓' : image.hasAnnotation ? '●' : ' ';
        button.textContent = `${status} ${image.filename}`;
        button.title = image.filename;
      }
      this.updateCounter();
    }

    renderAnnotations() {
      this.annotationList.replaceChildren();
      for (const annotation of this.currentData.annotations) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'annotation-item';
        if (annotation.id === this.selectedId) {
          button.classList.add('active');
        }
        button.textContent = `${annotation.id}  ${annotation.label}`;
        button.title = `${annotation.label}: ${Math.round(annotation.bbox.x1)}, ${Math.round(annotation.bbox.y1)}, ${Math.round(annotation.bbox.x2)}, ${Math.round(annotation.bbox.y2)}`;
        button.addEventListener('click', () => this.canvasController.setSelected(annotation.id));
        this.annotationList.append(button);
      }
    }

    updateCounter() {
      this.counter.textContent = `${this.images.length === 0 ? 0 : this.currentIndex + 1} / ${this.images.length}`;
      this.prevButton.disabled = this.currentIndex <= 0;
      this.nextButton.disabled = this.currentIndex >= this.images.length - 1;
      this.sidePrevButton.disabled = this.currentIndex <= 0;
      this.sideNextButton.disabled = this.currentIndex >= this.images.length - 1;
    }

    handleKeyDown(event) {
      if (!this.labelPopup.hidden) {
        const popupLabel = this.labels.find((entry) => entry.hotkey === event.key);
        if (popupLabel) {
          event.preventDefault();
          this.labelPopup.querySelectorAll('button').forEach((button) => {
            if (button.textContent?.includes(popupLabel.name)) {
              button.click();
            }
          });
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          this.closeLabelPopup();
          return;
        }
      }

      const targetName = event.target?.tagName?.toLowerCase();
      if (targetName === 'select' || targetName === 'input' || targetName === 'button') {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.saveCurrent();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        this.redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        this.deleteSelected();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault();
        this.switchByOffset(-1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault();
        this.switchByOffset(1);
        return;
      }

      const label = this.labels.find((entry) => entry.hotkey === event.key);
      if (label) {
        event.preventDefault();
        this.changeLabel(label.name);
      }
    }

    handleDocumentMouseDown(event) {
      if (this.labelPopup.hidden || this.labelPopup.contains(event.target)) {
        return;
      }
      this.closeLabelPopup();
    }
  }

  window.ImageAnnotatorApp = AnnotatorApp;
}());
