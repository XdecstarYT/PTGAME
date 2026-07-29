// DOM-based 2D floor-plan editor: a grid of clickable/paintable cells plus a
// row of door-zone toggles above it. Mutates model.floorPlan / doorZonesActive
// in place and calls onChange() so the host UI can recompute live stats.

export class InteriorEditor {
  constructor(container, { onChange } = {}) {
    this.container = container;
    this.onChange = onChange || (() => {});
    this.brush = 'seat';
    this._painting = false;
    this._model = null;
    this._chassis = null;
    window.addEventListener('pointerup', () => { this._painting = false; });
  }

  setModel(model, chassis) {
    this._model = model;
    this._chassis = chassis;
    this.render();
  }

  setBrush(brush) { this.brush = brush; }

  render() {
    if (!this._model || !this._chassis) return;
    const { floorPlan, doorZonesActive } = this._model;
    const chassis = this._chassis;
    this.container.innerHTML = '';

    const doorRow = document.createElement('div');
    doorRow.className = 'if-doorrow';
    doorRow.style.gridTemplateColumns = `repeat(${chassis.gridCols}, 1fr)`;
    for (let c = 0; c < chassis.gridCols; c++) {
      const zoneIdx = chassis.doorZones.indexOf(c);
      const cell = document.createElement('div');
      if (zoneIdx >= 0) {
        const active = doorZonesActive[zoneIdx];
        cell.className = 'if-door' + (active ? ' active' : '');
        cell.textContent = '🚪';
        cell.title = active ? 'Door (click to remove)' : 'No door here (click to add)';
        cell.addEventListener('click', () => {
          doorZonesActive[zoneIdx] = !doorZonesActive[zoneIdx];
          cell.classList.toggle('active', doorZonesActive[zoneIdx]);
          cell.title = doorZonesActive[zoneIdx] ? 'Door (click to remove)' : 'No door here (click to add)';
          this.onChange();
        });
      } else {
        cell.className = 'if-door-spacer';
      }
      doorRow.appendChild(cell);
    }
    this.container.appendChild(doorRow);

    const grid = document.createElement('div');
    grid.className = 'if-grid';
    for (let r = 0; r < chassis.gridRows; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'if-row';
      rowEl.style.gridTemplateColumns = `repeat(${chassis.gridCols}, 1fr)`;
      for (let c = 0; c < chassis.gridCols; c++) {
        const cell = document.createElement('div');
        cell.className = `if-cell if-${floorPlan[r][c]}`;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.addEventListener('pointerdown', (e) => { this._painting = true; this._paint(r, c); e.preventDefault(); });
        cell.addEventListener('pointerenter', () => { if (this._painting) this._paint(r, c); });
        rowEl.appendChild(cell);
      }
      grid.appendChild(rowEl);
    }
    this.container.appendChild(grid);
  }

  _paint(r, c) {
    this._model.floorPlan[r][c] = this.brush;
    const el = this.container.querySelector(`.if-cell[data-r="${r}"][data-c="${c}"]`);
    if (el) el.className = `if-cell if-${this.brush}`;
    this.onChange();
  }
}
