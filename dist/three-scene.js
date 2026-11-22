/* Stream the route and reuse Three.js meshes as vehicles and effects move. */
(() => {
  'use strict';

  function create(THREE,scene,{FAR,section,backdrop,prop,PROP_TYPES,impactParts,shoulderSpray,chipCorners,groundBend,landingSpot,lighting}) {
    const {Mesh,gpuGeometry}=window.BusMesh;
    const {CHUNK,LANE,skylineScaleAt,biomeModelMesh,biomeActorPose}=window.BusRoute;
    const {roadX,roadSlope}=window.BusDrive;
    const root=new THREE.Group();
    // The game advances along +Z. Three's camera looks along -Z.
    root.scale.z=-1;
    scene.add(root);

    function geometryOf(model) {
      const {vertices,indices}=gpuGeometry(model);
      const buffer=new THREE.InterleavedBuffer(vertices,6);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
      geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(buffer,3,3));
      if(indices) geometry.setIndex(new THREE.BufferAttribute(indices,1));
      geometry.computeBoundingSphere();
      return geometry;
    }

    const assets=new Map();
    function asset(key,makeModel) {
      if(!assets.has(key)) assets.set(key,geometryOf(makeModel()));
      return assets.get(key);
    }
    const props=new Set(PROP_TYPES);
    const item=type=>asset(type,()=>prop(type));
    const mountains=asset('skyline',backdrop);
    const skyline=Array.from({length:3},()=>{
      const mesh=new THREE.Mesh(mountains,lighting.backdropMaterial);
      mesh.renderOrder=-100;
      mesh.frustumCulled=false;
      root.add(mesh);
      return mesh;
    });
    skyline[1].rotation.y=Math.PI*.5;
    skyline[2].rotation.y=Math.PI;
    const streak=asset('boostTrail',()=>{
      const model=new Mesh();
      for(const side of [-1,1]) for(const [x,length] of [[.94,1.5],[1.09,.88]]) {
        model.tri([side*(x-.038),0,0],[side*(x+.038),0,0],[side*x,0,-length],'#ffcc66');
      }
      return model;
    });

    // At a low sun angle the physical shadow can fall outside the car's
    // lane. A feathered marker locates the wheels' landing point during jumps.
    const landingMaterial=new THREE.ShaderMaterial({
      uniforms:{opacity:{value:0}},
      vertexShader:`varying vec2 footprint;
        void main() {
          footprint=uv*2.-1.;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`uniform float opacity;
        varying vec2 footprint;
        void main() {
          float fade=1.-smoothstep(.12,1.,length(footprint));
          gl_FragColor=vec4(.118,.153,.208,opacity*fade);
        }`,
      side:THREE.DoubleSide, transparent:true, depthWrite:false
    });
    landingMaterial.forceSinglePass=true;
    const landing=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),landingMaterial);
    root.add(landing);

    // The color shader bends distant terrain. Include both its projected position
    // and the original position used by the shadow cameras in Three's culling.
    const center=new THREE.Vector3();
    let viewX=0,viewZ=0,eyeX=0,eyeZ=0,originZ=0;
    function boundMesh(mesh) {
      const sphere=mesh.geometry.boundingSphere;
      const scale=Math.max(mesh.scale.x,mesh.scale.y,mesh.scale.z);
      center.copy(sphere.center).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position);
      const forward=(center.x-eyeX)*viewX+(center.z-eyeZ)*viewZ+sphere.radius*scale;
      mesh.boundingSphere??=new THREE.Sphere();
      mesh.boundingSphere.copy(sphere);
      mesh.boundingSphere.radius-=groundBend(forward)/scale;
    }

    const chunks=new Map();
    let route;
    function removeChunk(tile) {
      for(const mesh of tile.meshes) {
        root.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    function newChunk(index,lapBiomes) {
      const model=section(index,lapBiomes), meshes=[];
      // Keep the narrow roadside scenery independently cullable from the
      // much wider terrain underneath it, especially in the shadow cameras.
      for(const data of [model.data.slice(0,model.groundEnd),model.data.slice(model.groundEnd)]) {
        if(!data.length) continue;
        const mesh=new THREE.Mesh(geometryOf({data}),lighting.material);
        mesh.castShadow=mesh.receiveShadow=true;
        root.add(mesh);
        meshes.push(mesh);
      }
      return {meshes,movingActors:model.movingActors};
    }

    // A fading solid writes just its nearest surface to depth before blending.
    // Its shadow thins out through the same fade in the VSM depth pass.
    const depthOnly=lighting.createMaterial({});
    depthOnly.colorWrite=false;
    function fadingDepth() {
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
      depth.onBeforeCompile=shader=>{
        shader.fragmentShader='uniform float opacity;\n'+shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           if (opacity < 1.0 && fract(dot(mod(floor(gl_FragCoord.xy),4.0),vec2(.3125,.25))) >= opacity) discard;`);
      };
      return depth;
    }
    const actors=[],fades=[];
    let actorCount=0,fadeCount=0;
    function place(geometry,x,y,z,yaw=0,roll=0,pitch=0,sx=1,sy=1,sz=1,casts=true,opacity=1,shadowOpacity=opacity) {
      if(opacity<=0) return;
      const fading=opacity<1;
      const pool=fading?fades:actors, index=fading?fadeCount++:actorCount++;
      let mesh=pool[index];
      if(!mesh) {
        const material=fading ? lighting.createMaterial({transparent:true}) : lighting.material;
        mesh=new THREE.Mesh(geometry,material);
        root.add(mesh);
        pool.push(mesh);
      }
      mesh.geometry=geometry;
      mesh.visible=true;
      mesh.position.set(x,y,z-originZ);
      mesh.rotation.set(pitch,yaw,roll,'YZX');
      mesh.scale.set(sx,sy,sz);
      mesh.castShadow=mesh.receiveShadow=casts;
      boundMesh(mesh);
      if(!fading) return;
      mesh.material.opacity=opacity;
      if(casts && !mesh.children.length) {
        const prepass=new THREE.Mesh(geometry,depthOnly);
        prepass.frustumCulled=false;
        prepass.renderOrder=1;
        mesh.add(prepass);
        mesh.customDepthMaterial=fadingDepth();
      }
      if(mesh.children.length) {
        mesh.children[0].visible=casts;
        mesh.children[0].geometry=geometry;
        mesh.customDepthMaterial.opacity=shadowOpacity;
      }
    }

    const updateSpray=shoulderSpray();
    let spray=null,sprayBuffer=null;
    function drawSpray(s) {
      const chips=updateSpray(s);
      if(!chips.length) {
        if(spray) spray.visible=false;
        return;
      }
      const model=new Mesh();
      for(const chip of chips) {
        const [left,top,right,bottom]=chipCorners(chip,viewZ,viewX,originZ);
        model.tri(left,top,bottom,chip.color,chip.shade);
        model.tri(top,right,bottom,chip.color,chip.shade*.80);
      }
      if(!sprayBuffer || sprayBuffer.array.length<model.data.length) {
        const capacity=Math.max(model.data.length,(sprayBuffer?.array.length||0)*2);
        sprayBuffer=new THREE.InterleavedBuffer(new Float32Array(capacity),6);
        sprayBuffer.setUsage(THREE.DynamicDrawUsage);
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(sprayBuffer,3,0));
        geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(sprayBuffer,3,3));
        if(spray) {
          spray.geometry.dispose();
          spray.geometry=geometry;
        } else {
          spray=new THREE.Mesh(geometry,lighting.material);
          spray.frustumCulled=false;
          root.add(spray);
        }
      }
      sprayBuffer.array.set(model.data);
      sprayBuffer.clearUpdateRanges();
      sprayBuffer.addUpdateRange(0,model.data.length);
      sprayBuffer.needsUpdate=true;
      spray.geometry.setDrawRange(0,model.data.length/6);
      spray.visible=true;
    }

    function update(s,{d,t,cam,bus,pose,rocket,bodyOpacity,light}) {
      originZ=d;
      viewX=Math.sin(cam.a); viewZ=Math.cos(cam.a);
      eyeX=cam.cx; eyeZ=cam.cz-d;
      actorCount=fadeCount=0;
      if(route!==s.lapBiomes) {
        for(const tile of chunks.values()) removeChunk(tile);
        chunks.clear();
        route=s.lapBiomes;
      }
      const intro=s.introProgress<1;
      const height=skylineScaleAt(d+185*viewZ,route);
      skyline[0].visible=height>0;
      skyline[0].position.y=-15;
      skyline[0].scale.y=height;
      const settle=Math.max(0,2*s.introProgress-1);
      for(const side of [skyline[1],skyline[2]]) {
        side.visible=intro;
        if(intro) side.position.y=-15-84*settle*settle;
      }

      const start=Math.floor((intro?d-FAR:cam.cz-5)/CHUNK),end=Math.floor((d+FAR)/CHUNK);
      // At low sun, tall roadside objects project into view from beyond a tile.
      const slopeZ=light.direction.z/light.direction.y;
      const reach=Math.ceil((40*Math.abs(slopeZ)+5)/CHUNK);
      const first=start-(slopeZ<0?reach:1),last=end+(slopeZ>0?reach:1);
      for(const [index,tile] of chunks) if(index<first||index>last) {
        removeChunk(tile);
        chunks.delete(index);
      }
      for(let index=first;index<=last;index++) {
        if(!chunks.has(index)) chunks.set(index,newChunk(index,route));
        const tile=chunks.get(index);
        for(const mesh of tile.meshes) {
          mesh.position.z=index*CHUNK-d;
          boundMesh(mesh);
        }
        for(const actor of tile.movingActors) {
          const p=biomeActorPose(actor,t), model=biomeModelMesh(actor.model,actor.variant);
          place(asset(model,()=>model),p.x,p.y,p.z,p.yaw,p.roll,p.pitch,p.size,p.size,p.size);
        }
      }
      for(const o of s.objects||[]) {
        if(!props.has(o.type)||o.z < -8||o.z>FAR) continue;
        const z=d+o.z, x=roadX(z)+o.lane*LANE;
        const pickup=o.type==='boost'||o.type==='repair'||o.type==='rocket';
        const yaw=Math.atan(roadSlope(z))+(pickup?.29*Math.sin(t*2.5+z*.17):0);
        place(item(o.type),x,pickup?Math.sin(t*3+z*.06)*.12:0,z,yaw,0,0,1,1,1,o.type!=='oil'&&o.type!=='pothole');
      }
      const {x,y,yaw,roll,pitch}=pose;
      const spot=landingSpot(s,bus);
      landing.visible=Boolean(spot);
      if(spot) {
        const forward=(x-cam.cx)*viewX+(d-cam.cz)*viewZ;
        landing.position.set(x,.044+groundBend(forward),0);
        landing.rotation.y=yaw;
        landing.scale.set(1.25*spot.radiusX,1,1.25*spot.radiusZ);
        landingMaterial.uniforms.opacity.value=1-(1-spot.opacity)**4;
      }
      place(asset(bus,()=>window.BusModels.mesh(bus.id)),x,y,d,yaw,roll,pitch,1,1,1,true,bodyOpacity,s.busOpacity??1);
      if(rocket) {
        const n=rocket.nozzle;
        place(item('rocketMotor'),n.x,n.y,n.z,yaw,roll,pitch);
        place(item('rocketFlame'),n.x,n.y,n.z,yaw,roll,pitch,rocket.width,rocket.width,rocket.length,false);
      }
      if(s.boost) {
        const behind=bus.taillamp[2]+.36+.16*Math.sin(t*16);
        const z=behind*Math.cos(pitch);
        place(streak,x+z*Math.sin(yaw),y+.085-behind*Math.sin(pitch),d+z*Math.cos(yaw),yaw,roll,pitch,1,1,1,false);
      }
      impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
        place(item(type),x,y,z,yaw,roll,pitch,sx,sy,sz,type==='cone'||type==='barrier',alpha);
      });
      for(let i=actorCount;i<actors.length;i++) actors[i].visible=false;
      for(let i=fadeCount;i<fades.length;i++) fades[i].visible=false;
      drawSpray(s);
    }

    function dispose() {
      scene.remove(root);
      for(const tile of chunks.values()) removeChunk(tile);
      for(const geometry of assets.values()) geometry.dispose();
      for(const mesh of fades) {
        mesh.material.dispose();
        mesh.customDepthMaterial?.dispose();
      }
      depthOnly.dispose();
      landingMaterial.dispose();
      landing.geometry.dispose();
      spray?.geometry.dispose();
    }
    return {update,dispose};
  }

  window.BusThreeScene={create};
})();
