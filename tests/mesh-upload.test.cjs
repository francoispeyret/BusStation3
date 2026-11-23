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

test('articulated fleet keeps the arcade tyres at their axles and steers only the front pair', () => {
  const [r,g,b]=BusMesh.rgb('#35444b');
  function tread(mesh,x=0,y=0,z=0) {
    const vertices=[], d=mesh.data;
    for(let i=0;i<d.length;i+=6) {
      if(d[i+3]===r && d[i+4]===g && d[i+5]===b) vertices.push([d[i]+x,d[i+1]+y,d[i+2]+z]);
    }
    return vertices;
  }
  for(const {id} of BusModels.models) for(const lowDetail of [false,true]) {
    const {body,wheels}=BusModels.parts(id,lowDetail);
    assert.equal(wheels.length,id==='nocturne'?6:4);
    assert.equal(tread(body).length,0);
    const front=wheels.filter(w=>w.front);
    assert.equal(front.length,2);
    assert.equal(front[0].z,Math.max(...wheels.map(w=>w.z)));
    assert.equal(front[0].z,front[1].z);
    assert.equal(front[0].x,-front[1].x);

    const assembled=[];
    for(const wheel of wheels) {
      const local=tread(wheel.mesh);
      assert.ok(local.length>0);
      for(const [,y,z] of local) assert.ok(Math.abs(Math.hypot(y,z)-wheel.radius)<1e-10);
      assembled.push(...tread(wheel.mesh,wheel.x,wheel.y,wheel.z));
    }
    assert.deepEqual(assembled,tread(BusModels.mesh(id,lowDetail)));
  }
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
