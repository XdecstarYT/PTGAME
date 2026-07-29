import * as THREE from 'three';

// Procedural exterior mesh shared between the designer's 3D preview and the
// actual in-sim vehicles, so what you design is what rolls down the street.
export function buildExteriorMesh(model, chassis) {
  const group = new THREE.Group();
  const carLen = chassis.lengthUnits;
  const carWidth = 2.2 + chassis.gridRows * 0.5;
  const carHeight = chassis.category === 'bus' ? 3.0 : chassis.category === 'tram' ? 3.3 : 3.5;
  const gap = 0.6;
  const totalLen = model.consistCars * carLen + (model.consistCars - 1) * gap;
  let x = -totalLen / 2;

  const primary = new THREE.Color(model.livery.primary);
  const secondary = new THREE.Color(model.livery.secondary);
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.55, metalness: 0.15 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.2, metalness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const lightMats = [];

  for (let i = 0; i < model.consistCars; i++) {
    const carGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(carLen, carHeight, carWidth), bodyMat);
    body.position.y = carHeight / 2 + 0.4;
    body.castShadow = true;
    carGroup.add(body);

    if (model.livery.pattern !== 'solid') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(carLen * 1.001, carHeight * 0.24, carWidth * 1.02), stripeMat);
      stripe.position.y = carHeight * 0.42 + 0.4;
      carGroup.add(stripe);
    }

    const windowBand = new THREE.Mesh(new THREE.BoxGeometry(carLen * 0.92, carHeight * 0.32, carWidth * 1.01), windowMat);
    windowBand.position.y = carHeight * 0.72 + 0.4;
    carGroup.add(windowBand);

    const interiorLight = new THREE.Mesh(
      new THREE.BoxGeometry(carLen * 0.85, carHeight * 0.06, carWidth * 0.85),
      new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xfff0c0, emissiveIntensity: 0 })
    );
    interiorLight.position.y = carHeight * 0.58 + 0.4;
    carGroup.add(interiorLight);
    lightMats.push({ mat: interiorLight.material, kind: 'interior' });

    const wheelR = 0.5;
    for (const wx of [-carLen * 0.3, carLen * 0.3]) {
      for (const wz of [-carWidth / 2 + 0.2, carWidth / 2 - 0.2]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.35, 12), wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, wheelR, wz);
        wheel.castShadow = true;
        carGroup.add(wheel);
      }
    }

    if (i === 0) {
      for (const wz of [-carWidth * 0.28, carWidth * 0.28]) {
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff6d0, emissiveIntensity: 0 })
        );
        light.position.set(carLen / 2 - 0.1, carHeight * 0.4 + 0.4, wz);
        carGroup.add(light);
        lightMats.push({ mat: light.material, kind: 'headlight' });
      }
    }
    if (i === model.consistCars - 1) {
      for (const wz of [-carWidth * 0.28, carWidth * 0.28]) {
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0 })
        );
        light.position.set(-carLen / 2 + 0.1, carHeight * 0.4 + 0.4, wz);
        carGroup.add(light);
        lightMats.push({ mat: light.material, kind: 'taillight' });
      }
    }

    carGroup.position.x = x + carLen / 2;
    group.add(carGroup);
    x += carLen + gap;
  }

  group.userData.lightMats = lightMats;
  group.userData.bodyMats = [bodyMat, stripeMat];
  group.userData.carHeight = carHeight;
  group.userData.totalLen = totalLen;
  return group;
}

// Lerps body/stripe materials toward a grime tone and dulls the finish as
// wearFactor (0-1) rises. Shared so the designer's aging preview and the
// sim's actual worn vehicles look consistent.
export function applyWear(group, wearFactor) {
  const grime = new THREE.Color(0x4a4436);
  const w = Math.max(0, Math.min(1, wearFactor));
  for (const mat of group.userData.bodyMats || []) {
    if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
    mat.color.copy(mat.userData.baseColor).lerp(grime, w * 0.6);
    mat.roughness = 0.55 + w * 0.35;
  }
}

export function setLights(group, on) {
  for (const { mat, kind } of group.userData.lightMats || []) {
    mat.emissiveIntensity = !on ? 0 : kind === 'headlight' ? 1.3 : kind === 'taillight' ? 1 : 0.85;
  }
}
