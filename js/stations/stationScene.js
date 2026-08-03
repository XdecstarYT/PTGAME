import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildStationShellMesh } from './stationMeshBuilder.js';

// A small, self-contained Three.js preview for the Station Designer -
// mirrors BuildingScene: no wear/rain/environment presets, just a clear view
// of the exterior shell being designed.
export class StationScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe3ff);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 800);
    this.camera.position.set(30, 22, 34);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 4, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.update();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x33362e, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.05);
    this.sun.position.set(20, 30, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);

    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 1 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.stationGroup = null;

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
    if (this.stationGroup) {
      this.scene.remove(this.stationGroup);
      this.stationGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.stationGroup = buildStationShellMesh({
      typeId: design.typeId, tierId: design.tierId, architectureStyleId: design.architectureStyleId,
      w: design.w, d: design.d, levelCount: design.levels.length,
    });
    this.scene.add(this.stationGroup);
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
