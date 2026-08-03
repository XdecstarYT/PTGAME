import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildExteriorMesh, applyWear, setLights } from './vehicleMeshBuilder.js';
import { buildFreightExteriorMesh } from './freightMeshBuilder.js';

const ENV_PRESETS = ['daylight', 'overcast', 'night', 'rain'];

// A small, self-contained Three.js scene dedicated to the vehicle showroom
// preview - kept separate from the main city SceneManager so the designer
// can be open at the same time without fighting over camera/lighting state.
export class DesignerScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
    this.camera.position.set(14, 8, 16);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.update();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x33362e, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(10, 16, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);

    const groundGeo = new THREE.PlaneGeometry(80, 80);
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.vehicleGroup = null;
    this.env = 'daylight';
    this._rain = null;
    this._wear = 0;

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

  // ---------------- vehicle mesh ----------------

  setVehicle(model, chassis) {
    if (this.vehicleGroup) {
      this.scene.remove(this.vehicleGroup);
      this.vehicleGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.vehicleGroup = model.kind === 'freight'
      ? buildFreightExteriorMesh(model, chassis)
      : buildExteriorMesh(model, chassis);
    this.scene.add(this.vehicleGroup);
    this._applyEnvironment();
    this._applyWear();
  }

  setWear(wearFactor) {
    this._wear = Math.max(0, Math.min(1, wearFactor));
    this._applyWear();
  }

  _applyWear() {
    if (!this.vehicleGroup) return;
    applyWear(this.vehicleGroup, this._wear);
  }

  // ---------------- environment presets ----------------

  setEnvironment(preset) {
    this.env = ENV_PRESETS.includes(preset) ? preset : 'daylight';
    this._applyEnvironment();
  }

  _applyEnvironment() {
    const env = this.env;
    const sky = { daylight: 0xbfe3ff, overcast: 0x8b8f96, night: 0x0c1020, rain: 0x565f66 }[env];
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = env === 'rain' ? new THREE.Fog(sky, 20, 70) : null;

    this.sun.intensity = { daylight: 1.1, overcast: 0.45, night: 0.05, rain: 0.25 }[env];
    this.hemi.intensity = { daylight: 0.7, overcast: 0.6, night: 0.12, rain: 0.4 }[env];
    this.groundMat.color.set(env === 'rain' ? 0x22262a : 0x3a3d33);
    this.groundMat.roughness = env === 'rain' ? 0.35 : 1;

    if (this.vehicleGroup) setLights(this.vehicleGroup, env === 'night' || env === 'rain');
    this._setRain(env === 'rain');
  }

  _setRain(on) {
    if (on && !this._rain) {
      const count = 500;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = Math.random() * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 0.12, transparent: true, opacity: 0.6 });
      this._rain = new THREE.Points(geo, mat);
      this.scene.add(this._rain);
    } else if (!on && this._rain) {
      this.scene.remove(this._rain);
      this._rain.geometry.dispose();
      this._rain.material.dispose();
      this._rain = null;
    }
  }

  // ---------------- render loop ----------------

  render(dtSeconds = 0.016) {
    if (this._rain) {
      const pos = this._rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dtSeconds * 22;
        if (y < 0) y = 30;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    // Gated on enabled, not just called unconditionally - walk mode disables
    // these controls and drives the camera itself, and an unconditional
    // update() would silently snap the camera back to the orbit position
    // every frame regardless of the enabled flag (three.js's OrbitControls
    // doesn't skip its own position write when disabled - only user input
    // is gated by that flag).
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}
