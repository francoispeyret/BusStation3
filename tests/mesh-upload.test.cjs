const test = require('node:test');
const assert = require('node:assert/strict');
const gameRuntime = require('./game-runtime.cjs');

const {BusMesh, BusModels} = gameRuntime().window;

function verifyTriangles(mesh) {
  const source = new Float32Array(mesh.data);
  const {vertices, indices} = BusMesh.gpuGeometry(mesh);
  const expanded = new Float32Array(source.length);
  if (indices) {
    assert.equal(indices.length, source.length / 6);
    assert.ok(vertices.byteLength + indices.byteLength < source.byteLength);
    for (let i=0; i<indices.length; i++) {
      const start = indices[i]*6;
      expanded.set(vertices.subarray(start, start+6), i*6);
    }
  } else expanded.set(vertices);
  assert.deepEqual(Buffer.from(expanded.buffer), Buffer.from(source.buffer));
  assert.deepEqual(Buffer.from(new Float32Array(mesh.data).buffer), Buffer.from(source.buffer));
  return indices;
}

test('indexed uploads reproduce fleet positions, light markers and triangle order exactly', () => {
  for (const bus of BusModels.models) assert.ok(verifyTriangles(BusModels.mesh(bus.id)));
});

test('packing respects final per-vertex colours and signed coordinates', () => {
  const mesh = new BusMesh.Mesh();
  for (let z=0; z<4; z++) mesh.quad([0,0,z], [1,0,z], [1,1,z], [0,1,z], '#123456');
  mesh.data[18+3] += 6;             // Retroreflective colour on only one triangle.
  mesh.data[36+18] = -0;            // Same position numerically, different Float32 bits.
  const refs = verifyTriangles(mesh);
  assert.ok(refs);
  assert.notEqual(refs[0], refs[3]);
  assert.notEqual(refs[6], refs[9]);
  assert.equal(refs[12], refs[15]);
  assert.equal(refs[14], refs[16]);
});

test('meshes with no storage benefit or too many vertices retain an unindexed upload', () => {
  const mesh = new BusMesh.Mesh();
  mesh.quad([0,0,0], [1,0,0], [1,1,0], [0,1,0], '#fedcba');
  for (let z=1; z<=10; z++) mesh.tri([0,0,z], [1,0,z], [0,1,z], '#fedcba');
  assert.equal(verifyTriangles(mesh), null);
  const large = {data:new Float32Array(65538*6)};
  assert.equal(verifyTriangles(large), null);
});
