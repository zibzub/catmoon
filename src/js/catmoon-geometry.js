import * as THREE from "three";
import {
  MAX_ID,
  PHI,
  RHOMBUS_CAT_COUNT,
  TRI_FACE_COUNT,
  TRI_FACE_TEX_H,
  TRI_FACE_TEX_W,
  TRI_FACE_METADATA_URL,
  triFaceTextureUrl
} from "./config.js";

function makeIcosahedronData() {
  const p = PHI;
  const vertices = [
    [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
    [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
    [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  return { vertices, faces };
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function makeRhombicTriacontahedronFaces() {
  const { vertices, faces } = makeIcosahedronData();
  const edgeMap = new Map();
  const vertexNeighbors = Array.from({ length: vertices.length }, () => new Set());

  faces.forEach((face, faceIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % 3];
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
      }
      edgeMap.get(key).faces.push(faceIndex);
      vertexNeighbors[a].add(b);
      vertexNeighbors[b].add(a);
    }
  });

  const vertexDuals = vertices.map((vertex, index) => {
    const neighborIndex = vertexNeighbors[index].values().next().value;
    const planeDistance = vertex.dot(vertices[neighborIndex].clone().add(vertex).multiplyScalar(0.5));
    return vertex.clone().multiplyScalar(1 / planeDistance);
  });

  const faceDuals = faces.map((face) => {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(centroid) < 0) normal.multiplyScalar(-1);
    const planeDistance = normal.dot(a);
    return normal.multiplyScalar(1 / planeDistance);
  });

  return Array.from(edgeMap.values()).map((edge) => {
    const [faceA, faceB] = edge.faces;
    console.assert(edge.faces.length === 2, `Icosahedron edge ${edge.a}-${edge.b} has ${edge.faces.length} adjacent faces`);
    return [
      vertexDuals[edge.a].clone(),
      faceDuals[faceA].clone(),
      vertexDuals[edge.b].clone(),
      faceDuals[faceB].clone()
    ];
  });
}

function sortFaceVertices(points) {
  const center = points.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const normal = center.clone().normalize();
  const basisX = points[0].clone().sub(center).normalize();
  const basisY = normal.clone().cross(basisX).normalize();

  const sorted = [...points].sort((a, b) => {
    const av = a.clone().sub(center);
    const bv = b.clone().sub(center);
    const aa = Math.atan2(av.dot(basisY), av.dot(basisX));
    const ba = Math.atan2(bv.dot(basisY), bv.dot(basisX));
    return aa - ba;
  });

  const faceNormal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0]));
  if (faceNormal.dot(center) < 0) sorted.reverse();
  return sorted;
}

function orderRhombusFaceVerticesForDiamondUv(points) {
  const sorted = sortFaceVertices(points);
  const center = sorted.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / sorted.length);
  const diagonalA = sorted[0].distanceTo(sorted[2]);
  const diagonalB = sorted[1].distanceTo(sorted[3]);
  const longPair = diagonalA >= diagonalB ? [sorted[0], sorted[2]] : [sorted[1], sorted[3]];
  const shortPair = diagonalA >= diagonalB ? [sorted[1], sorted[3]] : [sorted[0], sorted[2]];
  const normal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0])).normalize();
  if (normal.dot(center) < 0) normal.multiplyScalar(-1);

  let localUp = new THREE.Vector3(0, 1, 0).projectOnPlane(normal);
  if (localUp.lengthSq() < 0.000001) {
    localUp = new THREE.Vector3(0, 0, 1).projectOnPlane(normal);
  }
  localUp.normalize();
  const localRight = localUp.clone().cross(normal).normalize();

  const [top, bottom] = longPair[0].clone().sub(center).dot(localUp) >= longPair[1].clone().sub(center).dot(localUp)
    ? [longPair[0], longPair[1]]
    : [longPair[1], longPair[0]];
  const [right, left] = shortPair[0].clone().sub(center).dot(localRight) >= shortPair[1].clone().sub(center).dot(localRight)
    ? [shortPair[0], shortPair[1]]
    : [shortPair[1], shortPair[0]];

  return [top, right, bottom, left];
}

