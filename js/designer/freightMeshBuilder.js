import * as THREE from 'three';

// A trapezoidal hopper-car cross-section (wide open-top bin tapering to a
// narrow bottom discharge trough) extruded along the car's length - the same
// "build a 2D Shape, extrude along depth, rotate so depth becomes the car's
// local +X" trick vehicleMeshBuilder.js's roundedBodyGeometry uses, so a
// hopper actually reads as a hopper instead of a generic box.
function hopperBodyGeometry(length, height, width) {
  const hw = width / 2;
  const troughHw = width * 0.16;
  const shoulderH = height * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, height);
  shape.lineTo(hw, height);
  shape.lineTo(hw, shoulderH);
  shape.lineTo(troughHw, 0);
  shape.lineTo(-troughHw, 0);
  shape.lineTo(-hw, shoulderH);
  shape.lineTo(-hw, height);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -length / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

// Renders an operator name (or a generic fallback) onto a small canvas
// texture for a side decal - the freight equivalent of vehicleMeshBuilder's
// destinationSign, just flush-mounted on the body side rather than
// roof-housed, since trucks/rail cars don't have a windshield to clear.
function sideDecalTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || 'FREIGHT').slice(0, 16).toUpperCase(), canvas.width / 2, canvas.height / 2);
  return new THREE.CanvasTexture(canvas);
}

function addSideDecals(group, text, len, bodyH, width, yFrac = 0.55) {
  const tex = sideDecalTexture(text);
  const w = len * 0.5, h = bodyH * 0.22;
  for (const side of [1, -1]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }),
    );
    decal.position.set(0, bodyH * yFrac, side * (width / 2 + 0.02));
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(decal);
  }
}

// A player-uploaded logo, mounted below the operator name decal.
function addLogoDecal(group, dataUrl, bodyH, width, yFrac = 0.3) {
  const tex = new THREE.TextureLoader().load(dataUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  const size = bodyH * 0.4;
  for (const side of [1, -1]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }),
    );
    decal.position.set(0, bodyH * yFrac, side * (width / 2 + 0.02));
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(decal);
  }
}

function addWheels(group, len, width, wheelR, hubMat, wheelMat) {
  const wheelCount = Math.max(2, Math.round(len / 2.5));
  for (let i = 0; i < wheelCount; i++) {
    const wx = -len / 2 + (i + 0.5) * (len / wheelCount);
    for (const wz of [-width / 2 + 0.15, width / 2 - 0.15]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 12), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wheelR, wz);
      wheel.castShadow = true;
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.4, wheelR * 0.4, 0.32, 10), hubMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, wheelR, wz);
      group.add(hub);
    }
  }
}

