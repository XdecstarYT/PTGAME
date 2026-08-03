import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildStationShellMesh, buildStationInteriorGroup } from './stationMeshBuilder.js';

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
    this.ground.userData.isGround = true;
    this.scene.add(this.ground);

    this.stationGroup = null;
    this.interiorGroup = null;
    this.raycaster = new THREE.Raycaster();

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
    this.clearInteriorLevel();
    if (this.stationGroup) {
      this.scene.remove(this.stationGroup);
      this.stationGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.stationGroup = buildStationShellMesh({
      typeId: design.typeId, tierId: design.tierId, architectureStyleId: design.architectureStyleId,
      w: design.w, d: design.d, levelCount: design.levels.length,
    });
    this.stationGroup.visible = true;
    this.scene.add(this.stationGroup);
  }

  // Swaps the preview from the small stylized exterior shell to the real,
  // full-size interior room for one level (the same room walk mode shows) -
  // used by the Station Designer's Layout tab so freeform placement clicks
  // have real geometry (and an always-present floor plane) to raycast
  // against, and so what you click while editing is what you'd see walking
  // through it.
  setInteriorLevel(design, levelIndex) {
    this.clearInteriorLevel();
    this.interiorGroup = buildStationInteriorGroup(design, levelIndex, { includeCeiling: false });
    this.scene.add(this.interiorGroup);
    if (this.stationGroup) this.stationGroup.visible = false;
  }

  clearInteriorLevel() {
    if (!this.interiorGroup) return;
    this.scene.remove(this.interiorGroup);
    this.interiorGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.interiorGroup = null;
    if (this.stationGroup) this.stationGroup.visible = true;
  }

  // Raycasts the Layout tab's freeform placement against the current
  // interior group only - returns the first hit tagged as an editable cell
  // (real furniture/decal mesh) or the always-present floor plane (for
  // still-empty cells), ignoring walls/ceiling/canopy/etc.
  raycastInterior(ndcX, ndcY) {
    if (!this.interiorGroup) return null;
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this.raycaster.intersectObjects([this.interiorGroup], true);
    for (const hit of hits) {
      const ud = hit.object.userData;
      if (ud.isInteriorCell || ud.isInteriorFloor) return hit;
    }
    return null;
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