function makeFilterOverlayMaterial() {
  return new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

function makeFilterBackingMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

function makeFilterEdgeMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0xff69b4,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
}

function makeEarlyRescueZoneMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xff69b4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function validateCompactTriFaceSlotMetadata(metadata) {
  if (!metadata || metadata.v !== 1) return false;
  if (metadata.tw !== TRI_FACE_TEX_W) return false;
  if (metadata.th !== TRI_FACE_TEX_H) return false;
  if (metadata.fc !== TRI_FACE_COUNT) return false;
  if (metadata.cpf !== RHOMBUS_CAT_COUNT) return false;
  if (!Array.isArray(metadata.faces) || metadata.faces.length !== TRI_FACE_COUNT) return false;

  return metadata.faces.every((faceSlots) => (
    Array.isArray(faceSlots)
    && faceSlots.length === RHOMBUS_CAT_COUNT
    && faceSlots.every((slotTuple) => (
      Array.isArray(slotTuple)
      && slotTuple.length === 7
      && slotTuple.every(Number.isFinite)
    ))
  ));
}

function normalizeCompactTriFaceSlots(faceSlots) {
  return faceSlots.map(([id, hitX, hitY, hitW, hitH, centerX, centerY]) => ({
    id,
    x: centerX,
    y: centerY,
    w: hitW,
    h: hitH,
    polygon: null,
    hitRect: {
      x: hitX,
      y: hitY,
      w: hitW,
      h: hitH
    }
  }));
}

