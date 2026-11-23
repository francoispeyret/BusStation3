/* The career world uses metres, with north along -Z and east along +X. */
(() => {
  'use strict';

  const {Mesh, random, lettering, beam, gpuGeometry} = window.BusMesh;
  const TAU = Math.PI * 2;
  const FLOOR = '#aec68b';
  const ROAD = '#626976';
  const CREAM = '#fff0c5';
  const INK = '#283e50';
  const AQUA = '#359d96';
  const GOLD = '#ffcb64';
  const GLAZING = '#7397a1';

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
    function place(x,y,yaw,type,radius,variant,size) {
      if (roads.some(r => segmentDistance(x,y,r) < radius+.65)) return;
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
          const type=urban ? (roll<.75?'shop':'tree') : (roll<.16?'barn':roll<.32?'field':'tree');
          const radius=type==='tree'?3:type==='field'?10:8;
          const offset=road.width/2+radius+(urban?3:4)+rand()*(urban?2:6);
          place(rx+nx*offset,ry+ny*offset,yaw,type,radius,Math.floor(rand()*30),.86+rand()*.25);
        }
      }
    }
    for (let x=bounds.minX-40; x<bounds.maxX+40; x+=27) {
      for (let y=bounds.minY-40; y<bounds.maxY+40; y+=27) {
        const px=x+rand()*11, py=y+rand()*11, urban=px<townEdge;
        const roll=rand();
        const type=urban?(roll<.42?'shop':'tree'):(roll<.55?'tree':roll<.94?'field':'barn');
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

  function street(m,r) {
    const {a,b,width}=r, dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
    const ux=dx/len, uy=dy/len, nx=-uy, ny=ux, half=width/2, city=r.kind==='city';
    function stripe(from,to,offset,w,h,color) {
      groundQuad(m,a.x+ux*from+nx*offset,a.y+uy*from+ny*offset,
        a.x+ux*to+nx*offset,a.y+uy*to+ny*offset,w,h,color);
    }
    stripe(-half,len+half,0,width+(city?5.6:2.5),.015,city?'#cec6b3':'#c4bc90');
    stripe(-half,len+half,0,width,.035,ROAD);
    for (const side of [-1,1]) {
      stripe(half+1,len-half-1,side*(half-.24),.14,.061,'#eee6cb');
      if (city) {
        stripe(half+1,len-half-1,side*(half+.19),.32,.049,'#f1e5c9');
        for (let d=half+4;d<len-half-2;d+=5) {
          stripe(d,d+.065,side*(half+1.6),2.35,.052,'#aaa99e');
        }
      }
    }
    for (let d=half+5;d<len-half-6;d+=9) {
      stripe(d,Math.min(d+3.3,len-half-5),0,.18,.069,'#f4ebc9');
    }
    if (city && len>38) {
      for (const d of [half+2,len-half-4.6]) {
        for (let off=-half+1.1;off<half-.4;off+=1.45) stripe(d,d+2.6,off,.65,.068,'#e2dfd4');
      }
    }
  }

  function tree(m,variant) {
    const pine=variant%4===0, trunk='#826d52';
    const top=5.4+(variant%5)*.4;
    m.ellipse(.72,.094,.9,2.35,2.85,'#819b73',10);
    m.rings(0,0,0,[[.31,0,.29],[.21,top*.64,.18]],6,trunk);
    if(pine) {
      for(let i=0;i<3;i++) {
        const width=2.1-i*.35;
        m.rings(0,top*.22+i*top*.18,0,[[width,0,width*.92],[.06,top*.48,.06]],7,
          ['#487d66','#52896a','#649976'][i],.35*i);
      }
    } else {
      const leaves=['#759d65','#91a958','#799c57','#649675','#96ac62'][variant%5];
      m.rings(0,top*.33,0,[[.9,0,.8],[2.2,.65,2.15],[2.45,2.1,2.25],[1.5,3.4,1.55],[.3,4.05,.4]],8,leaves,.22);
    }
  }

  function shop(m,variant) {
    const w=11+(variant%3), d=8+(variant%4), stories=1+(variant%4);
    const top=3.7+stories*2.55, front=-d/2, shade=['#e2a886','#deca9e','#c6bbad','#a2c2b4','#e0b7a1'][variant%5];
    const awning=['#cb715a','#549188','#da9e47','#7586a0'][variant%4];
    m.quad([-w/2,.081,-d/2],[w/2+.8,.081,-d/2],[w/2+3.8,.081,d/2+2.4],[-w/2+2.7,.081,d/2+2.4],'#9ba38a');
    m.box(0,0,0,w,.31,d,'#b1ada0');
    m.box(0,.31,0,w,top-.31,d,shade);
    m.box(0,top,0,w+.45,.32,d+.45,'#f3dfb8');
    m.box(0,top+.31,0,w-.52,.13,d-.52,'#828787');
    m.box(w*.18,top+.44,.4,1.65,.55,1.24,'#a8aeac');
    m.box(-w*.21,top+.44,d*.18,.84,1.15,.82,'#ac8373');
    for(const f of [-1,1]) {
      const z=f*d/2;
      for(let story=0;story<stories;story++) for(let i=0;i<4;i++) {
        const x=(i-1.5)*w*.22, y=4.1+story*2.55;
        m.box(x,y,z,1.27,1.52,.075,'#eadbc0');
        m.box(x,y+.13,z+f*.047,.97,1.23,.055,'#567887');
        m.box(x,y+.96,z+f*.08,.98,.23,.026,'#96b6bc');
        m.box(x,y-.025,z+f*.04,1.48,.15,.26,'#eedcba');
      }
    }
    for(const side of [-1,1]) for(let story=0;story<stories;story++) {
      for(let i=-1;i<=1;i++) {
        const z=i*d*.27, x=side*(w/2+.03), y=4.1+story*2.55;
        m.box(x,y,z,.07,1.31,1.0,'#70909a');
        m.box(x+side*.02,y-.06,z,.16,.13,1.24,'#e6d4b5');
      }
    }
    m.box(0,2.94,front-.03,w-.2,.63,.18,awning);
    const shopNames=['CAFÉ','HALLES','VÉLO','PRESSE','HÔTEL','FLEURS'];
    const label=shopNames[variant%6].replace('Ô','O');
    // The shop faces local -Z. Mirrored lettering reads correctly from the street.
    lettering(m,label,0,3.43,front-.135,.085,CREAM,-1);
    for(const side of [-1,1]) {
      m.box(side*w*.29,.38,front-.026,w*.31,2.0,.16,'#38586b');
      m.box(side*w*.29,.59,front-.117,w*.26,1.66,.04,GLAZING);
      m.box(side*w*.29,1.96,front-.14,w*.26,.23,.018,'#a6c8c7');
    }
    m.box(0,.16,front-.06,1.25,2.47,.16,'#4b6871');
    m.box(0,.87,front-.15,.87,1.51,.035,'#90b1b0');
    for(let i=0;i<8;i++) {
      const x=-w*.47+(i+.5)*w*.94/8;
      m.box(x,2.68,front-.55,w*.94/8,.15,.97,i%2?CREAM:awning);
      m.box(x,2.53,front-1.01,w*.94/8,.18,.10,i%2?CREAM:awning);
    }
  }

  function barn(m,variant) {
    const barnColor=variant%2?'#bc7158':'#d6bc8d';
    m.box(.65,.075,.85,11.5,.04,8,'#94a37b');
    m.box(0,0,0,10.3,3.55,7.4,barnColor);
    const roof=variant%2?'#747f83':'#9f6354';
    for(const side of [-1,1]) {
      m.quad([-5.45,3.4,side*4.02],[5.45,3.4,side*4.02],[5.45,6.18,0],[-5.45,6.18,0],roof,side>0?.78:1);
      m.tri([side*5.16,3.55,-3.7],[side*5.16,3.55,3.7],[side*5.16,6.03,0],barnColor);
    }
    m.box(0,0,-3.73,3.2,3,.10,'#695c51');
    for(const x of [-2.92,2.92]) {
      m.box(x,1.4,-3.74,1.4,1.2,.14,CREAM);
      m.box(x,1.51,-3.83,1.13,.96,.05,GLAZING);
    }
  }

  function field(m,variant) {
    const cols=['#d9ba71','#a9b66a','#c6ae7c','#91ae71'];
    groundQuad(m,0,-7.9,0,7.9,16,.084,cols[variant%4]);
    for(let i=-6;i<=6;i+=2) groundQuad(m,i,-7.7,i,7.7,.28,.10,variant%2?'#a0a25f':'#c29e64');
    for(let x=-8;x<=8;x+=4) m.box(x,0,-8,.18,1.1,.18,'#8a7658');
    m.box(0,.65,-8,16,.14,.12,'#aa926e');
  }

  function station(m) {
    const stone='#dfbc91', brick='#ae7361', roof='#527882';
    m.box(.6,.075,.8,18.7,.025,9.1,'#99a18a');
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

  function mill(m) {
    m.ellipse(1.5,.085,1.4,5.2,4.3,'#91a17d',12);
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

  function lamp() {
    const m=new Mesh();
    m.rings(0,0,0,[[.23,0,.23],[.18,.48,.18],[.09,.54,.09],[.08,4.6,.08]],7,'#4b6668');
    beam(m,[0,4.57,0],[-.58,4.95,0],.07,.05,'#4b6668');
    m.box(-.74,4.81,0,.77,.12,.31,'#455b60');
    m.box(-.74,4.76,0,.62,.055,.23,'#f6ddb0');
    return m;
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
    for(const z of [.15,2.48]) m.box(2.0,.22,z,.35,.5,.16,INK);
    m.box(2.0,.71,1.32,.69,.12,3.42,'#cc985c');
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
      disk(m,.164,2.79+i*.465,.181,12,c);
      m.box(0,3.0+i*.465,.115,.48,.055,.36,'#354a51');
    }
    return m;
  }

  function carModel(color) {
    const m=new Mesh(); // front at -Z
    m.ellipse(.22,.12,.24,1.23,2.45,'#4c5760');
    m.box(0,.3,0,1.82,.56,4.25,color);
    m.box(0,.86,.12,1.58,.70,2.23,'#3f606c');
    m.box(0,1.52,.16,1.56,.13,1.99,color);
    m.box(0,.99,-1.006,1.4,.48,.05,'#90afb2');
    m.box(0,1.03,1.252,1.38,.39,.04,'#81a0a9');
    for(const side of [-1,1]) {
      for(const z of [-1.39,1.43]) m.box(side*.86,.13,z,.23,.59,.66,'#35414b');
      m.box(side*.74,.60,-2.14,.29,.15,.065,'#ffedb3');
      m.box(side*.72,.60,2.14,.3,.17,.06,'#f37968');
      m.box(side*.807,.9,.15,.07,.61,.10,color);
    }
    return m;
  }

  const skins=['#9b6652','#e5b28c','#bb8767','#825948'];
  function personModel(color,variant) {
    const m=new Mesh(),skin=skins[variant%4];
    for(const side of [-1,1]) {
      m.box(side*.13,.12,0,.17,.69,.22,'#425263');
      m.box(side*.13,.06,-.055,.19,.14,.31,'#514a48');
      beam(m,[side*.22,1.37,0],[side*.30,.94,-.05],.082,.068,color);
      m.box(side*.30,.85,-.05,.115,.15,.12,skin);
    }
    m.rings(0,.75,0,[[.21,0,.15],[.28,.57,.17],[.19,.68,.13]],6,color,.42);
    m.rings(0,1.40,0,[[.105,0,.10],[.195,.12,.15],[.18,.34,.15],[.12,.38,.11]],7,skin,.22);
    m.box(0,1.66,.01,.34,.15,.29,variant%2?'#55453d':'#6a4d3b');
    if(variant%3===0) m.box(0,1.77,-.065,.37,.07,.42,GOLD);
    return m;
  }

  function threeView(canvas,busId) {
    const T=window.THREE;
    if (!T) return null;
    let renderer;
    try { renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}); }
    catch { return null; }
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(57,1,.18,770);
    scene.background=new T.Color('#c8dedf');
    scene.fog=new T.Fog('#cfddcf',75,265);
    const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
    const geometries=new Map(), dynamic=new Map();
    const linear=v=>v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
    function geometry(model) {
      const {vertices,indices}=gpuGeometry(model);
      for(let i=3;i<vertices.length;i+=6) {
        // Fleet lamp tags live above 1.0 in the red channel of the arcade meshes.
        vertices[i]=linear(vertices[i]-2*Math.floor((vertices[i]+.1)/2));
        vertices[i+1]=linear(vertices[i+1]);
        vertices[i+2]=linear(vertices[i+2]);
      }
      const interleaved=new T.InterleavedBuffer(vertices,6), g=new T.BufferGeometry();
      g.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));
      g.setAttribute('color',new T.InterleavedBufferAttribute(interleaved,3,3));
      if(indices) g.setIndex(new T.BufferAttribute(indices,1));
      g.computeBoundingSphere();
      return g;
    }
    function asset(key,build) {
      if(!geometries.has(key)) geometries.set(key,geometry(build()));
      return geometries.get(key);
    }
    const world=new T.Group();
    scene.add(world);
    function place(g,x,y,z,yaw=0,size=1) {
      const obj=new T.Mesh(g,material);
      obj.position.set(x,y,z);
      obj.rotation.y=yaw;
      obj.scale.setScalar(size);
      obj.updateMatrix();
      obj.matrixAutoUpdate=false;
      world.add(obj);
      return obj;
    }
    const skyGeometry=new T.SphereGeometry(680,24,12);
    const skyMat=new T.ShaderMaterial({
      vertexShader:'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`
        varying vec3 direction;
        void main(){
          vec3 d=normalize(direction);
          vec3 horizon=vec3(.84,.89,.86), zenith=vec3(.36,.69,.87);
          vec3 paint=mix(horizon,zenith,smoothstep(-.05,.48,d.y));
          float sun=dot(d,normalize(vec3(-.54,.31,-.79)));
          paint+=vec3(.105,.071,.015)*pow(max(0.,sun),19.);
          paint=mix(paint,vec3(1.,.94,.73),smoothstep(.9982,.9986,sun));
          gl_FragColor=vec4(paint,1.);
        }`,
      side:T.BackSide,depthWrite:false
    });
    const sky=new T.Mesh(skyGeometry,skyMat);
    sky.frustumCulled=false;
    sky.renderOrder=-100;
    scene.add(sky);
    const fleet=window.BusModels;
    const coach=fleet.models.find(f=>f.id===busId)||fleet.models[0];
    const bus=new T.Mesh(asset('coach',()=>fleet.mesh(coach.id)),material);
    bus.scale.set(2.7/coach.width,1.08,-9.2/coach.length);
    scene.add(bus);
    const shade=new Mesh();
    shade.ellipse(.22,0,.20,1.65,4.95,'#47545c',18);
    const busShadow=new T.Mesh(asset('busShade',()=>shade),material);
    scene.add(busShadow);
    const doorstep=new Mesh();
    doorstep.box(1.35,.28,-2.25,.57,.11,1.32,'#f0bd5d');
    const step=new T.Mesh(asset('door',()=>doorstep),material);
    scene.add(step);
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
      groundQuad(base,cx,cy-600,cx,cy+600,1400,-.045,FLOOR);
      groundQuad(base,bounds.minX-140,bounds.minY-66,bounds.minX-140,bounds.maxY+66,
        Math.max(1,2*(map.townEdge-bounds.minX+140)),-.025,'#b8bda1');
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
      for(const r of map.roads) street(roads,r);
      place(asset('roads',()=>roads),0,0,0);
      // Low mountain ranges beyond the playable streets keep the horizon grounded.
      const hills=new Mesh(), rand=random(29);
      for(let i=0;i<45;i++) {
        const a=i*TAU/45, radius=295+rand()*115;
        const x=cx+Math.sin(a)*(radius+(bounds.maxX-bounds.minX)*.38);
        const z=cy+Math.cos(a)*(radius+(bounds.maxY-bounds.minY)*.35);
        const w=50+rand()*65,h=16+rand()*46;
        hills.rings(x,-1,z,[[w,0,w*.70],[w*.61,h*.5,w*.52,3],[w*.18,h,w*.15,9]],
          8,['#9bad91','#97ada4','#a1b69b'][i%3],a);
      }
      place(asset('hills',()=>hills),0,0,0);
      const builders={tree,shop,barn,field,station,mill};
      for(const l of lots) {
        const variant=l.variant%(l.type==='shop'?12:6);
        const g=asset(l.type+variant,()=>{const m=new Mesh(); builders[l.type](m,variant); return m;});
        place(g,l.x,0,l.y,l.yaw,l.size);
      }
      const lamppost=asset('lamp',lamp);
      for(const r of map.roads) {
        if(r.kind!=='city') continue;
        const dx=r.b.x-r.a.x,dy=r.b.y-r.a.y,len=Math.hypot(dx,dy);
        for(let d=16, side=1;d<len-11;d+=25,side=-side) {
          const right=side*(r.width/2+1.72),x=r.a.x+(d*dx-dy*right)/len,y=r.a.y+(d*dy+dx*right)/len;
          if([...state.stops,...state.lights,...state.signs].some(s=>Math.hypot(x-s.x,y-s.y)<5)) continue;
          place(lamppost,x,0,y,Math.atan2(-dx*side,-dy*side));
        }
      }
      state.stops.forEach((s,i)=>{
        const g=asset('shelter'+i,()=>{const m=new Mesh(); stopFurniture(m,i); return m;});
        place(g,s.x,0,s.y,-s.heading);
        stopName(s);
      });
      for(const s of state.signs) place(asset('sign'+s.kind,()=>signModel(s.kind)),s.x,0,s.y,-s.heading);
      previousTime=null;
      initialized=true;
    }
    function actor(id,g,x,y,z,heading) {
      let obj=dynamic.get(id);
      if(!obj) { obj=new T.Mesh(g,material); scene.add(obj); dynamic.set(id,obj); }
      obj.geometry=g; obj.position.set(x,y,z); obj.rotation.y=-heading; obj.visible=true;
    }
    function idVariant(id) {
      let v=0;
      for(const ch of String(id)) v=(v+ch.charCodeAt(0))%12;
      return v;
    }
    function passenger(p,heading,walking,time) {
      const v=idVariant(p.id);
      const key='p'+p.color+(v%4);
      const jump=walking?.065*Math.abs(Math.sin(time*12+v)):0;
      actor('p'+p.id,asset(key,()=>personModel(p.color,v)),p.x,.16+jump,p.y,heading);
    }
    const target=new T.Vector3();
    let width=0,height=0;
    function draw(state,lots) {
      if(!initialized) init(state,lots);
      const w=canvas.clientWidth,h=canvas.clientHeight;
      if(!w||!h) return;
      if(w!==width||h!==height) {
        width=w; height=h;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
        renderer.setSize(w,h,false);
        camera.aspect=w/h; camera.updateProjectionMatrix();
      }
      const b=state.bus;
      const dt=previousTime===null ? 0 : Math.max(0,Math.min(.12,state.time-previousTime));
      if(previousTime===null || state.time<previousTime) cameraHeading=b.heading;
      else cameraHeading+=Math.atan2(Math.sin(b.heading-cameraHeading),Math.cos(b.heading-cameraHeading))*(1-Math.exp(-dt*7.2));
      previousTime=state.time;
      const sx=Math.sin(cameraHeading), cz=Math.cos(cameraHeading);
      const portrait=w<h, back=(portrait?19:15.6)+Math.min(2,Math.abs(b.speed)*.05);
      const lateral=1.30, eyeHeight=portrait?9.3:7.35;
      camera.position.set(b.x-sx*back+cz*lateral,eyeHeight,b.y+cz*back+sx*lateral);
      target.set(b.x+sx*(portrait?4.0:6.0),1.10,b.y-cz*(portrait?4.0:6.0));
      camera.lookAt(target);
      sky.position.copy(camera.position);
      bus.position.set(b.x,.12,b.y);
      bus.rotation.y=-b.heading;
      busShadow.position.set(b.x,.095,b.y); busShadow.rotation.y=-b.heading;
      step.position.copy(bus.position); step.rotation.y=-b.heading; step.visible=state.doorsOpen;
      for(const obj of dynamic.values()) obj.visible=false;
      for(const [i,s] of state.lights.entries()) {
        actor('light'+i,asset('light'+s.aspect,()=>signalModel(s.aspect)),s.x,0,s.y,s.heading);
      }
      for(const c of state.cars) actor('car'+c.id,asset('car'+c.color,()=>carModel(c.color)),c.x,.10,c.y,c.heading);
      for(const s of state.stops) for(const p of s.waiting) passenger(p,s.heading-Math.PI/2,false,state.time);
      for(const p of state.people) passenger(p,b.heading+(p.phase==='alighting'?Math.PI/2:-Math.PI/2),true,state.time);
      // Retire models of boarded passengers. Cars, signals and waiting people remain pooled by id.
      for(const [id,obj] of dynamic) if(!obj.visible) { scene.remove(obj); dynamic.delete(id); }
      renderer.render(scene,camera);
    }
    function dispose() {
      for(const g of geometries.values()) g.dispose();
      for(const l of labels) {l.texture.dispose(); l.mat.dispose(); l.geom.dispose();}
      material.dispose(); skyGeometry.dispose(); skyMat.dispose(); renderer.dispose();
      dynamic.clear(); geometries.clear();
    }
    return {draw,dispose,mode:'3d'};
  }

  function surface(canvas) {
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(!w||!h) return null;
    const dpr=Math.min(window.devicePixelRatio||1,2);
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
  function vehicle(ctx,v,bus,body) {
    ctx.save(); ctx.translate(v.x,v.y); ctx.rotate(v.heading);
    const w=bus?2.7:1.85, h=bus?9.2:4.25;
    rect(ctx,-w/2+.19,-h/2+.32,w,h,'#41545c');
    rect(ctx,-w/2,-h/2,w,h,body);
    rect(ctx,-w*.41,-h*.42,w*.82,h*.18,'#4e7282');
    rect(ctx,-w*.41,h*.25,w*.82,h*.13,'#719ca5');
    rect(ctx,-w*.42,-h*.16,w*.84,h*.34,bus?'#e7d4b3':body);
    if(bus) {
      rect(ctx,-w*.29,-h*.10,w*.56,h*.10,'#b19066');
      rect(ctx,-w*.28,h*.08,w*.55,h*.08,'#77a296');
    }
    ctx.restore();
  }
  function overhead(canvas,busId) {
    const busColor=({alpin:'#d96b59',lagon:'#66b3a7',ecolier:'#e8b44c',
      nocturne:'#7385a4',imperiale:'#b95655'})[busId]||'#d96b59';
    function draw(state,lots) {
      const s=surface(canvas);
      if(!s) return;
      const {ctx,w,h}=s, b=state.bus, px=Math.max(3.7,Math.min(w/58,h/63,11));
      rect(ctx,0,0,w,h,FLOOR);
      ctx.save(); ctx.translate(w/2,h*.68); ctx.scale(px,px); ctx.rotate(-b.heading); ctx.translate(-b.x,-b.y);
      rect(ctx,state.map.bounds.minX-120,state.map.bounds.minY-120,
        state.map.townEdge-state.map.bounds.minX+120,state.map.bounds.maxY-state.map.bounds.minY+240,'#bbbea4');
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
          rect(ctx,-5,-3.8,11.8,9.55,'#939987');
          rect(ctx,-5.5,-4.4,11.6,9.3,l.type==='barn'?'#995f50':'#cdb998');
          rect(ctx,-5,-3.92,10.6,8.23,l.type==='barn'?'#b57b65':'#929998');
          if(l.type==='shop') {
            for(let i=0;i<8;i++) rect(ctx,-5.45+i*1.43,-5.18,1.43,.96,i%2?CREAM:'#ad7862');
            rect(ctx,1.0,.7,2.1,1.5,'#b9bdb3');
          }
        }
        ctx.restore();
      }
      ctx.lineCap='square';
      for(const r of state.map.roads) line(ctx,r.a,r.b,r.width+3.6,r.kind==='city'?'#dad0b6':'#c4bc90');
      for(const r of state.map.roads) line(ctx,r.a,r.b,r.width,ROAD);
      ctx.setLineDash([3.1,5.5]);
      for(const r of state.map.roads) line(ctx,r.a,r.b,.17,'#e8dfc3');
      ctx.setLineDash([]);
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
      for(const c of state.cars) vehicle(ctx,c,false,c.color);
      vehicle(ctx,b,true,busColor);
      for(const p of state.people) {
        dot(ctx,p.x,p.y,.45,p.color); dot(ctx,p.x-.02,p.y-.06,.17,'#c49a78');
      }
      ctx.restore();
      // Keep stop identifiers upright as the map underneath follows the bus.
      const ct=Math.cos(b.heading),st=Math.sin(b.heading);
      for(const [i,stop] of state.stops.entries()) {
        const dx=stop.x-b.x,dy=stop.y-b.y,x=w/2+(dx*ct+dy*st)*px,y=h*.68+(-dx*st+dy*ct)*px;
        if(x<10||y<10||x>w-10||y>h-10) continue;
        dot(ctx,x,y-9,8,INK); ctx.fillStyle=CREAM; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 10px sans-serif'; ctx.fillText(String(i+1),x,y-8.5);
      }
    }
    return {draw,dispose(){},mode:'2d'};
  }

  function drawMap(canvas,state) {
    const s=surface(canvas);
    if(!s) return;
    const {ctx,w,h}=s, {map,bus,stops}=state, box=map.bounds;
    const full=w>=225&&h>=135, padding=full?18:6;
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
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold '+(full?12:8)+'px sans-serif';
    for(const [i,stop] of stops.entries()) {
      const x=ox+stop.x*scale,y=oy+stop.y*scale,r=full?9:4.8;
      if(requested.has(stop.id)) dot(ctx,x,y,r+2.2,GOLD);
      dot(ctx,x,y,r,INK); dot(ctx,x,y,r-.9,requested.has(stop.id)?GOLD:'#9fddd0');
      ctx.fillStyle=INK; ctx.fillText(String(i+1),x,y+.5);
    }
    const x=ox+bus.x*scale,y=oy+bus.y*scale, r=full?7:4.5;
    ctx.save(); ctx.translate(x,y); ctx.rotate(bus.heading);
    polygon(ctx,[[0,-r*1.5],[r*1.05,r], [0,r*.62],[-r*1.05,r]],INK);
    polygon(ctx,[[0,-r*1.14],[r*.73,r*.67],[0,r*.37],[-r*.73,r*.67]],'#ff8268');
    ctx.restore();
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
