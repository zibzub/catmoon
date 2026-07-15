import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  LIT_MOON_MATERIAL_DEFAULTS,
  createCatMoonGeometry
} from "../src/js/catmoon-geometry.js";
import { TRI_FACE_COUNT, TRI_FACE_TEX_H, TRI_FACE_TEX_W } from "../src/js/config.js";

test("Lit Moon swaps only primary face materials and supports delayed texture loading", async () => {
  const pendingTextureLoads = [];
  const geometryApi = createCatMoonGeometry({
    textureLoader: {
      load(url, onLoad) {
        pendingTextureLoads.push({ url, onLoad });
      }
    },
    applyTextureSettings(texture) {
      texture.userData.configuredForRenderMode = true;
      return texture;
    },
    makePlaceholderTexture() {
      return new THREE.Texture();
    }
  });
  const group = geometryApi.makeTriacontahedron();
  const { baseMeshes, backingMeshes, overlayMeshes, earlyRescueZoneMeshes } = group.userData;
  const firstBaseMesh = baseMeshes[0];
  const { unlitMaterial, litMaterial } = firstBaseMesh.userData;

  assert.equal(baseMeshes.length, TRI_FACE_COUNT);
  assert.ok(unlitMaterial.isMeshBasicMaterial);
  assert.ok(litMaterial.isMeshStandardMaterial);
  assert.equal(litMaterial.roughness, LIT_MOON_MATERIAL_DEFAULTS.roughness);
  assert.equal(litMaterial.metalness, LIT_MOON_MATERIAL_DEFAULTS.metalness);
  assert.ok(baseMeshes.every((mesh) => mesh.material === mesh.userData.unlitMaterial));
  assert.ok(backingMeshes.every((mesh) => mesh.material.isMeshBasicMaterial));
  assert.ok(overlayMeshes.every((mesh) => mesh.material.isMeshBasicMaterial));
  assert.ok(earlyRescueZoneMeshes.every((mesh) => mesh.material.isMeshBasicMaterial));

  geometryApi.setBaseMaterialMode("lit");
  assert.equal(geometryApi.getBaseMaterialMode(), "lit");
  assert.ok(baseMeshes.every((mesh) => mesh.material === mesh.userData.litMaterial));

  for (const { onLoad } of pendingTextureLoads) {
    const texture = new THREE.Texture();
    texture.image = { width: TRI_FACE_TEX_W, height: TRI_FACE_TEX_H };
    onLoad(texture);
  }
  await Promise.all(geometryApi.triFaceTexturePromises);

  assert.ok(firstBaseMesh.userData.unlitMaterial.map.userData.configuredForRenderMode);
  assert.equal(firstBaseMesh.userData.unlitMaterial.map, firstBaseMesh.userData.litMaterial.map);

  geometryApi.setBaseMaterialMode("unlit");
  assert.equal(geometryApi.getBaseMaterialMode(), "unlit");
  assert.ok(baseMeshes.every((mesh) => mesh.material === mesh.userData.unlitMaterial));
});