export function createCatMoonGeometry({ textureLoader, applyTextureSettings, makePlaceholderTexture }) {
  const triFaceSlots = [];
  const triFaceTexturePromises = [];
  const triTextureStats = {
    prerenderedLoaded: 0,
    metadataLoaded: false,
    textureErrors: 0
  };

  function makeTriFaceMaterial(faceIndex) {
    const material = new THREE.MeshBasicMaterial({
      map: makePlaceholderTexture(),
      side: THREE.DoubleSide,
      opacity: 1
    });

    const ready = new Promise((resolve, reject) => {
      const url = triFaceTextureUrl(faceIndex);
      textureLoader.load(
        url,
        (texture) => {
          if (texture.image.width !== TRI_FACE_TEX_W || texture.image.height !== TRI_FACE_TEX_H) {
            console.warn(`${url} is ${texture.image.width}x${texture.image.height}; expected ${TRI_FACE_TEX_W}x${TRI_FACE_TEX_H}. Regenerate production tri-face PNGs from the dev tool.`);
          }
          applyTextureSettings(texture);
          material.map = texture;
          material.needsUpdate = true;
          triTextureStats.prerenderedLoaded += 1;
          resolve();
        },
        undefined,
        () => {
          triTextureStats.textureErrors += 1;
          reject(new Error(`Missing required tri-face texture: ${url}`));
        }
      );
    });

    return { material, ready };
  }

  function makeTriacontahedron() {
    const group = new THREE.Group();
    const faces = makeRhombicTriacontahedronFaces();
    const uvs = [
      0.5, 1,
      1, 0.5,
      0.5, 0,
      0, 0.5
    ];
    group.userData.baseMeshes = [];
    group.userData.backingMeshes = [];
    group.userData.overlayMeshes = [];
    group.userData.edgeMeshes = [];
    group.userData.earlyRescueZoneMeshes = [];
    group.userData.faceNormals = [];
    group.userData.faceUps = [];

    console.assert(faces.length === TRI_FACE_COUNT, `Expected ${TRI_FACE_COUNT} triacontahedron faces, got ${faces.length}`);
    console.assert(TRI_FACE_COUNT * RHOMBUS_CAT_COUNT === MAX_ID + 1, "Triacontahedron face count does not cover the full atlas exactly once");

    faces.forEach((points, faceIndex) => {
      console.assert(points.length === 4, `Face ${faceIndex} does not have 4 vertices`);
      const sorted = orderRhombusFaceVerticesForDiamondUv(points);
      const positions = [];
      for (const point of sorted) {
        positions.push(point.x, point.y, point.z);
      }
      const faceCenter = sorted.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / sorted.length);
      const faceNormal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0])).normalize();
      if (faceNormal.dot(faceCenter) < 0) faceNormal.multiplyScalar(-1);
      group.userData.faceNormals[faceIndex] = faceNormal;
      group.userData.faceUps[faceIndex] = sorted[0].clone().sub(sorted[2]).normalize();

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();

      const backingMesh = new THREE.Mesh(geometry, makeFilterBackingMaterial());
      backingMesh.userData.faceIndex = faceIndex;
      backingMesh.userData.isFilterBacking = true;
      backingMesh.visible = false;
      backingMesh.renderOrder = 0;
      group.add(backingMesh);
      group.userData.backingMeshes.push(backingMesh);

      const { material, ready } = makeTriFaceMaterial(faceIndex);
      triFaceTexturePromises.push(ready);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.faceIndex = faceIndex;
      mesh.userData.isBaseFace = true;
      mesh.renderOrder = 1;
      group.add(mesh);
      group.userData.baseMeshes.push(mesh);

      const overlayMesh = new THREE.Mesh(geometry, makeFilterOverlayMaterial());
      overlayMesh.userData.faceIndex = faceIndex;
      overlayMesh.userData.isFilterOverlay = true;
      overlayMesh.visible = false;
      overlayMesh.renderOrder = 2;
      group.add(overlayMesh);
      group.userData.overlayMeshes.push(overlayMesh);

      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const edgeMesh = new THREE.LineSegments(edgeGeometry, makeFilterEdgeMaterial());
      edgeMesh.userData.faceIndex = faceIndex;
      edgeMesh.userData.isFilterEdge = true;
      edgeMesh.visible = false;
      edgeMesh.renderOrder = 3;
      edgeMesh.raycast = () => {};
      group.add(edgeMesh);
      group.userData.edgeMeshes.push(edgeMesh);

      if (faceIndex < 7) {
        const earlyRescueZoneMesh = new THREE.Mesh(geometry, makeEarlyRescueZoneMaterial());
        earlyRescueZoneMesh.userData.faceIndex = faceIndex;
        earlyRescueZoneMesh.userData.isEarlyRescueZone = true;
        earlyRescueZoneMesh.visible = false;
        earlyRescueZoneMesh.renderOrder = 1.5;
        earlyRescueZoneMesh.raycast = () => {};
        group.add(earlyRescueZoneMesh);
        group.userData.earlyRescueZoneMeshes.push(earlyRescueZoneMesh);
      }
    });

    group.scale.setScalar(0.62);
    group.visible = false;
    console.info(`Triacontahedron: ${TRI_FACE_COUNT} faces x ${RHOMBUS_CAT_COUNT} cats = ${TRI_FACE_COUNT * RHOMBUS_CAT_COUNT}`);
    return group;
  }

  async function loadTriFaceSlotMetadata() {
    const response = await fetch(TRI_FACE_METADATA_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Missing required tri-face slot metadata: ${TRI_FACE_METADATA_URL}`);
    }

    const metadata = await response.json();
    if (!validateCompactTriFaceSlotMetadata(metadata)) {
      throw new Error(`${TRI_FACE_METADATA_URL} does not match current CatMoon texture settings.`);
    }

    metadata.faces.forEach((faceSlots, faceIndex) => {
      triFaceSlots[faceIndex] = normalizeCompactTriFaceSlots(faceSlots);
    });
    triTextureStats.metadataLoaded = true;
    console.info(`Loaded tri-face slot metadata from ${TRI_FACE_METADATA_URL}`);
  }

  return {
    triFaceSlots,
    triFaceTexturePromises,
    triTextureStats,
    makeTriacontahedron,
    loadTriFaceSlotMetadata
  };
}
