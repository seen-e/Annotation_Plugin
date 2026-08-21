/* global window */
(function () {
  'use strict';

  const MIN_BOX_SIZE = 4;
  const HANDLE_SIZE = 8;
  const HANDLE_HALF = HANDLE_SIZE / 2;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeBox(bbox) {
    return {
      x1: Math.min(bbox.x1, bbox.x2),
      y1: Math.min(bbox.y1, bbox.y2),
      x2: Math.max(bbox.x1, bbox.x2),
      y2: Math.max(bbox.y1, bbox.y2)
    };
  }

  function cloneAnnotations(annotations) {
    return annotations.map((annotation) => ({
      id: annotation.id,
      label: annotation.label,
      bbox: { ...annotation.bbox }
    }));
  }

  function boxesEqual(a, b) {
    return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
  }

  class CanvasController {
    constructor(options) {
      this.canvas = options.canvas;
      this.image = options.image;
      this.onChange = options.onChange;
      this.onSelect = options.onSelect;
      this.onCreateBox = options.onCreateBox;
      this.getCurrentLabel = options.getCurrentLabel;
      this.getStateSnapshot = options.getStateSnapshot;
      this.pushHistory = options.pushHistory;
      this.ctx = this.canvas.getContext('2d');

      this.annotations = [];
      this.selectedId = undefined;
      this.mode = 'idle';
      this.dragStartImage = undefined;
      this.dragStartBox = undefined;
      this.dragOffset = undefined;
      this.resizeHandle = undefined;
      this.historyBefore = undefined;
      this.displayWidth = 0;
      this.displayHeight = 0;
      this.imageWidth = 0;
      this.imageHeight = 0;

      this.canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
      this.canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
      window.addEventListener('mouseup', () => this.onMouseUp());
      window.addEventListener('resize', () => this.syncCanvas());
    }

    setImageSize(width, height) {
      this.imageWidth = width;
      this.imageHeight = height;
      this.syncCanvas();
    }

    setAnnotations(annotations) {
      this.annotations = cloneAnnotations(annotations);
      this.selectedId = undefined;
      this.mode = 'idle';
      this.draw();
    }

    setSelected(id) {
      this.selectedId = id;
      this.onSelect(id);
      this.draw();
    }

    getAnnotations() {
      return cloneAnnotations(this.annotations);
    }

    deleteSelected() {
      if (!this.selectedId) {
        return false;
      }
      const before = this.getStateSnapshot();
      const deletedIndex = this.annotations.findIndex((annotation) => annotation.id === this.selectedId);
      this.annotations = this.annotations.filter((annotation) => annotation.id !== this.selectedId);
      const nextIndex = Math.min(deletedIndex, this.annotations.length - 1);
      this.selectedId = nextIndex >= 0 ? this.annotations[nextIndex].id : undefined;
      this.onSelect(this.selectedId);
      this.pushHistory(before, this.getStateSnapshot());
      this.onChange();
      this.draw();
      return true;
    }

    addAnnotation(label, bbox, beforeSnapshot) {
      const annotation = {
        id: `bbox_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        label,
        bbox: normalizeBox(bbox)
      };
      this.annotations.push(annotation);
      this.selectedId = annotation.id;
      this.onSelect(annotation.id);
      this.pushHistory(beforeSnapshot ?? this.getStateSnapshot(), this.getStateSnapshot());
      this.onChange();
      this.draw();
    }

    changeSelectedLabel(label) {
      const selected = this.getSelected();
      if (!selected || selected.label === label) {
        return false;
      }
      const before = this.getStateSnapshot();
      selected.label = label;
      this.pushHistory(before, this.getStateSnapshot());
      this.onChange();
      this.draw();
      return true;
    }

    replaceAnnotations(annotations, selectedId) {
      this.annotations = cloneAnnotations(annotations);
      this.selectedId = selectedId;
      this.onSelect(selectedId);
      this.draw();
    }

    syncCanvas() {
      const rect = this.image.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.displayWidth = rect.width;
      this.displayHeight = rect.height;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    displayToImage(point) {
      // All saved bboxes stay in natural image pixels; mouse positions are converted at the boundary.
      return {
        x: clamp(point.x * this.imageWidth / this.displayWidth, 0, this.imageWidth),
        y: clamp(point.y * this.imageHeight / this.displayHeight, 0, this.imageHeight)
      };
    }

    imageToDisplay(point) {
      return {
        x: point.x * this.displayWidth / this.imageWidth,
        y: point.y * this.displayHeight / this.imageHeight
      };
    }

    imageBoxToDisplayBox(bbox) {
      const p1 = this.imageToDisplay({ x: bbox.x1, y: bbox.y1 });
      const p2 = this.imageToDisplay({ x: bbox.x2, y: bbox.y2 });
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }

    getMousePoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    onMouseDown(event) {
      if (this.imageWidth <= 0 || this.imageHeight <= 0) {
        return;
      }
      const displayPoint = this.getMousePoint(event);
      const imagePoint = this.displayToImage(displayPoint);
      const handle = this.hitTestHandle(displayPoint);
      const hit = this.hitTestBox(imagePoint);

      this.historyBefore = this.getStateSnapshot();
      this.dragStartImage = imagePoint;

      if (handle && this.selectedId) {
        this.mode = 'resizing';
        this.resizeHandle = handle;
        this.dragStartBox = { ...this.getSelected().bbox };
        return;
      }

      if (hit) {
        this.setSelected(hit.id);
        this.mode = 'moving';
        this.dragStartBox = { ...hit.bbox };
        this.dragOffset = {
          x: imagePoint.x - hit.bbox.x1,
          y: imagePoint.y - hit.bbox.y1
        };
        return;
      }

      this.setSelected(undefined);
      this.mode = 'drawing';
      this.dragStartBox = {
        x1: imagePoint.x,
        y1: imagePoint.y,
        x2: imagePoint.x,
        y2: imagePoint.y
      };
    }

    onMouseMove(event) {
      if (this.mode === 'idle' || !this.dragStartImage) {
        return;
      }
      const imagePoint = this.displayToImage(this.getMousePoint(event));

      if (this.mode === 'drawing') {
        this.dragStartBox = normalizeBox({
          x1: this.dragStartImage.x,
          y1: this.dragStartImage.y,
          x2: imagePoint.x,
          y2: imagePoint.y
        });
        this.draw();
        return;
      }

      const selected = this.getSelected();
      if (!selected || !this.dragStartBox) {
        return;
      }

      if (this.mode === 'moving' && this.dragOffset) {
        const width = this.dragStartBox.x2 - this.dragStartBox.x1;
        const height = this.dragStartBox.y2 - this.dragStartBox.y1;
        const x1 = clamp(imagePoint.x - this.dragOffset.x, 0, this.imageWidth - width);
        const y1 = clamp(imagePoint.y - this.dragOffset.y, 0, this.imageHeight - height);
        selected.bbox = {
          x1,
          y1,
          x2: x1 + width,
          y2: y1 + height
        };
        this.onChange();
        this.draw();
        return;
      }

      if (this.mode === 'resizing' && this.resizeHandle) {
        selected.bbox = this.resizeBox(this.dragStartBox, imagePoint, this.resizeHandle);
        this.onChange();
        this.draw();
      }
    }

    onMouseUp() {
      if (this.mode === 'idle') {
        return;
      }

      if (this.mode === 'drawing' && this.dragStartBox) {
        const box = normalizeBox(this.dragStartBox);
        if (box.x2 - box.x1 >= MIN_BOX_SIZE && box.y2 - box.y1 >= MIN_BOX_SIZE) {
          this.onCreateBox(box, this.historyBefore);
        }
      } else if ((this.mode === 'moving' || this.mode === 'resizing') && this.historyBefore) {
        const selected = this.getSelected();
        const beforeAnnotation = this.historyBefore.annotations.find((item) => item.id === this.selectedId);
        if (selected && beforeAnnotation && !boxesEqual(selected.bbox, beforeAnnotation.bbox)) {
          this.pushHistory(this.historyBefore, this.getStateSnapshot());
        }
      }

      this.mode = 'idle';
      this.dragStartImage = undefined;
      this.dragStartBox = undefined;
      this.dragOffset = undefined;
      this.resizeHandle = undefined;
      this.historyBefore = undefined;
      this.draw();
    }

    resizeBox(startBox, imagePoint, handle) {
      const box = { ...startBox };
      if (handle.includes('left')) {
        box.x1 = clamp(imagePoint.x, 0, box.x2 - MIN_BOX_SIZE);
      }
      if (handle.includes('right')) {
        box.x2 = clamp(imagePoint.x, box.x1 + MIN_BOX_SIZE, this.imageWidth);
      }
      if (handle.includes('top')) {
        box.y1 = clamp(imagePoint.y, 0, box.y2 - MIN_BOX_SIZE);
      }
      if (handle.includes('bottom')) {
        box.y2 = clamp(imagePoint.y, box.y1 + MIN_BOX_SIZE, this.imageHeight);
      }
      return normalizeBox(box);
    }

    hitTestBox(point) {
      for (let i = this.annotations.length - 1; i >= 0; i -= 1) {
        const annotation = this.annotations[i];
        const box = annotation.bbox;
        if (point.x >= box.x1 && point.x <= box.x2 && point.y >= box.y1 && point.y <= box.y2) {
          return annotation;
        }
      }
      return undefined;
    }

    hitTestHandle(displayPoint) {
      if (!this.selectedId) {
        return undefined;
      }
      for (const handle of this.getHandles(this.getSelected().bbox)) {
        if (
          displayPoint.x >= handle.x - HANDLE_HALF &&
          displayPoint.x <= handle.x + HANDLE_HALF &&
          displayPoint.y >= handle.y - HANDLE_HALF &&
          displayPoint.y <= handle.y + HANDLE_HALF
        ) {
          return handle.name;
        }
      }
      return undefined;
    }

    getHandles(bbox) {
      const box = this.imageBoxToDisplayBox(bbox);
      const centerX = (box.x1 + box.x2) / 2;
      const centerY = (box.y1 + box.y2) / 2;
      return [
        { name: 'top-left', x: box.x1, y: box.y1 },
        { name: 'top', x: centerX, y: box.y1 },
        { name: 'top-right', x: box.x2, y: box.y1 },
        { name: 'left', x: box.x1, y: centerY },
        { name: 'right', x: box.x2, y: centerY },
        { name: 'bottom-left', x: box.x1, y: box.y2 },
        { name: 'bottom', x: centerX, y: box.y2 },
        { name: 'bottom-right', x: box.x2, y: box.y2 }
      ];
    }

    getSelected() {
      return this.annotations.find((annotation) => annotation.id === this.selectedId);
    }

    draw() {
      this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

      for (const annotation of this.annotations) {
        this.drawBox(annotation, annotation.id === this.selectedId);
      }

      if (this.mode === 'drawing' && this.dragStartBox) {
        this.drawTransientBox(this.dragStartBox);
      }
    }

    drawBox(annotation, selected) {
      const box = this.imageBoxToDisplayBox(annotation.bbox);
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;
      this.ctx.lineWidth = selected ? 2.5 : 1.5;
      this.ctx.strokeStyle = selected ? '#f2c94c' : '#43d9ad';
      this.ctx.fillStyle = selected ? 'rgba(242, 201, 76, 0.12)' : 'rgba(67, 217, 173, 0.08)';
      this.ctx.fillRect(box.x1, box.y1, width, height);
      this.ctx.strokeRect(box.x1, box.y1, width, height);
      this.ctx.font = '12px system-ui, sans-serif';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillStyle = selected ? '#f2c94c' : '#43d9ad';
      this.ctx.fillText(annotation.label, box.x1 + 4, Math.max(14, box.y1 - 4));

      if (selected) {
        for (const handle of this.getHandles(annotation.bbox)) {
          this.ctx.fillStyle = '#f2c94c';
          this.ctx.strokeStyle = '#1f2328';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.arc(handle.x, handle.y, HANDLE_HALF, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
      }
    }

    drawTransientBox(bbox) {
      const box = this.imageBoxToDisplayBox(bbox);
      this.ctx.setLineDash([6, 4]);
      this.ctx.strokeStyle = '#7aa2ff';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
      this.ctx.setLineDash([]);
    }
  }

  window.ImageAnnotatorCanvas = {
    CanvasController,
    MIN_BOX_SIZE,
    cloneAnnotations
  };
}());
