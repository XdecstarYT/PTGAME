import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD_SIZE } from './config.js';

// Owns the Three.js renderer, camera, lighting rig and day/night sky.
// Nothing simulation-related lives here - callers just call setTimeOfDay().

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
    this.scene.fog = new THREE.Fog(0x9fd1ff, WORLD_SIZE * 0.55, WORLD_SIZE * 1.35);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, WORLD_SIZE * 3);
    this.camera.position.set(WORLD_SIZE * 0.35, WORLD_SIZE * 0.42, WORLD_SIZE * 0.55);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 20;
    this.controls.maxDistance = WORLD_SIZE * 1.6;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this._buildLights();

    this.topDown = false;
    this._preTopDownState = null;
    this.isRaining = false;
    this.rainPoints = null;

    window.addEventListener('resize', () => this.onResize());
  }

  // Ambient day-to-day rain (see economy.js's isRaining, distinct from
  // events.js's rarer weather_slow storm disruption) - a simple falling
  // point-cloud built lazily on first rain and just toggled visible/hidden
  // afterward, rather than added/removed from the scene each time.
  setWeather(isRaining) {
    this.isRaining = isRaining;
    if (isRaining && !this.rainPoints) this._buildRain();
    if (this.rainPoints) this.rainPoints.visible = isRaining;
  }

  _buildRain() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() * WORLD_SIZE;
      positions[i * 3 + 1] = Math.random() * 70;
      positions[i * 3 + 2] = Math.random() * WORLD_SIZE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaac4e0, size: 0.5, transparent: true, opacity: 0.5,
      sizeAttenuation: true, depthWrite: false,
    });
    this.rainPoints = new THREE.Points(geo, mat);
    this.scene.add(this.rainPoints);
  }

  _updateRain(dtSeconds) {
    if (!this.rainPoints || !this.rainPoints.visible) return;
    const pos = this.rainPoints.geometry.attributes.position;
    const fallSpeed = 45; // world units/sec
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - fallSpeed * dtSeconds;
      if (y < 0) y = 60 + Math.random() * 10;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a3a2a, 0.65);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = WORLD_SIZE * 0.6;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = WORLD_SIZE * 2.2;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0x445066, 0.3);
    this.scene.add(this.ambient);
  }

  // hour in [0,24)
  setTimeOfDay(hour) {
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const radius = WORLD_SIZE * 0.9;
    const height = Math.sin(angle);
    const horiz = Math.cos(angle);

    const cx = WORLD_SIZE / 2;
    const cz = WORLD_SIZE / 2;
    this.sun.position.set(cx + horiz * radius, Math.max(height, -0.15) * radius * 0.6 + 40, cz + radius * 0.25);
    this.sun.target.position.set(cx, 0, cz);

    const dayness = Math.max(0, Math.sin(angle)); // 0 at night, 1 at noon
    const duskness = Math.max(0, 1 - Math.abs(height) * 3) * (height > -0.3 ? 1 : 0);

    const nightColor = new THREE.Color(0x0a0e1c);
    const duskColor = new THREE.Color(0xff9c6b);
    const dayColor = new THREE.Color(0x9fd1ff);

    const skyColor = new THREE.Color();
    if (dayness > 0.05) {
      skyColor.copy(nightColor).lerp(dayColor, Math.min(1, dayness * 1.4));
    } else {
      skyColor.copy(nightColor);
    }
    skyColor.lerp(duskColor, duskness * 0.5);

    this.scene.background.copy(skyColor);
    this.scene.fog.color.copy(skyColor);

    this.sun.intensity = 0.15 + dayness * 1.1;
    this.sun.color.copy(new THREE.Color(0xfff3d6).lerp(new THREE.Color(0xffffff), dayness));
    this.hemi.intensity = 0.25 + dayness * 0.55;
    this.ambient.intensity = 0.18 + (1 - dayness) * 0.25;
  }

  toggleTopDown(force) {
    this.topDown = force !== undefined ? force : !this.topDown;
    if (this.topDown) {
      this._preTopDownState = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
      };
      const c = WORLD_SIZE / 2;
      this.camera.position.set(c, WORLD_SIZE * 1.3, c + 0.01);
      this.controls.target.set(c, 0, c);
      this.controls.maxPolarAngle = 0.05;
    } else {
      this.controls.maxPolarAngle = Math.PI * 0.49;
      if (this._preTopDownState) {
        this.camera.position.copy(this._preTopDownState.position);
        this.controls.target.copy(this._preTopDownState.target);
      }
    }
    this.controls.update();
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render(dtSeconds = 0.016) {
    this.controls.update();
    this._updateRain(dtSeconds);
    this.renderer.render(this.scene, this.camera);
  }
}
