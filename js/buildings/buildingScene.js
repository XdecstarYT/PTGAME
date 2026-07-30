import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildStructureMesh } from './buildingMeshBuilder.js';

// A small, self-contained Three.js scene for the Building Creator preview -
// deliberately much simpler than DesignerScene (no wear/rain/environment
// presets), since all that matters here is seeing the structure clearly.
export class BuildingScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe3ff);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
    this.camera.position.set(16, 12, 18);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 60;
    this.controls.update();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x33362e, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.05);
    this.sun.position.set(10, 18, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);

    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.buildingGroup = null;

    this._resizeToContainer();
    window.addEventListener('resize', () => this._resizeToContainer());
  }

  _resizeToContainer() {
    const w = this.canvas.clientWidth || 400;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setDesign(design) {
    if (this.buildingGroup) {
      this.scene.remove(this.buildingGroup);
      this.buildingGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.buildingGroup = buildStructureMesh(design);
    this.scene.add(this.buildingGroup);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}
