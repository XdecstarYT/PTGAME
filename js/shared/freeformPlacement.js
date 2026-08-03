// Shared "Bloxburg-style" click-to-place input layer for 3D-preview grid
// editors - the Building Creator's structure tab, the Station Designer's
// layout tab, and (as before) the Building Creator's voxel details tab. All
// three want the same thing: distinguish a click from an OrbitControls drag
// on the same canvas, then hand back a raycast hit for the caller to resolve
// into whatever cell/voxel coordinate its own data model uses.

// Wraps pointerdown/pointerup on a canvas, treating a small enough movement
// between them as a click (anything further is an OrbitControls drag/orbit/
// pan and is ignored). On a real click, converts the pointer position to
// normalized device coordinates and calls `raycaster(ndcX, ndcY)` - a
// caller-supplied function that knows which objects in its own scene are
// valid pick targets - then forwards whatever it returns to `onClick`.
export class FreeformClickPicker {
  constructor({ canvas, raycaster, dragThreshold = 6 }) {
    this.canvas = canvas;
    this.raycaster = raycaster;
    this.dragThreshold = dragThreshold;
    this.enabled = true;
    this.onClick = null;
    this._down = null;
    this._onPointerDown = (e) => { this._down = { x: e.clientX, y: e.clientY }; };
    this._onPointerUp = (e) => {
      if (!this._down) return;
      const dist = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
      this._down = null;
      if (!this.enabled || dist > this.dragThreshold) return;
      const rect = this.canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hit = this.raycaster(ndcX, ndcY);
      this.onClick?.(hit);
    };
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
  }
}

// Converts a world-space (x,z) point into a {r,c} grid index for a grid
// whose cells are `cellSize` apart and whose (0,0) cell's near/top-left
// corner sits at world-space `origin` (an {x,z} pair) - i.e. cell (r,c)
// spans [origin.x + c*cellSize, origin.x + (c+1)*cellSize) along x and the
// equivalent range along z using r. Both the Building Creator's structure
// grid and the Station Designer's interior grid use this same convention,
// just with their own cell size/origin.
export function worldPointToGridCell(point, origin, cellSize) {
  return {
    c: Math.floor((point.x - origin.x) / cellSize),
    r: Math.floor((point.z - origin.z) / cellSize),
  };
}
