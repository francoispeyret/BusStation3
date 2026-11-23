/* The career world uses metres, with north along -Z and east along +X. */
(() => {
  'use strict';

  const {Mesh, random, lettering, beam, threeGeometry} = window.BusMesh;
  const TAU = Math.PI * 2;
  const CREAM = '#fff0c5';
  const INK = '#283e50';
  const AQUA = '#359d96';
  const GOLD = '#ffcb64';

  const cityBiome = window.BusBiomes.definitions.get('city');
  const ruralBiome = window.BusBiomes.definitions.get('hills');
  const villageBiome = window.BusBiomes.definitions.get('village');
  const models = window.BusBiomes.models;

  function segmentDistance(x, y, road) {
    const dx = road.b.x - road.a.x, dy = road.b.y - road.a.y;
    const t = Math.max(0, Math.min(1, ((x-road.a.x)*dx + (y-road.a.y)*dy) / (dx*dx+dy*dy)));
    return Math.hypot(x-road.a.x-t*dx, y-road.a.y-t*dy) - road.width/2;
  }

  // Choose scenery lots once, keeping every road, junction and stop clear.
  // The same lots appear in both the 3D and overhead driving views.
  function layout(state) {
    const {roads, bounds, townEdge} = state.map, rand = random(3043), lots = [];
    const reserved = state.stops.map(s => ({x:s.x, y:s.y, radius:5.5}));
    for (const s of state.map.fuelStations) {
      reserved.push({x:s.x+6*Math.cos(s.heading), y:s.y+6*Math.sin(s.heading), radius:13});
    }
    function place(x,y,yaw,type,radius,variant,size) {
      if (roads.some(r => segmentDistance(x,y,r) < radius+(r.kind==='country'?r.vergeWidth:.65))) return;
      if (reserved.some(l => Math.hypot(x-l.x,y-l.y) < radius+l.radius)) return;
      reserved.push({x,y,radius});
      lots.push({x,y,yaw,type,variant,size});
    }
    // Place the station across the avenue and the mill beside its rural stop.
    for (const [id,type,offset,ahead] of [['gare','station',-34,24],['moulin','mill',14,15]]) {
      const stop=state.stops.find(s=>s.id===id);
      if(!stop) continue;
      const sx=Math.sin(stop.heading), cz=Math.cos(stop.heading);
      place(stop.x+cz*offset+sx*ahead,stop.y+sx*offset-cz*ahead,
        (offset<0?-Math.PI/2:Math.PI/2)-stop.heading,type,10,0,1);
    }
    for (const road of roads) {
      const dx = road.b.x-road.a.x, dy=road.b.y-road.a.y, len=Math.hypot(dx,dy);
      const ux=dx/len, uy=dy/len;
      for (const side of [-1,1]) {
        const nx=-uy*side, ny=ux*side, yaw=Math.atan2(nx,ny);
        for (let d=13+rand()*4; d<len-7; d+=17+rand()*7) {
          const rx=road.a.x+d*ux, ry=road.a.y+d*uy;
          const urban=rx<townEdge, roll=rand();
          const type=urban ? (roll<.75?'shop':'tree') : (roll<.16?'farmhouse':roll<.32?'field':'tree');
          const radius=type==='tree'?3:type==='field'?10:8;
          const offset=road.width/2+radius+(urban?3:road.vergeWidth)+rand()*(urban?2:6);
          place(rx+nx*offset,ry+ny*offset,yaw,type,radius,Math.floor(rand()*30),.86+rand()*.25);
        }
      }
    }
    for (let x=bounds.minX-40; x<bounds.maxX+40; x+=27) {
      for (let y=bounds.minY-40; y<bounds.maxY+40; y+=27) {
        const px=x+rand()*11, py=y+rand()*11, urban=px<townEdge;
        const roll=rand();
        const type=urban?(roll<.42?'shop':'tree'):(roll<.55?'tree':roll<.94?'field':'farmhouse');
        const radius=type==='tree'?3:type==='field'?10:8;
        place(px,py,0,type,radius,Math.floor(rand()*30),.83+rand()*.32);
      }
    }
    return lots;
  }

  function groundQuad(m,ax,ay,bx,by,width,height,color) {
    const len=Math.hypot(bx-ax,by-ay);
    if (!len) return;
    const nx=-(by-ay)/len*width/2, ny=(bx-ax)/len*width/2;
    m.quad([ax+nx,height,ay+ny],[bx+nx,height,by+ny],
      [bx-nx,height,by-ny],[ax-nx,height,ay-ny],color);
  }

  function roadMarkings({road,from,to},fill) {
    const {a,b,width}=road, dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
    const ux=dx/len, uy=dy/len, half=width/2, urban=road.kind==='city';
    const point=(d,off)=>[a.x+ux*d-uy*off,a.y+uy*d+ux*off];
    function stripe(start,end,offset,w,h,color) {
      if(end<=start) return;
      const left=offset+w/2, right=offset-w/2;
      fill([point(start,left),point(end,left),point(end,right),point(start,right)],color,h);
    }
    for (const side of [-1,1]) {
      stripe(from+1,to-1,side*(half-.24),.14,.061,'#f7db8c');
      if (urban) {
        stripe(from+1,to-1,side*(half+.19),.32,.049,'#f1e5c9');
        for (let d=from+4;d<to-2;d+=5) {
          stripe(d,d+.065,side*(half+1.6),2.35,.052,'#aaa99e');
        }
      }
    }
    for (let d=from+5;d<to-5;d+=9) {
      stripe(d,Math.min(d+3.3,to-5),0,.18,.069,'#f4ebc9');
    }
    if (urban && to-from>10) {
      for (const d of [from+2,to-4.6]) {
        for (let off=-half+1.1;off<half-.4;off+=1.45) stripe(d,d+2.6,off,.65,.068,'#e2dfd4');
      }
    }
  }

  function paintRoads(map,fill) {
    const {surfaces,segments}=window.CareerRoads.build(map);
    for(const {points,kind,material} of surfaces) {
      const biome=kind==='city'?cityBiome:ruralBiome;
      fill(points,biome[material],.035);
    }
    for(const segment of segments) roadMarkings(segment,fill);
  }

  function tree(m,variant) {
    const kind = variant % 4 === 0 ? 0 : 1 + variant % 2;
    window.BusCountryside.tree(m,0,0,5.8+variant%4,kind,random(variant+17));
  }

  function villageHouse(m,type,variant) {
    // The arcade facades face -X. Career lots face the street along -Z.
    const building = new Mesh();
    villageBiome.drawRoadside(building,{x:0,y:0,side:1,type,variant},0);
    m.instance(building,0,0,0,-Math.PI/2,1);
  }

  function shop(m,variant) {
    if (variant % 4 === 0) villageHouse(m,'shop',variant);
    else models.get('cityTower')(m,variant);
  }

  function farmhouse(m,variant) {
    villageHouse(m,'home',variant);
  }

  function field(m,variant) {
    const cols=['#d9ba71','#a9b66a','#c6ae7c','#91ae71'];
    groundQuad(m,0,-7.9,0,7.9,16,.084,cols[variant%4]);
    for(let i=-6;i<=6;i+=2) groundQuad(m,i,-7.7,i,7.7,.28,.10,variant%2?'#a0a25f':'#c29e64');
    for(let x=-8;x<=8;x+=4) m.box(x,0,-8,.18,1.1,.18,'#8a7658');
    m.box(0,.65,-8,16,.14,.12,'#aa926e');
    if (variant % 3 === 0) {
      const sheep = new Mesh();
      models.get('sheep')(sheep,variant);
      m.instance(sheep,2,.11,-4,1.35,1);
      m.instance(sheep,-1,.11,-3,-.7,.88);
    }
  }

  function station(m) {
    const stone='#dfbc91', brick='#ae7361', roof='#527882';
    m.box(0,0,0,18,.39,8.3,'#c5baa8');
    m.box(0,.39,0,17.8,5.42,8.2,stone);
    m.box(0,5.82,0,18.2,.3,8.6,'#efdbb5');
    for(const side of [-1,1]) {
      m.quad([-9.3,6.12,side*4.5],[9.3,6.12,side*4.5],[9.3,8.3,0],[-9.3,8.3,0],roof,side>0?.79:1);
      for(const x of [3.25,5.37,7.5]) {
        const col=side*x;
        m.box(col,.69,-4.13,1.43,2.51,.12,'#f1dbb4');
        m.box(col,.94,-4.21,1.12,2.11,.08,'#607d88');
        m.box(col,2.28,-4.26,1.13,.09,.05,CREAM);
      }
      m.box(side*7.0,.52,-5.31,.14,3.35,.14,'#4d6e71');
    }
    m.box(0,3.52,-4.87,16,.22,2.20,'#4d7880');
    m.box(0,3.74,-4.87,16.1,.18,2.3,'#89a8a2');
    m.box(0,0,-3.6,4.57,10.1,3.84,brick);
    m.box(0,9.74,-3.6,4.88,.37,4.1,'#ead1a8');
    m.rings(0,10.11,-3.6,[[3.35,0,3.06],[.24,2.18,.24]],4,roof,Math.PI/4);
    m.box(0,.36,-5.55,2.76,3.65,.13,'#e9d6b6');
    m.box(0,.42,-5.64,2.23,3.35,.08,'#435c69');
    m.box(0,.42,-5.71,.10,3.35,.05,'#ccb692');
    const clock=new Mesh();
    disk(clock,0,7.93,1.28,28,'#816757');
    disk(clock,.025,7.93,1.09,28,CREAM);
    for(let i=0;i<12;i++) {
      const a=i*TAU/12, dx=Math.sin(a),dy=Math.cos(a);
      beam(clock,[dx*.86,7.93+dy*.86,.042],[dx*.96,7.93+dy*.96,.042],.026,.026,'#526671');
    }
    beam(clock,[0,7.93,.075],[-.56,8.25,.075],.04,.055,INK);
    beam(clock,[0,7.93,.075],[.42,8.58,.075],.036,.041,INK);
    m.instance(clock,0,0,-5.56,Math.PI,1);
    m.box(0,4.24,-5.62,4.45,1.52,.16,roof);
    lettering(m,'GARE',0,5.49,-5.71,.16,CREAM,-1);
  }

  // Local X points away from the road. The marked bay at the origin is wide
  // enough for the bus; pumps, posts and the kiosk stand beyond that bay.
  function fillingStation(s) {
    const m=new Mesh(), colour=s.id==='centre'?'#237c7c':'#bf6949';
    const bay='#979690', metal='#e7dfc4';
    groundQuad(m,5.25,-8.1,5.25,8.1,14,.087,bay);
    for(const z of [-5.6,5.6]) {
      groundQuad(m,-1.25,z,1.55,z,.15,.097,CREAM);
      groundQuad(m,1.55,z,1.55,z-Math.sign(z)*1.3,.15,.098,CREAM);
    }
    // Compact glazed kiosk beside a cantilevered pump canopy.
    m.box(10,.09,0,4.2,3.05,9,'#e6d6a7');
    m.box(7.87,.79,-1.85,.08,1.75,3,'#527f8c');
    m.box(7.87,.22,1.35,.08,2.3,1.45,'#49727d');
    m.box(9.9,3.14,0,4.6,.38,9.35,colour);
    for(const z of [-3.4,3.4]) {
      m.box(6.8,.09,z,.39,4.68,.39,'#7e918f');
      m.box(3.65,.09,z,1.65,.22,1.52,metal);
      m.box(3.65,.31,z,.87,1.53,.89,colour);
      m.box(3.65,1.84,z,.97,.71,.99,metal);
      m.box(3.151,2.01,z,.028,.31,.63,'#293e46');
      beam(m,[3.45,1.11,z+.47],[3.35,.68,z+.68],.07,.07,INK);
      beam(m,[3.35,.68,z+.68],[3.40,1.87,z+.52],.07,.06,INK);
    }
    m.box(5,4.74,0,7.4,.22,12.2,metal);
    m.box(5,4.96,0,7.5,.52,12.3,colour);
    m.box(5,5.48,0,7.55,.12,12.35,GOLD);
    // The sign faces drivers arriving from either end of the street.
    m.box(3,.09,7.45,.36,3.7,.36,'#526665');
    m.box(3,3.75,7.45,3.15,1.32,.32,colour);
    for(const side of [-1,1]) {
      lettering(m,'ESSENCE',3,4.63,7.45+side*.17,.095,CREAM,side);
      lettering(m,s.id==='centre'?'CENTRE':'VERGERS',5,5.42,side*6.17,.08,CREAM,side);
    }
    return m;
  }

  function mill(m) {
    m.rings(0,0,0,[[3.18,0,3.18],[2.0,8.8,2]],12,'#e2caa3');
    m.rings(0,8.8,0,[[2.64,0,2.64],[.13,2.0,.13]],12,'#915a4d');
    m.box(0,.18,-3.0,1.36,2.39,.15,'#6d5e51');
    const z=-2.35, y=7.55;
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2+.53,dx=Math.cos(a),dy=Math.sin(a);
      const point=(r,side)=>[dx*r-dy*side,y+dy*r+dx*side,z];
      beam(m,point(.1,0),point(5.9,0),.10,.07,'#775b47');
      m.quad(point(1.65,.08),point(5.86,.08),point(5.62,.89),point(1.88,.56),'#efdfb9');
      for(let r=2.35;r<5.65;r+=.88) beam(m,point(r,.06),point(r,.78),.022,.02,'#a58f6c');
    }
  }

  function stopFurniture(m,index) {
    // Local +X is the pavement side and local +Z faces approaching vehicles.
    m.box(1.35,.08,1.7,3.3,.14,6.7,'#dbcdb0');
    for(const z of [-.8,3.45]) m.box(2.75,.18,z,.15,2.7,.15,'#3b6868');
    m.box(2.67,.42,1.32,.11,2.22,4.18,'#96b6af');
    m.box(2.58,.65,1.32,.065,.085,4.23,'#e6d8b7');
    m.box(2.58,1.7,1.32,.065,.085,4.23,'#e6d8b7');
    m.box(1.9,2.86,1.32,2.5,.21,5.0,'#347d77');
    m.box(1.9,3.07,1.32,2.52,.09,5.02,'#88b6a5');
    const bench = new Mesh();
    models.get('cityBench')(bench);
    m.instance(bench,2,.22,1.32,0,1.35);
    m.box(0,.08,0,.13,3.65,.13,'#3a5b5e');
    m.box(0,2.7,0,1.05,1.13,.17,INK);
    for(const side of [-1,1]) {
      const face=side*.092;
      m.box(0,2.84,face,.78,.81,.026,AQUA);
      m.box(0,3.15,face+side*.021,.51,.25,.025,CREAM);
      m.box(0,2.97,face+side*.021,.55,.17,.025,CREAM);
      for(const x of [-.17,.17]) m.box(x,2.92,face+side*.02,.095,.11,.03,CREAM);
    }
    const plaque=String(index+1).padStart(2,'0');
    m.box(0,3.82,0,1.05,.48,.15,GOLD);
    for(const side of [-1,1]) lettering(m,plaque,0,4.19,side*.079,.049,INK,side);
    // Yellow dashed kerb markings frame the usable stopping area.
    for(let z=-5.8;z<6;z+=2.1) groundQuad(m,-1.3,z,-1.3,z+1.3,.20,.078,GOLD);
  }

  function disk(m,z,y,r,n,col,angle=0) {
    for(let i=0;i<n;i++) {
      const a=angle+i*TAU/n,b=angle+(i+1)*TAU/n;
      m.tri([0,y,z],[r*Math.cos(a),y+r*Math.sin(a),z],[r*Math.cos(b),y+r*Math.sin(b),z],col);
    }
  }

  function signModel(kind) {
    const m=new Mesh(), y=2.83;
    m.box(0,0,0,.12,y,.12,'#6c7b76');
    if(kind==='stop') {
      disk(m,0,y,.65,8,'#e9e5cd',Math.PI/8);
      disk(m,.011,y,.57,8,'#c94e45',Math.PI/8);
      lettering(m,'STOP',0,y+.11,.018,.044,CREAM);
    } else if(kind==='crossing') {
      m.box(0,y-.47,0,.96,.96,.12,'#4589a6');
      m.tri([-.36,y-.28,.068],[.36,y-.28,.068],[0,y+.32,.068],CREAM);
      beam(m,[-.13,y-.20,.077],[.04,y+.10,.077],.04,.055,INK);
      beam(m,[-.02,y-.05,.077],[.11,y-.21,.077],.035,.04,INK);
    } else {
      disk(m,0,y,.56,20,'#c54f48');
      disk(m,.009,y,.445,20,'#fff2d7');
      lettering(m,kind==='speed30'?'30':'50',0,y+.17,.016,.065,INK);
    }
    return m;
  }

  function signalModel(aspect) {
    const m=new Mesh();
    m.box(0,0,0,.15,2.95,.15,'#576c6e');
    m.box(0,2.5,0,.57,1.52,.31,'#293d49');
    for(const [i,a] of ['green','amber','red'].entries()) {
      const c=a===aspect?{green:'#66e0a0',amber:'#ffd466',red:'#ff705b'}[a]:'#455453';
      const first=m.data.length;
      disk(m,.164,2.79+i*.465,.181,12,c);
      if(a===aspect) for(let k=first+3;k<m.data.length;k+=6) m.data[k]+=8;
      m.box(0,3.0+i*.465,.115,.48,.055,.36,'#354a51');
    }
    return m;
  }

  function carModel(color) {
    const m=new Mesh(); // front at -Z
    m.box(0,.3,0,1.82,.56,4.25,color);
    m.box(0,.86,.12,1.58,.70,2.23,'#3f606c');
    m.box(0,1.52,.16,1.56,.13,1.99,color);
    m.box(0,.99,-1.006,1.4,.48,.05,'#90afb2');
    m.box(0,1.03,1.252,1.38,.39,.04,'#81a0a9');
    for(const side of [-1,1]) {
      for(const z of [-1.39,1.43]) m.box(side*.86,.13,z,.23,.59,.66,'#35414b');
      const head=m.data.length;
      m.box(side*.74,.60,-2.14,.29,.15,.065,'#ffedb3');
      const tail=m.data.length;
      m.box(side*.72,.60,2.14,.3,.17,.06,'#f37968');
      for(let k=head+3;k<m.data.length;k+=6) m.data[k]+=k<tail?2:4;
      m.box(side*.807,.9,.15,.07,.61,.10,color);
    }
    return m;
  }

  function serviceLight(time) {
    const period=time/60;
    return window.BusSky.lighting(Math.floor(period),period%1,.16);
  }

  function conePose(cone,time) {
    const hit=cone.hit;
    if(!hit) return {x:cone.x,y:cone.y,heading:cone.heading,lift:0,pitch:0,roll:0,alpha:1};
    const age=time-hit.start;
    if(age>=hit.duration) return null;
    const f=window.BusCone.flight(age/hit.duration,age,hit.side,hit.speed,hit.toVerge);
    const sx=Math.sin(hit.heading),cz=Math.cos(hit.heading);
    return {x:cone.x+f.across*cz+f.forward*sx, y:cone.y+f.across*sx-f.forward*cz,
      heading:hit.heading+f.turn, lift:f.lift, pitch:f.pitch, roll:f.roll, alpha:f.alpha};
  }

  const suspensionPivot=.8;
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const boost=window.BusBoost;

  function coachHalo(remaining) {
    const age=boost.duration-remaining;
    if(age>=boost.haloDuration) return null;
    const ring=boost.halo(age/boost.haloDuration);
    // The career chassis scales each vehicle to the same 2.7 x 9.2 metre footprint.
    return {width:ring.width*2.7/2.37, length:ring.length*9.2/5.23, opacity:ring.light*.92};
  }

  function careerCoach(busId,lowDetail=false) {
    const fleet=window.BusModels;
    const coach=fleet.models.find(model=>model.id===busId)||fleet.models[0];
    const {body,wheels}=fleet.parts(coach.id,lowDetail);
    const sx=2.7/coach.width, sy=1.08, sz=9.2/coach.length;
    const baseY=.035-(wheels[0].y-wheels[0].radius)*sy;
    return {coach,body,sx,sy,sz,baseY,wheels:wheels.map(w=>({...w,
      x:w.x*sx,y:w.y*sy,z:-w.z*sz,radius:w.radius*sy}))};
  }

  function suspension(bus) {
    const m=bus.motion, amount=reducedMotion?.matches ? .15 : 1;
    return {pitch:m.pitch*amount,roll:m.roll*amount,heave:m.heave*amount,
      sway:m.sway*amount,yaw:m.yaw*amount};
  }

  function threeView(canvas,busId) {
    const T=window.THREE;
    if (!T) return null;
    let renderer;
    try { renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}); }
    catch { return null; }
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(57,1,.18,770);
    const sky=window.BusSky.createSky(T,scene);
    const lighting=window.BusThreeLighting.create(T,scene,renderer,{BEND_START:0,BEND_RATE:0,FAR:288,fixedWorld:true});
    const {material}=lighting;
    const geometries=new Map(), dynamic=new Map(), coneFades=new Map();
    function asset(key,build) {
      if(!geometries.has(key)) geometries.set(key,threeGeometry(T,build()));
      return geometries.get(key);
    }
    const world=new T.Group();
    scene.add(world);
    function place(g,x,y,z,yaw=0,size=1) {
      const obj=new T.Mesh(g,material);
      obj.castShadow=obj.receiveShadow=true;
      obj.position.set(x,y,z);
      obj.rotation.y=yaw;
      obj.scale.setScalar(size);
      obj.updateMatrix();
      obj.matrixAutoUpdate=false;
      world.add(obj);
      return obj;
    }
    const rig=careerCoach(busId), {coach,sx,sy,sz}=rig;
    const chassis=new T.Group(), suspensionMount=new T.Group();
    scene.add(chassis); chassis.add(suspensionMount);
    const body=new T.Mesh(asset('coach',()=>rig.body),material);
    body.scale.set(sx,sy,-sz);
    body.position.y=-suspensionPivot;
    body.castShadow=body.receiveShadow=true;
    suspensionMount.add(body);
    const wheels=rig.wheels.map((wheel,i)=>{
      const pivot=new T.Group(), tyre=new T.Mesh(asset('wheel'+i,()=>wheel.mesh),material);
      pivot.position.set(wheel.x,wheel.y,wheel.z);
      // Stretch the wheelbase with the coach, while keeping the rolling tyres round.
      tyre.scale.set(sx,sy,-sy);
      tyre.castShadow=tyre.receiveShadow=true;
      pivot.add(tyre); chassis.add(pivot);
      return {pivot,tyre,front:wheel.front};
    });
    const bodyOrigin=new T.Vector3();
    const lampPosition=point=>[point[0]*sx,point[1]*sy,point[2]*sz];
    const lamps={headlamp:lampPosition(coach.headlamp),taillamp:lampPosition(coach.taillamp)};
    const doorstep=new Mesh();
    doorstep.box(1.35,.28,-2.25,.57,.11,1.32,'#f0bd5d');
    const step=new T.Mesh(asset('door',()=>doorstep),material);
    step.castShadow=step.receiveShadow=true;
    step.position.y=-suspensionPivot;
    suspensionMount.add(step);
    const streak=new T.Mesh(asset('boostTrail',boost.trail),material);
    streak.scale.set(sx,1,-sz);
    streak.receiveShadow=true;
    chassis.add(streak);
    const haloMaterial=lighting.createMaterial({transparent:true});
    const halo=new T.Mesh(asset('boostHalo',()=>{
      const mesh=new Mesh();
      mesh.ring(.89,'#ffd879');
      return mesh;
    }),haloMaterial);
    chassis.add(halo);
    const labels=[];
    function stopName(s) {
      const surface=document.createElement('canvas');
      surface.width=512; surface.height=78;
      const ctx=surface.getContext('2d');
      ctx.fillStyle='#225f5f'; ctx.fillRect(0,0,512,78);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=CREAM; ctx.font='bold 40px sans-serif';
      ctx.fillText(s.name,256,41,467);
      const texture=new T.CanvasTexture(surface);
      texture.colorSpace=T.SRGBColorSpace;
      const mat=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
      const geom=new T.PlaneGeometry(3.9,.60);
      const name=new T.Mesh(geom,mat);
      // The fascia runs along the pavement and faces the carriageway.
      const dir=-s.heading;
      const offset=new T.Vector3(.62,2.86,1.32).applyAxisAngle(new T.Vector3(0,1,0),dir);
      name.position.set(s.x+offset.x,offset.y,s.y+offset.z);
      name.rotation.y=dir-Math.PI/2;
      world.add(name);
      labels.push({texture,mat,geom});
    }
    let initialized=false, cameraHeading=0, previousTime=null;
    function init(state,lots) {
      const {map}=state, {bounds}=map;
      const base=new Mesh(), roads=new Mesh();
      const cx=(bounds.minX+bounds.maxX)/2, cy=(bounds.minY+bounds.maxY)/2;
      const mapWidth=bounds.maxX-bounds.minX, mapHeight=bounds.maxY-bounds.minY;
      const horizonMargin=300;
      groundQuad(base,cx,bounds.minY-horizonMargin,cx,bounds.maxY+horizonMargin,
        mapWidth+2*horizonMargin,-.045,ruralBiome.grass);
      camera.far=Math.hypot(mapWidth,mapHeight)+2*horizonMargin;
      camera.updateProjectionMatrix();
      groundQuad(base,bounds.minX-140,bounds.minY-66,bounds.minX-140,bounds.maxY+66,
        Math.max(1,2*(map.townEdge-bounds.minX+140)),-.025,cityBiome.grass);
      const fieldTones=['#b7c878','#cabc86','#99b780','#bec98b','#cdbc78'];
      const landscape=random(232);
      for(let x=map.townEdge+7;x<bounds.maxX+75;x+=54) {
        for(let y=bounds.minY-38;y<bounds.maxY+70;y+=40) {
          const width=46+landscape()*5;
          groundQuad(base,x+width/2,y+2,x+width/2,y+36,width,-.018,
            fieldTones[Math.floor(landscape()*fieldTones.length)]);
        }
      }
      place(asset('floor',()=>base),0,0,0);
      paintRoads(map,(points,color,height)=>{
        const vertices=points.map(([x,z])=>[x,height,z]);
        for(let i=1;i<vertices.length-1;i++) roads.tri(vertices[0],vertices[i],vertices[i+1],color);
      });
      place(asset('roads',()=>roads),0,0,0);
      // Each edge faces the same arcade mountain range outside the road network.
      const mountains=asset('skyline',window.BusSky.backdrop);
      for(let i=0;i<4;i++) {
        const angle=i*Math.PI/2;
        const edge=i%2 ? bounds.maxX-cx : bounds.maxY-cy;
        const horizon=place(mountains,cx+Math.sin(angle)*edge,-6,cy+Math.cos(angle)*edge,angle);
        // The shared panorama spans about 800 m across in its own frame.
        horizon.scale.x=Math.max(1,((i%2 ? mapHeight : mapWidth)+2*horizonMargin)/800);
        horizon.updateMatrix();
        horizon.castShadow=horizon.receiveShadow=false;
        horizon.material=lighting.backdropMaterial;
        horizon.renderOrder=-100;
      }
      // Upload fixed scenery in street-sized tiles. Both VSM cameras and the
      // driving camera can cull tiles without a draw call per tree or façade.
      const tiles=new Map(), prototypes=new Map();
      function addToTile(model,x,z,yaw,size=1) {
        const ox=Math.floor(x/48)*48, oz=Math.floor(z/48)*48, key=ox+','+oz;
        if(!tiles.has(key)) tiles.set(key,{model:new Mesh(),x:ox,z:oz});
        tiles.get(key).model.instance(model,x-ox,0,z-oz,yaw,size);
      }
      const builders={tree,shop,farmhouse,field,station,mill};
      for(const l of lots) {
        const variant=l.variant%(l.type==='shop'?12:6);
        const key=l.type+variant;
        if(!prototypes.has(key)) {
          const m=new Mesh();
          builders[l.type](m,variant);
          prototypes.set(key,m);
        }
        addToTile(prototypes.get(key),l.x,l.y,l.yaw,l.size);
      }
      const lamppost=new Mesh();
      models.get('cityLamp')(lamppost);
      for(const r of map.roads) {
        if(r.kind!=='city') continue;
        const dx=r.b.x-r.a.x,dy=r.b.y-r.a.y,len=Math.hypot(dx,dy);
        for(let d=16, side=1;d<len-11;d+=25,side=-side) {
          const right=side*(r.width/2+1.72),x=r.a.x+(d*dx-dy*right)/len,y=r.a.y+(d*dy+dx*right)/len;
          if([...state.stops,...state.lights,...state.signs].some(s=>Math.hypot(x-s.x,y-s.y)<5)
            || map.fuelStations.some(s=>Math.hypot(x-s.x,y-s.y)<11)) continue;
          addToTile(lamppost,x,y,Math.atan2(-dx*side,-dy*side));
        }
      }
      state.stops.forEach((s,i)=>{
        const m=new Mesh();
        stopFurniture(m,i);
        addToTile(m,s.x,s.y,-s.heading);
        stopName(s);
      });
      for(const s of state.signs) addToTile(signModel(s.kind),s.x,s.y,-s.heading);
      for(const s of map.fuelStations) addToTile(fillingStation(s),s.x,s.y,-s.heading);
      for(const [key,tile] of tiles) place(asset('tile'+key,()=>tile.model),tile.x,0,tile.z);
      previousTime=null;
      initialized=true;
    }
    function actor(id,g,x,y,z,heading) {
      let obj=dynamic.get(id);
      if(!obj) {
        obj=new T.Mesh(g,material);
        obj.castShadow=obj.receiveShadow=true;
        scene.add(obj); dynamic.set(id,obj);
      }
      obj.geometry=g; obj.position.set(x,y,z); obj.rotation.y=-heading; obj.visible=true;
      return obj;
    }
    function passenger(p,heading,walking,time) {
      const variant=p.id%3;
      const geometry=asset('walker'+p.color+variant,()=>{
        const model=new Mesh();
        models.get('walker')(model,variant,p.color);
        return model;
      });
      const step=walking ? .045*Math.abs(Math.sin(time*6+p.id)) : 0;
      // The shared walker faces +Z while career headings point north along -Z.
      actor('p'+p.id,geometry,p.x,.22+step,p.y,heading+Math.PI);
    }
    const target=new T.Vector3();
    const context=renderer.getContext();
    const viewport=context.getParameter(context.MAX_VIEWPORT_DIMS);
    const limit=context.getParameter(context.MAX_RENDERBUFFER_SIZE);
    const sight=new T.Vector3();
    function draw(state,lots) {
      if(!initialized) init(state,lots);
      const w=canvas.clientWidth,h=canvas.clientHeight;
      if(!w||!h) return;
      const settings=window.BusSettings.current;
      const scale=Math.min(settings.resolutionScale,limit/w,limit/h,viewport[0]/w,viewport[1]/h);
      const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
      if(canvas.width!==width||canvas.height!==height) renderer.setSize(width,height,false);
      if(camera.aspect!==w/h) { camera.aspect=w/h; camera.updateProjectionMatrix(); }
      const b=state.bus;
      const dt=previousTime===null ? 0 : Math.max(0,Math.min(.12,state.time-previousTime));
      if(previousTime===null || state.time<previousTime) cameraHeading=b.heading;
      else cameraHeading+=Math.atan2(Math.sin(b.heading-cameraHeading),Math.cos(b.heading-cameraHeading))*(1-Math.exp(-dt*7.2));
      previousTime=state.time;
      const sx=Math.sin(cameraHeading), cz=Math.cos(cameraHeading);
      const portrait=w<h, back=(portrait?19:15.6)+Math.min(2,Math.abs(b.speed)*.05);
      const lateral=portrait?2.75:3.1, eyeHeight=portrait?9.3:7.35;
      camera.position.set(b.x-sx*back+cz*lateral,eyeHeight,b.y+cz*back+sx*lateral);
      target.set(b.x+sx*(portrait?4.0:6.0),1.10,b.y-cz*(portrait?4.0:6.0));
      camera.lookAt(target);
      sight.subVectors(target,camera.position);
      const cam={a:Math.atan2(sight.x,-sight.z),pitch:Math.atan2(-sight.y,Math.hypot(sight.x,sight.z)),
        f:1/Math.tan(T.MathUtils.degToRad(camera.fov/2)),aspect:camera.aspect};
      const light=serviceLight(state.time);
      sky.update(cam,light);
      chassis.position.set(b.x,rig.baseY,b.y);
      chassis.rotation.y=-b.heading;
      for(const wheel of wheels) {
        if(wheel.front) wheel.pivot.rotation.y=-b.motion.wheelAngle;
        wheel.tyre.rotation.x=-b.motion.wheelSpin;
      }
      const motion=suspension(b);
      suspensionMount.position.set(motion.sway,suspensionPivot+motion.heave,0);
      suspensionMount.rotation.set(motion.pitch,-motion.yaw,-motion.roll,'YZX');
      body.getWorldPosition(bodyOrigin);
      // The shared lighting takes the same body transform in a +Z-forward frame.
      lighting.update({light,cam,bus:lamps,pose:{x:bodyOrigin.x,y:bodyOrigin.y,z:-bodyOrigin.z,
        pitch:-motion.pitch,yaw:b.heading+motion.yaw,roll:-motion.roll},
        d:0,time:state.time,lapBiomes:state.map,busOpacity:1,level:window.BusSky.graphicsLevels[settings.detail]});
      for(const label of labels) label.mat.color.fromArray(light.tint).convertSRGBToLinear();
      step.visible=state.doorsOpen;
      streak.visible=state.boost>0;
      const ring=streak.visible && coachHalo(state.boost);
      halo.visible=!!ring;
      if(streak.visible) {
        const tail=boost.trailPosition(coach.taillamp[2],state.time);
        streak.position.set(0,.095-rig.baseY,-tail*sz);
        if(ring) {
          halo.position.y=.10-rig.baseY;
          halo.scale.set(ring.width,1,ring.length);
          haloMaterial.opacity=ring.opacity;
        }
      }
      for(const obj of dynamic.values()) obj.visible=false;
      for(const pickup of state.boosts) {
        if(pickup.respawnAt) continue;
        const hover=boost.hover(state.time,pickup.x+pickup.y);
        actor('boost'+pickup.id,asset('boost',boost.model),pickup.x,.08+hover.lift,pickup.y,pickup.heading+hover.turn);
      }
      for(const [i,s] of state.lights.entries()) {
        actor('light'+i,asset('light'+s.aspect,()=>signalModel(s.aspect)),s.x,0,s.y,s.heading);
      }
      for(const c of state.cars) actor('car'+c.id,asset('car'+c.color,()=>carModel(c.color)),c.x,.10,c.y,c.heading);
      for(const cone of state.cones) {
        const p=conePose(cone,state.time);
        if(!p) continue;
        const obj=actor('cone'+cone.id,asset('cone',window.BusCone.model),p.x,.08+p.lift,p.y,p.heading);
        obj.rotation.set(-p.pitch,-p.heading,p.roll,'YZX');
        if(p.alpha<1) {
          if(!coneFades.has(cone.id)) coneFades.set(cone.id,lighting.createMaterial({transparent:true}));
          obj.material=coneFades.get(cone.id);
          obj.material.opacity=p.alpha;
        } else obj.material=material;
        obj.castShadow=p.alpha>.4;
      }
      for(const s of state.stops) for(const p of s.waiting) passenger(p,s.heading-Math.PI/2,false,state.time);
      for(const p of state.people) {
        const heading=Math.atan2(p.end.x-p.start.x,p.start.y-p.end.y);
        passenger(p,heading,true,state.time);
      }
      // Retire models of boarded passengers. Cars, signals and waiting people remain pooled by id.
      for(const [id,obj] of dynamic) if(!obj.visible) { scene.remove(obj); dynamic.delete(id); }
      renderer.render(scene,camera);
    }
    function dispose() {
      for(const g of geometries.values()) g.dispose();
      for(const fade of coneFades.values()) fade.dispose();
      haloMaterial.dispose();
      for(const l of labels) {l.texture.dispose(); l.mat.dispose(); l.geom.dispose();}
      lighting.dispose(); sky.dispose(); renderer.dispose();
      dynamic.clear(); geometries.clear();
    }
    return {draw,dispose,mode:'3d'};
  }

  function surface(canvas,dpr=Math.min(window.devicePixelRatio||1,2)) {
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(!w||!h) return null;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)) {
      canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    }
    const ctx=canvas.getContext('2d');
    if(!ctx) return null;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,w,h};
  }

  function line(ctx,a,b,width,color) {
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
    ctx.lineWidth=width; ctx.strokeStyle=color; ctx.stroke();
  }
  function dot(ctx,x,y,r,color) {
    ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fillStyle=color; ctx.fill();
  }
  function rect(ctx,x,y,w,h,color) {
    ctx.fillStyle=color; ctx.fillRect(x,y,w,h);
  }
  function polygon(ctx,points,color) {
    ctx.beginPath();
    for(const [i,p] of points.entries()) {
      if(i===0) ctx.moveTo(...p); else ctx.lineTo(...p);
    }
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  }
  function fuelPin(ctx,x,y,radius) {
    ctx.save(); ctx.translate(x,y); ctx.scale(radius,radius);
    dot(ctx,0,0,1,INK); dot(ctx,0,0,.86,'#ffd16c');
    ctx.lineWidth=.13; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle=INK;
    ctx.beginPath();
    ctx.moveTo(.13,-.06); ctx.lineTo(.33,-.06); ctx.lineTo(.33,.27);
    ctx.quadraticCurveTo(.5,.45,.52,.2); ctx.lineTo(.52,-.17); ctx.lineTo(.34,-.38);
    ctx.stroke();
    rect(ctx,-.48,-.51,.64,.96,INK); rect(ctx,-.34,-.35,.36,.28,'#ffd16c');
    rect(ctx,-.56,.39,.8,.13,INK);
    ctx.restore();
  }
  function vehicleBody(ctx,w,h,body,bus=false) {
    rect(ctx,-w/2,-h/2,w,h,body);
    rect(ctx,-w*.41,-h*.42,w*.82,h*.18,'#4e7282');
    rect(ctx,-w*.41,h*.25,w*.82,h*.13,'#719ca5');
    rect(ctx,-w*.42,-h*.16,w*.84,h*.34,bus?'#e7d4b3':body);
    if(bus) {
      rect(ctx,-w*.29,-h*.10,w*.56,h*.10,'#b19066');
      rect(ctx,-w*.28,h*.08,w*.55,h*.08,'#77a296');
    }
  }
  function overheadWheels(ctx,bus,wheels) {
    ctx.save(); ctx.translate(bus.x,bus.y); ctx.rotate(bus.heading);
    rect(ctx,-1.17,-4.3,2.34,8.6,'#43515a');
    for(const wheel of wheels) {
      ctx.save(); ctx.translate(wheel.x,wheel.z);
      if(wheel.front) ctx.rotate(bus.motion.wheelAngle);
      rect(ctx,-.18,-wheel.radius,.36,2*wheel.radius,'#293941');
      const tread=.76*wheel.radius*Math.sin(bus.motion.wheelSpin);
      rect(ctx,-.15,tread-.055,.30,.11,'#65716f');
      ctx.restore();
    }
    ctx.restore();
  }
  function overhead(canvas,busId) {
    let cachedMap, roadPaths;
    const footprints={tree:[3,3,6],tower:[9,10,19],shop:[9,6,7],station:[18,9,9],
      farmhouse:[7.4,6,6],mill:[6,6,10]};
    const busColor=({alpin:'#d96b59',lagon:'#66b3a7',ecolier:'#e8b44c',
      nocturne:'#7385a4',imperiale:'#b95655'})[busId]||'#d96b59';
    const rig=careerCoach(busId,true), {coach}=rig;
    const roofHeight=coach.height*rig.sy, roofArm=roofHeight-suspensionPivot;
    const lampZ=coach.headlamp[2]*rig.sz, lampHeight=coach.headlamp[1]*rig.sy;
    const beamSlices=[-1,1].map(side=>Array.from({length:33},(_,i)=>{
      const f=56*i/32;
      return {x:side*(coach.headlamp[0]*rig.sx+.055*f),z:f+lampZ,
        width:.26+.18*f,power:window.BusThreeLighting.beamPower(f,-rig.baseY-lampHeight)};
    }));
    const beamPaths=new Map();
    function headlightFootprint(layers) {
      if(!beamPaths.has(layers)) {
        const paths=[];
        for(const slices of beamSlices) window.BusThreeLighting.beamContours(slices,layers,1,0,()=>0,outline=>{
          const path=new Path2D();
          for(const [x,,z] of outline) path.lineTo(x,-z);
          path.closePath(); paths.push(path);
        });
        beamPaths.set(layers,paths);
      }
      return beamPaths.get(layers);
    }
    function draw(state,lots) {
      const s=surface(canvas,window.BusSettings.current.resolutionScale);
      if(!s) return;
      const {ctx,w,h}=s, b=state.bus, px=Math.max(3.7,Math.min(w/58,h/63,11));
      const motion=suspension(b), ct=Math.cos(b.heading), st=Math.sin(b.heading);
      const roofX=motion.sway+roofArm*Math.sin(motion.roll);
      const roofY=roofArm*Math.sin(motion.pitch)-motion.heave*.45;
      const bodyX=b.x+ct*roofX-st*roofY, bodyY=b.y+st*roofX+ct*roofY;
      const bodyHeading=b.heading+motion.yaw;
      rect(ctx,0,0,w,h,ruralBiome.grass);
      ctx.save(); ctx.translate(w/2,h*.68); ctx.scale(px,px); ctx.rotate(-b.heading); ctx.translate(-b.x,-b.y);
      rect(ctx,state.map.bounds.minX-120,state.map.bounds.minY-120,
        state.map.townEdge-state.map.bounds.minX+120,state.map.bounds.maxY-state.map.bounds.minY+240,cityBiome.grass);
      ctx.lineCap='square';
      if(cachedMap!==state.map) {
        roadPaths=new Map();
        paintRoads(state.map,(points,color)=>{
          if(!roadPaths.has(color)) roadPaths.set(color,new Path2D());
          const path=roadPaths.get(color);
          path.moveTo(...points[0]);
          for(let i=1;i<points.length;i++) path.lineTo(...points[i]);
          path.closePath();
        });
        cachedMap=state.map;
      }
      for(const [color,path] of roadPaths) { ctx.fillStyle=color; ctx.fill(path); }
      for(const s of state.map.fuelStations) {
        ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.heading);
        rect(ctx,-1.75,-8.1,14,16.2,'#979690');
        for(const z of [-5.6,5.6]) {
          rect(ctx,-1.25,z-.075,2.8,.15,CREAM);
          rect(ctx,1.48,z>0?z-1.3:z,.15,1.3,CREAM);
        }
        ctx.restore();
      }
      const light=serviceLight(state.time);
      const dir=light.direction, rayX=-dir.x/dir.y, rayY=dir.z/dir.y;
      const viewRange=Math.hypot(w,h)/px;
      // Each roof and its projected footprint form one convex shadow on the flat map.
      function shadow(x,y,yaw,width,length,height) {
        const cs=Math.cos(yaw), sn=Math.sin(yaw);
        const dx=height*(cs*rayX+sn*rayY), dy=height*(-sn*rayX+cs*rayY);
        const edges=[dy<0,dx>0,dy>0,dx<0], hw=width/2, hl=length/2;
        ctx.beginPath();
        for(let i=0;i<4;i++) {
          const left=i===0||i===3 ? -hw : hw, top=i<2 ? -hl : hl;
          for(const shifted of [edges[(i+3)%4],edges[i]]) {
            const u=left+(shifted?dx:0), v=top+(shifted?dy:0);
            ctx.lineTo(x+cs*u-sn*v,y+sn*u+cs*v);
          }
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle='#313b52';
      ctx.globalAlpha=.44*light.shadow;
      for(const lot of lots) {
        if(lot.type==='field'||Math.hypot(lot.x-b.x,lot.y-b.y)>viewRange+130) continue;
        const dims=footprints[lot.type==='shop' && lot.variant%4!==0 ? 'tower' : lot.type];
        shadow(lot.x,lot.y,-lot.yaw,dims[0]*lot.size,dims[1]*lot.size,dims[2]*lot.size);
      }
      const cones=state.cones.map(cone=>conePose(cone,state.time)).filter(Boolean);
      for(const p of state.boosts) {
        if(p.respawnAt) continue;
        const height=1.05+boost.hover(state.time,p.x+p.y).lift;
        shadow(p.x+rayX*height,p.y+rayY*height,p.heading,1.12,.28,.6);
      }
      for(const p of cones) {
        ctx.globalAlpha=.44*light.shadow*p.alpha;
        shadow(p.x+rayX*p.lift,p.y+rayY*p.lift,p.heading,.95,.9,1.15);
      }
      ctx.globalAlpha=.44*light.shadow;
      for(const c of state.cars) shadow(c.x,c.y,c.heading,1.82,4.25,1.6);
      for(const stop of state.stops) {
        shadow(stop.x+1.9*Math.cos(stop.heading),stop.y+1.9*Math.sin(stop.heading),stop.heading,2.2,5,2.9);
        for(const p of stop.waiting) shadow(p.x,p.y,0,.45,.35,1.7);
      }
      for(const s of state.map.fuelStations) {
        shadow(s.x+5*Math.cos(s.heading),s.y+5*Math.sin(s.heading),s.heading,7.55,12.35,5.6);
      }
      for(const p of state.people) shadow(p.x,p.y,0,.45,.35,1.7);
      shadow(bodyX,bodyY,bodyHeading,2.7,9.2,roofHeight+rig.baseY+motion.heave);
      ctx.globalAlpha=1;
      for(const l of lots) {
        if(Math.hypot(l.x-b.x,l.y-b.y)>Math.hypot(w,h)/px+12) continue;
        ctx.save(); ctx.translate(l.x,l.y); ctx.rotate(-l.yaw); ctx.scale(l.size,l.size);
        if(l.type==='tree') {
          dot(ctx,.65,.8,2.6,'#8aa17b'); dot(ctx,0,0,2.3,l.variant%2?'#699063':'#819c5d');
          dot(ctx,-.36,-.43,1.66,l.variant%2?'#84a36e':'#9eaf6e');
        } else if(l.type==='field') {
          rect(ctx,-7.8,-7.8,15.6,15.6,'#c4ac72');
          for(let i=-6;i<=6;i+=2) rect(ctx,i,-7.4,.33,14.8,'#af995f');
        } else if(l.type==='station') {
          rect(ctx,-9.2,-4.3,18.4,8.6,'#47646d');
          rect(ctx,-9,-3.97,18,3.85,'#71929a');
          rect(ctx,-2.36,-5.5,4.72,4.3,'#b38063');
          rect(ctx,-2.22,-5.29,4.44,3.93,'#547681');
          rect(ctx,-7.92,-6.0,15.84,.58,'#8fafa2');
        } else if(l.type==='mill') {
          dot(ctx,0,0,3.08,'#e5cd9f'); dot(ctx,0,0,2.73,'#9d6756');
          line(ctx,{x:-2.9,y:-2.1},{x:2.9,y:-2.5},.28,CREAM);
        } else {
          const tower=l.type==='shop' && l.variant%4!==0;
          if(tower) {
            rect(ctx,-4.5,-5,9,10,'#c5b19d');
            rect(ctx,-4.2,-4.7,8.4,9.4,'#73848a');
            rect(ctx,-2.9,-3.1,5.8,6.2,l.variant%3===1?'#b39779':'#607a83');
          } else {
            const shopfront=l.type==='shop', half=shopfront ? 4.5 : 3.7;
            const tiles=l.variant%3===2 && !shopfront ? '#718187' : '#bb6550';
            rect(ctx,-half,-3,half*2,6,tiles);
            rect(ctx,-half,.1,half*2,2.9,'#33303b33');
            if(shopfront) for(let i=0;i<9;i++) rect(ctx,-half+i,-3.9,1,1.12,i%2?CREAM:'#b95746');
          }
        }
        ctx.restore();
      }
      for(const s of state.map.fuelStations) {
        ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.heading);
        const urban=s.id==='centre';
        rect(ctx,7.6,-4.7,4.6,9.4,urban?'#397a77':'#b07559');
        rect(ctx,1.22,-6.18,7.55,12.35,GOLD);
        rect(ctx,1.48,-5.92,7.03,11.83,urban?'#378b88':'#bd694b');
        rect(ctx,1.65,7.26,2.7,.38,CREAM);
        ctx.restore();
      }
      for(const stop of state.stops) {
        ctx.save(); ctx.translate(stop.x,stop.y); ctx.rotate(stop.heading);
        rect(ctx,-.3,-1.1,3.3,5.6,'#ded0b4');
        rect(ctx,.85,-1.1,2.05,4.9,'#458d83');
        rect(ctx,1,-.86,1.74,4.4,'#73ab99');
        rect(ctx,-1.35,-5.6,.24,10.9,GOLD);
        ctx.restore();
        for(const p of stop.waiting) {
          dot(ctx,p.x,p.y,.40,p.color); dot(ctx,p.x-.025,p.y-.04,.16,'#bb9373');
        }
      }
      for(const sig of state.lights) {
        dot(ctx,sig.x,sig.y,.71,INK);
        dot(ctx,sig.x,sig.y,.48,({green:'#83df93',amber:GOLD,red:'#ff7864'})[sig.aspect]);
      }
      for(const sign of state.signs) {
        dot(ctx,sign.x,sign.y,.65,sign.kind==='crossing'?'#649aaf':'#cd6257');
        dot(ctx,sign.x,sign.y,.37,CREAM);
      }
      for(const p of state.boosts) {
        if(p.respawnAt) continue;
        const hover=boost.hover(state.time,p.x+p.y);
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(b.heading);
        ctx.scale(1.3*Math.cos(hover.turn),-1.3);
        ctx.translate(0,hover.lift);
        ctx.beginPath();
        for(const [x,y] of boost.outline) ctx.lineTo(x,y);
        ctx.closePath(); ctx.lineJoin='round'; ctx.lineWidth=.17; ctx.strokeStyle='#a96a29'; ctx.stroke();
        ctx.fillStyle='#ffdb50'; ctx.fill();
        ctx.restore();
      }
      if(state.boost>0) {
        ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.heading);
        const ring=coachHalo(state.boost);
        if(ring) {
          ctx.save(); ctx.scale(ring.width,ring.length); ctx.globalAlpha=ring.opacity;
          ctx.strokeStyle='#ffd879'; ctx.lineWidth=.11;
          ctx.beginPath(); ctx.arc(0,0,.945,0,TAU); ctx.stroke(); ctx.restore();
        }
        ctx.scale(rig.sx,-rig.sz);
        ctx.translate(0,boost.trailPosition(coach.taillamp[2],state.time));
        for(const triangle of boost.streaks) polygon(ctx,triangle,'#ffcc66');
        ctx.restore();
      }
      for(const p of cones) {
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.heading);
        ctx.globalAlpha=p.alpha;
        rect(ctx,-.475,-.45,.95,.9,'#c25a3a');
        const dx=-Math.sin(p.roll)*Math.cos(p.pitch),dy=-Math.sin(p.pitch);
        ctx.lineCap='round';
        line(ctx,{x:0,y:0},{x:.5*dx,y:.5*dy},.74,'#fa793e');
        dot(ctx,.5*dx,.5*dy,.37,'#fa793e');
        line(ctx,{x:.5*dx,y:.5*dy},{x:.69*dx,y:.69*dy},.52,'#fff3d2');
        dot(ctx,.69*dx,.69*dy,.26,'#fff3d2');
        line(ctx,{x:.69*dx,y:.69*dy},{x:1.15*dx,y:1.15*dy},.29,'#fa793e');
        dot(ctx,1.15*dx,1.15*dy,.16,'#fa793e');
        ctx.restore();
      }
      for(const c of state.cars) {
        ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(c.heading);
        vehicleBody(ctx,1.85,4.25,c.color); ctx.restore();
      }
      overheadWheels(ctx,b,rig.wheels);
      ctx.save(); ctx.translate(bodyX,bodyY); ctx.rotate(bodyHeading);
      if(state.doorsOpen) rect(ctx,1.12,-2.91,.52,1.32,'#f0bd5d');
      vehicleBody(ctx,2.7,9.2,busColor,true); ctx.restore();
      for(const p of state.people) {
        dot(ctx,p.x,p.y,.45,p.color); dot(ctx,p.x-.02,p.y-.06,.17,'#c49a78');
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation='multiply';
      const tint=light.tint.map(channel=>Math.min(255,Math.round(channel*255)));
      rect(ctx,0,0,w,h,'rgb('+tint.join(',')+')');
      if(light.night>0) {
        const level=window.BusSky.graphicsLevels[window.BusSettings.current.detail];
        const layers=Math.round(20*level.shadowLayers);
        ctx.globalCompositeOperation='source-over';
        ctx.translate(w/2,h*.68); ctx.scale(px,px);
        ctx.translate(motion.sway,0); ctx.rotate(motion.yaw);
        ctx.translate((lampHeight-suspensionPivot)*Math.sin(motion.roll),-lampZ+(lampHeight-suspensionPivot)*Math.sin(motion.pitch));
        ctx.scale(1,Math.max(.6,Math.min(1.5,1+motion.pitch*4)));
        ctx.translate(0,lampZ);
        ctx.fillStyle='#f7dc9c';
        ctx.globalAlpha=light.night*(.40+.12*level.lighting)/layers;
        for(const path of headlightFootprint(layers)) ctx.fill(path);
      }
      ctx.restore();
      // Keep stop identifiers upright as the map underneath follows the bus.
      for(const [i,stop] of state.stops.entries()) {
        const dx=stop.x-b.x,dy=stop.y-b.y,x=w/2+(dx*ct+dy*st)*px,y=h*.68+(-dx*st+dy*ct)*px;
        if(x<10||y<10||x>w-10||y>h-10) continue;
        dot(ctx,x,y-9,8,INK); ctx.fillStyle=CREAM; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 10px sans-serif'; ctx.fillText(String(i+1),x,y-8.5);
      }
      for(const station of state.map.fuelStations) {
        const dx=station.x-b.x,dy=station.y-b.y;
        fuelPin(ctx,w/2+(dx*ct+dy*st)*px,h*.68+(-dx*st+dy*ct)*px-11,8);
      }
    }
    return {draw,dispose(){},mode:'2d'};
  }

  function drawMap(canvas,state) {
    const s=surface(canvas);
    if(!s) return;
    const {ctx,w,h}=s, {map,bus,stops}=state, box=map.bounds;
    const full=w>=225&&h>=135, padding=full?18:4;
    const scale=Math.min((w-2*padding)/(box.maxX-box.minX),(h-2*padding)/(box.maxY-box.minY));
    if(scale<=0) return;
    const ox=w/2-(box.minX+box.maxX)*scale/2,oy=h/2-(box.minY+box.maxY)*scale/2;
    rect(ctx,0,0,w,h,'#273e40');
    rect(ctx,0,0,Math.max(0,ox+map.townEdge*scale),h,'#35454d');
    ctx.save(); ctx.translate(ox,oy); ctx.scale(scale,scale); ctx.lineCap='round'; ctx.lineJoin='round';
    for(const r of map.roads) line(ctx,r.a,r.b,(full?5:2.3)/scale,r.kind==='city'?'#9aa8ad':'#8ca296');
    if(full) {
      for(const r of map.roads) line(ctx,r.a,r.b,1.4/scale,r.kind==='city'?'#c1c9c4':'#b6c5ae');
    }
    ctx.restore();
    const requested=new Set(state.passengers.map(p=>p.destination));
    const radius=full?9:4.8;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold '+(full?12:8)+'px sans-serif';
    for(const [i,stop] of stops.entries()) {
      const x=ox+stop.x*scale,y=oy+stop.y*scale;
      if(requested.has(stop.id)) dot(ctx,x,y,radius+2.2,GOLD);
      dot(ctx,x,y,radius,INK); dot(ctx,x,y,radius-.9,requested.has(stop.id)?GOLD:'#bad0d6');
      ctx.fillStyle=INK; ctx.fillText(String(i+1),x,y+.5);
    }
    for(const station of map.fuelStations) {
      fuelPin(ctx,ox+station.x*scale,oy+station.y*scale,full?10:5.8);
    }
    const x=ox+bus.x*scale,y=oy+bus.y*scale, r=full?7:4.5;
    ctx.save(); ctx.translate(x,y); ctx.rotate(bus.heading);
    polygon(ctx,[[0,-r*1.5],[r*1.05,r], [0,r*.62],[-r*1.05,r]],INK);
    polygon(ctx,[[0,-r*1.14],[r*.73,r*.67],[0,r*.37],[-r*.73,r*.67]],'#ff8268');
    ctx.restore();
    // Place queues towards the outer edge, away from the fuel pins and the bus at the stop.
    const pip=full?3.3:1.95, spacing=pip*2+.7;
    for(const stop of stops) {
      const count=stop.waiting.length;
      const y=oy+stop.y*scale, row=y+(y<h/2?-1:1)*(radius+1);
      const left=ox+stop.x*scale-(count-1)*spacing/2;
      for(let i=0;i<count;i++) {
        dot(ctx,left+i*spacing,row,pip+.8,INK);
        dot(ctx,left+i*spacing,row,pip,'#75ef92');
      }
    }
  }

  function create(canvas,{busId='alpin'}={}) {
    const renderer=threeView(canvas,busId)||overhead(canvas,busId);
    let map=null, lots=[];
    return {
      mode:renderer.mode,
      draw(state) {
        if(map!==state.map) {map=state.map; lots=layout(state);}
        renderer.draw(state,lots);
      },
      drawMap,
      dispose:renderer.dispose
    };
  }
  window.CareerRender={create};
})();