// Procedural freight vehicle mesh - real per-bodyStyle detail (windshield/
// grille/mirrors on trucks, a cylindrical tanker, a crate stack on flatbeds,
// a true hopper silhouette and boxcar door detail on rail cars) instead of
// the earlier plain-box placeholder, while staying cheap enough to build
// per-truck with no instancing (fleets here are small - tens, not hundreds).
export function buildFreightExteriorMesh(model, chassis) {
  const group = new THREE.Group();
  const len = chassis.lengthUnits;
  const width = chassis.category === 'freight_rail' ? 2.8 : 2.3;
  const bodyH = chassis.category === 'freight_rail' ? 3.0 : 2.4;

  const primary = new THREE.Color(model.livery.primary);
  const secondary = new THREE.Color(model.livery.secondary);
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.6, metalness: 0.15 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.55 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2230, transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.2, clearcoat: 0.5,
  });
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.5, metalness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 0.6 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.4, metalness: 0.6 });
  const crateColors = [0x8a6a4a, 0x9a7a55, 0x7a5c3e];

  const operatorLabel = model.livery.operatorName || chassis.manufacturer;

  if (chassis.category === 'truck') {
    const cabLen = len * 0.22;
    const cabX = len / 2 - cabLen / 2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cabLen, bodyH * 0.9, width), cabMat);
    cab.position.set(cabX, bodyH * 0.45 + 0.5, 0);
    cab.castShadow = true;
    group.add(cab);

    // Windshield, grille, headlights and mirrors - the same "read as a real
    // truck at a glance" details buses/trams already get.
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, bodyH * 0.4, width * 0.86), glassMat);
    windshield.position.set(cabX + cabLen / 2 - 0.03, bodyH * 0.75 + 0.5, 0);
    group.add(windshield);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.08, bodyH * 0.25, width * 0.8), grilleMat);
    grille.position.set(cabX + cabLen / 2 + 0.02, bodyH * 0.32 + 0.5, 0);
    group.add(grille);
    for (const wz of [-width * 0.32, width * 0.32]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.28), lightMat);
      headlight.position.set(cabX + cabLen / 2 + 0.03, bodyH * 0.22 + 0.5, wz);
      group.add(headlight);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.14), cabMat);
      mirror.position.set(cabX + cabLen / 2 + 0.1, bodyH * 0.7 + 0.5, wz > 0 ? width / 2 + 0.1 : -width / 2 - 0.1);
      group.add(mirror);
    }

    const bodyLen = len - cabLen - 0.1;
    const bodyX = len / 2 - cabLen - bodyLen / 2 - 0.1;

    if (chassis.bodyStyle === 'tanker') {
      const tankR = bodyH * 0.42;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, bodyLen, 16), new THREE.MeshStandardMaterial({
        color: primary, roughness: 0.25, metalness: 0.6,
      }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(bodyX, tankR + 0.55, 0);
      tank.castShadow = true;
      group.add(tank);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(tankR * 1.02, tankR * 1.02, bodyLen * 0.15, 16), stripeMat);
      stripe.rotation.z = Math.PI / 2;
      stripe.position.set(bodyX, tankR + 0.55, 0);
      group.add(stripe);
      for (const capX of [bodyX - bodyLen / 2, bodyX + bodyLen / 2]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(tankR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: primary, roughness: 0.25, metalness: 0.6 }));
        cap.rotation.z = capX < bodyX ? -Math.PI / 2 : Math.PI / 2;
        cap.position.set(capX, tankR + 0.55, 0);
        group.add(cap);
      }
    } else if (chassis.bodyStyle === 'flatbed') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, 0.3, width * 0.9), bodyMat);
      bed.position.set(bodyX, 0.65, 0);
      bed.castShadow = true; bed.receiveShadow = true;
      group.add(bed);
      let cx = bodyX - bodyLen * 0.32;
      for (let i = 0; i < 3; i++) {
        const size = 0.6 + (i % 2) * 0.15;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, width * 0.7), new THREE.MeshStandardMaterial({ color: crateColors[i % crateColors.length], roughness: 0.85 }));
        crate.position.set(cx, 0.8 + size / 2, 0);
        crate.castShadow = true;
        group.add(crate);
        cx += bodyLen * 0.3;
      }
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, bodyH, width), bodyMat);
      body.position.set(bodyX, bodyH / 2 + 0.5, 0);
      body.castShadow = true;
      group.add(body);
      const doorLine = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.9, 0.04, 0.04), stripeMat);
      doorLine.position.set(bodyX, bodyH * 0.5 + 0.5, width / 2 + 0.01);
      group.add(doorLine);
      addSideDecals(group, operatorLabel, bodyLen, bodyH, width);
      if (model.livery.logoDataUrl) addLogoDecal(group, model.livery.logoDataUrl, bodyH, width, 0.25);
    }
  } else {
    // Freight rail: a boxcar (enclosed body + roof ridge + sliding-door
    // panel) or a hopper (true trapezoidal open-top/funnel-bottom shape),
    // each with a coupler knuckle at both ends of the underframe.
    if (chassis.bodyStyle === 'hopper') {
      const hopper = new THREE.Mesh(hopperBodyGeometry(len * 0.94, bodyH * 0.85, width), bodyMat);
      hopper.position.set(0, 0.55, 0);
      hopper.castShadow = true; hopper.receiveShadow = true;
      group.add(hopper);
      for (let i = 1; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, bodyH * 0.3, width * 1.02), stripeMat);
        rib.position.set(-len * 0.47 + i * (len * 0.94 / 3), bodyH * 0.55 + 0.55, 0);
        group.add(rib);
      }
    } else {
      const bodyGeo = new THREE.BoxGeometry(len * 0.96, bodyH, width);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, bodyH / 2 + 0.5, 0);
      body.castShadow = true;
      group.add(body);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.15, width * 0.5), stripeMat);
      ridge.position.set(0, bodyH + 0.5 + 0.075, 0);
      group.add(ridge);
      for (const side of [1, -1]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, bodyH * 0.75, 0.05), cabMat);
        door.position.set(0, bodyH * 0.5 + 0.5, side * (width / 2 + 0.03));
        group.add(door);
      }
      addSideDecals(group, operatorLabel, len, bodyH, width, 0.72);
      if (model.livery.logoDataUrl) addLogoDecal(group, model.livery.logoDataUrl, bodyH, width, 0.4);
    }
    for (const capX of [-len / 2 - 0.15, len / 2 + 0.15]) {
      const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.4 }));
      coupler.position.set(capX, 0.4, 0);
      group.add(coupler);
    }
  }

  addWheels(group, len, width, 0.45, hubMat, wheelMat);

  group.userData.bodyMats = [bodyMat];
  group.userData.carHeight = bodyH;
  group.userData.totalLen = len;
  return group;
}
