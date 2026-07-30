import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD_CELLS, CELL_SIZE } from './config.js';

const WORLD_SIZE = WORLD_CELLS * CELL_SIZE;

// Owns the renderer/camera/lighting/orbit-controls for the placement +
// layout-editor views. Walk mode (Phase 3) swaps in its own controller but
// reuses this same renderer/scene.
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd1ff);
    this.scene.fog = new THREE.Fog(0x9fd1ff, WORLD_SIZE * 0.7, WORLD_SIZE * 1.6);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, WORLD_SIZE * 3);
    this.camera.position.set(WORLD_SIZE * 0.5, WORLD_SIZE * 0.42, WORLD_SIZE * 0.78);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 6;
    this.controls.maxDistance = WORLD_SIZE * 1.4;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this._buildLights();

    window.addEventListener('resize', () => this.onResize());
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a3a2a, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
    this.sun.position.set(WORLD_SIZE * 0.3, WORLD_SIZE * 0.6, WORLD_SIZE * 0.2);
    this.sun.target.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = WORLD_SIZE * 0.35;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = WORLD_SIZE * 1.5;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0x445066, 0.35);
    this.scene.add(this.ambient);
  }

  // Ray from the current mouse position (normalized device coords) against
  // a horizontal plane at the given y - used to translate cursor position
  // into world/grid coordinates for footprint placement.
  groundIntersect(ndcX, ndcY, y = 0) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    // OrbitControls.update() unconditionally repositions the camera from its
    // own internal state, regardless of .enabled - only skip it while walk
    // mode (which drives the camera directly) has taken over.
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export { WORLD_SIZE };
