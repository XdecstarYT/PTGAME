import * as THREE from 'three';

// Basic procedural freight vehicle mesh - a functional placeholder so the
// cargo simulation has something to actually move and render. Deepened with
// real per-bodyStyle detail (grilles, container stacks, hopper/boxcar rigs,
// etc.) in a later realism pass; this keeps that seam clean.
export function buildFreightExteriorMesh(model, chassis) {
  const group = new THREE.Group();
  const len = chassis.lengthUnits;
  const width = chassis.category === 'freight_rail' ? 2.8 : 2.3;
  const bodyH = chassis.category === 'freight_rail' ? 3.0 : 2.4;

  const primary = new THREE.Color(model.livery.primary);
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.6, metalness: 0.15 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  if (chassis.category === 'truck') {
    const cabLen = len * 0.22;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cabLen, bodyH * 0.9, width), cabMat);
    cab.position.set(len / 2 - cabLen / 2, bodyH * 0.45 + 0.5, 0);
    cab.castShadow = true;
    group.add(cab);

    const bodyLen = len - cabLen - 0.1;
    const bodyGeo = new THREE.BoxGeometry(bodyLen, bodyH, width * (chassis.bodyStyle === 'flatbed' ? 0.9 : 1));
    const body = new THREE.Mesh(bodyGeo, chassis.bodyStyle === 'tanker'
      ? new THREE.MeshStandardMaterial({ color: primary, roughness: 0.3, metalness: 0.5 })
      : bodyMat);
    body.position.set(len / 2 - cabLen - bodyLen / 2 - 0.1, bodyH / 2 + 0.5, 0);
    body.castShadow = true;
    group.add(body);
  } else {
    // freight rail: a flat-topped car body, varied slightly by bodyStyle
    const bodyGeo = new THREE.BoxGeometry(len * 0.96, chassis.bodyStyle === 'hopper' ? bodyH * 0.7 : bodyH, width);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, (chassis.bodyStyle === 'hopper' ? bodyH * 0.35 : bodyH / 2) + 0.5, 0);
    body.castShadow = true;
    group.add(body);
  }

  const wheelR = 0.45;
  const wheelCount = Math.max(2, Math.round(len / 2.5));
  for (let i = 0; i < wheelCount; i++) {
    const wx = -len / 2 + (i + 0.5) * (len / wheelCount);
    for (const wz of [-width / 2 + 0.15, width / 2 - 0.15]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 10), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wheelR, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  group.userData.bodyMats = [bodyMat];
  group.userData.carHeight = bodyH;
  group.userData.totalLen = len;
  return group;
}
