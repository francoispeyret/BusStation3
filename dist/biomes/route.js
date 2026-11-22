/* Resolve biome definitions against permanent positions along the route. */
(() => {
  'use strict';
  const {roadX,sceneryForLap,lapAtRoadZ,roadZForLap,LANE_WIDTH:LANE,
    ROAD_HALF_WIDTH:ROAD,DRIVABLE_HALF_WIDTH} = window.BusDrive;
  const {Mesh,random} = window.BusMesh;
  const {definitions,models} = window.BusBiomes;
  const CHUNK=72;
  // Keep the first terrain-grid vertex beyond the wheels at or below the shoulders.
  const flatBankEdge=Math.ceil(DRIVABLE_HALF_WIDTH/4)*4;
  const meshCache=new Map();
  const biomeFor=id=>definitions.get(id);
  const routeThemeAt=(z,route)=>sceneryForLap(lapAtRoadZ(z),route);

  function terrainScale(z,lap,route,biome) {
    let distance=32;
    const before=z-roadZForLap(lap);
    const after=roadZForLap(lap+1)-z;
    if(lap>1 && before<32 && biomeFor(sceneryForLap(lap-1,route)).height!==biome.height) distance=before;
    if(after<32 && biomeFor(sceneryForLap(lap+1,route)).height!==biome.height) distance=after;
    const t=Math.max(0,distance/32);
    return t*t*(3-2*t);
  }
  function terrainHeight(biome,offset,z) {
    const height=biome.height(offset,z), gap=Math.abs(offset)-flatBankEdge;
    return height>0 && gap<4 ? height*Math.max(0,gap/4) : height;
  }
  function terrainHeightAt(x,z,route) {
    const lap=lapAtRoadZ(z), biome=biomeFor(sceneryForLap(lap,route));
    return terrainHeight(biome,x-roadX(z),z)*terrainScale(z,lap,route,biome);
  }
  function surfaceColorAt(offset,z,route) {
    const biome=biomeFor(routeThemeAt(z,route));
    return biome.surface?.(offset,z) || biome.grass;
  }
  function shoulderColorAt(offset,z,route) {
    const biome=biomeFor(routeThemeAt(z,route));
    const verge=ROAD+biome.shoulder;
    if(Math.abs(offset)<=verge) return biome.verge;
    // Both renderers colour each four-metre shoulder segment at its centre.
    const across=Math.sign(offset)*(verge+DRIVABLE_HALF_WIDTH)/2;
    return biome.surface?.(across,Math.floor(z/4)*4+2) || biome.grass;
  }
  function skylineScaleAt(z,route) {
    const lap=lapAtRoadZ(z), active=biomeFor(sceneryForLap(lap,route)).skyline;
    const nearStart=lap>1 && z-roadZForLap(lap)<75;
    const boundary=roadZForLap(nearStart ? lap : lap+1);
    const distance=Math.abs(z-boundary);
    if(distance>=75) return Number(active);
    const other=biomeFor(sceneryForLap(nearStart ? lap-1 : lap+1,route)).skyline;
    if(active===other) return Number(active);
    const t=distance/75, mix=.5+.5*t*t*(3-2*t);
    return active ? mix : 1-mix;
  }
  function themesInSection(index,route) {
    const start=index*CHUNK, first=routeThemeAt(start,route), last=routeThemeAt(start+CHUNK-1e-6,route);
    return first===last ? [first] : [first,last];
  }
  function isRoadsideActorVisible(type,x,z) {
    const offset=x-roadX(z);
    if(offset<0 || offset>16+LANE) return true;
    const lap=lapAtRoadZ(z);
    return roadZForLap(lap+1)-z>(type==='post' ? 4 : 32) && (lap===1 || z-roadZForLap(lap)>7);
  }
  function roadsideScenery(index,theme,route) {
    const r=random(index+2371), start=index*CHUNK, actors=[];
    function place(type,side,along,gap,size) {
      const z=start+along, x=roadX(z)+side*(DRIVABLE_HALF_WIDTH+gap), variant=Math.floor(r()*3);
      if(routeThemeAt(z,route)!==theme || !isRoadsideActorVisible(type,x,z)) return;
      const y=terrainHeightAt(x,z,route);
      const height=type==='pine' ? Math.min(size,23.5-y) : size;
      actors.push({type,x,y,z,size:height,side,variant});
    }
    biomeFor(theme).roadside?.({index,length:CHUNK,random:r,place});
    return actors;
  }
  function biomeModelMesh(model,variant) {
    const key=model+'/'+variant;
    if(!meshCache.has(key)) {
      const mesh=new Mesh();
      mesh.layers=[];
      models.get(model)(mesh,variant);
      let radius=0, height=0;
      for(let i=0;i<mesh.data.length;i+=6) {
        radius=Math.max(radius,Math.hypot(mesh.data[i],mesh.data[i+2]));
        height=Math.max(height,mesh.data[i+1]);
      }
      mesh.radius=radius;
      mesh.height=height;
      meshCache.set(key,mesh);
    }
    return meshCache.get(key);
  }
  function biomeActorsInSection(index,route) {
    const start=index*CHUNK, actors=[];
    for(const theme of themesInSection(index,route)) {
      const r=random(index+911), phases=random(index+337);
      function add(model,along,offset,options={}) {
        const {size=1,variant=0,lift=0,yaw=0,motion,anchor,keepNearSign}=options;
        const z=start+along, x=roadX(z)+offset, phase=phases()*2*Math.PI;
        if(routeThemeAt(z,route)!==theme || (!keepNearSign && !isRoadsideActorVisible(model,x,z))) return;
        const y=(anchor==='road' ? 0 : terrainHeightAt(x,z,route))+lift;
        const mesh=biomeModelMesh(model,variant);
        actors.push({type:'biomeModel',model,variant,size,x,y,z,yaw,motion,phase,anchor,lift,route,
          radius:mesh.radius*size,height:mesh.height*size});
      }
      biomeFor(theme).populate({index,length:CHUNK,road:DRIVABLE_HALF_WIDTH,random:r,add});
    }
    return actors;
  }
  function biomeActorPose(actor,time) {
    if(!actor.motion) return actor;
    const delta=actor.motion(time,actor.phase);
    const x=actor.x+(delta.x||0), z=actor.z+(delta.z||0);
    let y=actor.y;
    if((delta.x || delta.z) && actor.anchor!=='road') y=terrainHeightAt(x,z,actor.route)+actor.lift;
    return {...actor,x,y:y+(delta.y||0),z,yaw:actor.yaw+(delta.yaw||0),roll:delta.roll||0,pitch:delta.pitch||0};
  }
  window.BusRoute={CHUNK,LANE,ROAD,biomeFor,routeThemeAt,terrainScale,terrainHeight,terrainHeightAt,surfaceColorAt,shoulderColorAt,
    skylineScaleAt,themesInSection,isRoadsideActorVisible,roadsideScenery,biomeModelMesh,biomeActorsInSection,biomeActorPose};
})();
