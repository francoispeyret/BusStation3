/* Bus Station 3. Three.js driving scene and Canvas 2D fallback. */
(() => {
  'use strict';

  const FAR = 288;
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const {roadX, roadSlope, periodForLap, sceneryForLap, lapAtRoadZ, roadZForLap, DRIVABLE_HALF_WIDTH, RAMP, ROCKET_METRES} = window.BusDrive;
  const LAP_SIGN_OFFSET = DRIVABLE_HALF_WIDTH + 2.85;
  const {Mesh,rgb,random,lettering} = window.BusMesh;
  const fleet = window.BusModels;
  const fleetById = new Map(fleet.models.map(model => [model.id, model]));
  const {CHUNK,LANE,ROAD,biomeFor,routeThemeAt,terrainScale,terrainHeight:heightAtOffset,terrainHeightAt,surfaceColorAt,shoulderColorAt,
    skylineScaleAt,themesInSection,isRoadsideActorVisible,roadsideScenery,biomeModelMesh,
    biomeActorsInSection,biomeActorPose} = window.BusRoute;
  const BEND_START = 24;
  const BEND_RATE = .00095;
  const {graphicsLevels,backdrop}=window.BusSky;
  const outerBands = Array.from({length:14}, (_,i) => 88 + 24*i);
  const meadowBands = [...outerBands.map(x => -x).reverse(),
    ...Array.from({length:33}, (_,i) => (i-16)*4), ...outerBands];
  const centreBand = (meadowBands.length-1)/2;

  function coachOpacity(s,base) {
    if(!(s.rocketGrace>0)) return base;
    const gentle=reducedMotion?.matches;
    // Five smooth pulses in two seconds, or one shallow fade with reduced motion.
    const wave=Math.sin(Math.PI*(gentle ? .5 : 2.5)*s.rocketGrace);
    return base*(1-(gentle ? .32 : .74)*wave*wave);
  }

  function groundBend(forward) {
    const beyond = Math.max(0, forward-BEND_START);
    return -BEND_RATE*beyond*beyond;
  }

  // Coalesce adjacent terrain colours so the software renderer can fill long runs at once.
  function drawShoulders(biome,from,to,route,strip) {
    const verge=ROAD+biome.shoulder;
    strip(from,to,-verge,verge,-.015,biome.verge);
    if(verge>=DRIVABLE_HALF_WIDTH) return;
    for(const side of [-1,1]) {
      const inner=side*verge, outer=side*DRIVABLE_HALF_WIDTH;
      const l=Math.min(inner,outer), r=Math.max(inner,outer);
      let start=from, color=shoulderColorAt(outer,from,route);
      if(biome.surface) for(let z=Math.floor(from/4)*4+4;z<to;z+=4) {
        const next=shoulderColorAt(outer,z,route);
        if(next===color) continue;
        strip(start,z,l,r,-.030,color);
        start=z; color=next;
      }
      strip(start,to,l,r,-.030,color);
    }
  }

  function section(index,lapBiomes) {
    const m=new Mesh(), start=index*CHUNK, r=random(index+843);
    const themes=themesInSection(index,lapBiomes);
    // Cache the slope once per streamed section. One extra row on each end
    // also grounds trees whose branches cross the section seam.
    const rows = Array.from({length:CHUNK/4+3}, (_,i) => {
      const worldZ=start+(i-1)*4, lap=lapAtRoadZ(worldZ);
      const biome=biomeFor(sceneryForLap(lap,lapBiomes)), scale=terrainScale(worldZ,lap,lapBiomes,biome);
      return {x:roadX(worldZ), heights:meadowBands.map(offset=>scale*heightAtOffset(biome,offset,worldZ))};
    });
    function strip(z0,z1,l,r,y,col) {
      const a=roadX(start+z0),b=roadX(start+z1);
      m.quad([a+l,y,z0],[a+r,y,z0],[b+r,y,z1],[b+l,y,z1],col);
    }
    const nextMarker=roadZForLap(lapAtRoadZ(start)+1);
    const shoulderStrip=(a,b,l,r,y,c)=>strip(a-start,b-start,l,r,y,c);
    for(let z=0;z<CHUNK;z+=4) {
      const a=rows[z/4+1], b=rows[z/4+2];
      const midZ=start+z+2, biome=biomeFor(routeThemeAt(midZ,lapBiomes));
      for (let i=0;i<meadowBands.length-1;i++) {
        const l=meadowBands[i], u=meadowBands[i+1];
        const al=a.heights[i], ar=a.heights[i+1], bl=b.heights[i], br=b.heights[i+1];
        const light=1-.28*(ar-al)/(u-l)+.14*(bl-al)/4;
        m.quad([a.x+l,al-.06,z],[a.x+u,ar-.06,z],[b.x+u,br-.06,z+4],
          [b.x+l,bl-.06,z+4],biome.surface?.((l+u)/2,midZ)||biome.grass,Math.max(.55,Math.min(1.3,light)));
      }
      const from=start+z, to=from+4;
      if(from<nextMarker && nextMarker<to) {
        drawShoulders(biomeFor(routeThemeAt(from,lapBiomes)),from,nextMarker,lapBiomes,shoulderStrip);
        drawShoulders(biomeFor(routeThemeAt(nextMarker,lapBiomes)),nextMarker,to,lapBiomes,shoulderStrip);
      } else {
        drawShoulders(biome,from,to,lapBiomes,shoulderStrip);
      }
      strip(z,z+4,-ROAD,ROAD,0,biome.roadColor);
      for(const side of [-1,1]) {
        const x=side*(ROAD-.18);
        strip(z,z+4,x-.055,x+.055,.013,'#f7db8c');
        if(biome.curb) {
          const curb=side*(DRIVABLE_HALF_WIDTH+.20);
          strip(z,z+4,curb-.11,curb+.11,.01,'#e9ddc8');
        }
      }
      if(z%12===0) for(const x of [-LANE/2,LANE/2]) strip(z,z+3.7,x-.08,x+.08,.015,'#ffe7b8');
      for(const band of biome.roadDetails) strip(z,z+4,band.left,band.right,band.y,band.color);
      for(const mark of biome.roadPaint?.(start+z)||[]) strip(z,z+mark.length,mark.left,mark.right,mark.y,mark.color);
    }
    m.groundEnd=m.data.length;
    const signLap=lapAtRoadZ(start+CHUNK), signZ=roadZForLap(signLap);
    if(signLap>1 && signZ>=start && signZ<start+CHUNK) {
      lapSign(m,signLap,roadX(signZ)+LAP_SIGN_OFFSET,0,signZ-start,lapBiomes);
    }
    for(const theme of themes) {
      const definition=biomeFor(theme);
      if(!definition.roadside) continue;
      for(const a of roadsideScenery(index,theme,lapBiomes)) definition.drawRoadside(m,a,a.z-start,r);
    }
    const firstProp=m.data.length;
    for(const theme of themes) {
      biomeFor(theme).details?.(m,{index,start,length:CHUNK,road:DRIVABLE_HALF_WIDTH,roadX,random:r,
        contains:z=>routeThemeAt(start+z,lapBiomes)===theme,visible:isRoadsideActorVisible});
    }
    // Match the same two grass triangles used above so roots and rocks sit
    // on the hillside, even between grid vertices.
    for (let i=firstProp;i<m.data.length;i+=6) {
      const x=m.data[i], z=m.data[i+2], cell=Math.floor(z/4), v=z/4-cell;
      const a=rows[cell+1], b=rows[cell+2];
      const offset=x-(a.x+(b.x-a.x)*v);
      if (Math.abs(offset)<8) continue;
      if (Math.abs(offset)>=64) { m.data[i+1]+=terrainHeightAt(x,start+z,lapBiomes); continue; }
      const col=Math.floor(offset/4), j=centreBand+col, u=offset/4-col;
      m.data[i+1]+=u>=v
        ? (1-u)*a.heights[j]+(u-v)*a.heights[j+1]+v*b.heights[j+1]
        : (1-v)*a.heights[j]+(v-u)*b.heights[j]+u*b.heights[j+1];
    }
    m.movingActors=[];
    for(const actor of biomeActorsInSection(index,lapBiomes)) {
      if(actor.motion) m.movingActors.push(actor);
      else m.instance(biomeModelMesh(actor.model,actor.variant),actor.x,actor.y,actor.z-start,actor.yaw,actor.size);
    }
    return m;
  }

  function lapSign(m,lap,x,y,z,lapBiomes) {
    const biome=biomeFor(sceneryForLap(lap,lapBiomes)), townName=biome.name.toUpperCase();
    if(biome.signPlatform) m.box(x-.23,y-.42,z,4.25,.42,3.0,'#a6a5a1');
    const lapLabel='TOUR '+lap, ink='#293c42';
    // French town-entry board with a separate yellow cartouche above it.
    for(const post of [-1.52,1.52]) m.box(x+post,y,z+.07,.13,3.91,.15,'#8a9b99');
    m.box(x,y+1.78,z,4.8,1.68,.15,'#b54c43');
    m.box(x,y+3.54,z,3.64,.91,.14,'#465455');
    if(m.layers) m.layers.push({offset:m.data.length,layer:1,side:0,end:-1});
    function panel(w,b,h,color) {
      const l=x-w/2, r=x+w/2, f=z-.09;
      const first=m.data.length;
      m.quad([l,y+b,f],[r,y+b,f],[r,y+b+h,f],[l,y+b+h,f],color);
      // Retroreflective face. The lettering and poles keep their usual lighting.
      for(let i=first+3;i<m.data.length;i+=6) m.data[i]+=6;
    }
    panel(4.57,1.90,1.44,'#fff5d7');
    panel(3.50,3.60,.79,'#f5cc64');
    const namePixel=Math.min(.20,4.31/(townName.length*4-1));
    const lapPixel=Math.min(.133,3.30/(lapLabel.length*4-1));
    const nameTop=y+2.62+(townName.includes('Ê')?1.78:2.5)*namePixel;
    lettering(m,townName,x,nameTop,z-.12,namePixel,ink);
    lettering(m,lapLabel,x,y+4+2.5*lapPixel,z-.12,lapPixel,ink);
    if(m.layers) m.layers.push({offset:m.data.length,layer:0,side:0,end:0});
  }

  const IMPACT_MESHES = ['waterRipple','waterDrop','repairHalo','repairSpark','boostHalo'];
  const PROP_TYPES = ['cone','barrier','oil','pothole','repair','boost','ramp','rocket','rocketMotor','rocketFlame','jumpShade',...IMPACT_MESHES];

  function rocketModel(type) {
    const m=new Mesh();
    if(type!=='rocketFlame') {
      const hull=(levels,color)=>m.rings(0,0,0,levels.map(([y,r])=>[r,y,r]),16,color);
      hull([[0,.31],[.07,.32],[.24,.22]],'#586373');
      const enamelStart=m.data.length;
      hull([[.14,.24],[.29,.33],[.59,.44],[1.03,.48],[1.33,.43],[1.50,.37]],'#dbe9f2');
      hull([[1.49,.371],[1.73,.26],[1.96,.105],[2.09,.012]],'#f05558');
      for(const angle of [-.20,Math.PI+.20,-Math.PI/2]) {
        const radialX=Math.cos(angle),radialZ=Math.sin(angle);
        const outline=[[.27,.71],[.47,.65],[.69,.42],[.78,.11],[.73,.02],[.47,.25],[.26,.29]];
        const flank=width=>outline.map(([r,y])=>[r*radialX-width*radialZ,y,r*radialZ+width*radialX]);
        const left=flank(-.054),right=flank(.054);
        for(let i=1;i+1<left.length;i++) {
          m.tri(left[0],left[i],left[i+1],'#e64752');
          m.tri(right[0],right[i],right[i+1],'#be3747');
        }
        for(let i=0;i<left.length;i++) {
          const j=(i+1)%left.length;
          m.quad(left[i],left[j],right[j],right[i],'#ff7771');
        }
      }
      // A domed blue porthole with a metal bezel faces the driver on approach.
      function windowDisc(radius,z,color) {
        for(let i=0;i<16;i++) {
          const edge=k=>[radius*Math.cos(k*TAU/16),1.10+radius*Math.sin(k*TAU/16),z];
          m.tri([0,1.10,z-.035],edge(i),edge(i+1),color,.91+.09*Math.sin((i+.5)*TAU/16));
        }
      }
      windowDisc(.252,-.469,'#6a7585');
      windowDisc(.196,-.505,'#55bfe5');
      m.quad([-.117,1.115,-.535],[-.09,1.19,-.535],[.023,1.236,-.535],[-.020,1.165,-.539],'#cff7ff');
      for(let i=enamelStart+3;i<m.data.length;i+=6) m.data[i]+=6;
    }
    if(type!=='rocketMotor') {
      const start=m.data.length, length=type==='rocket'?.48:1;
      const plume=(a,b,col)=>m.rings(0,0,0,[a,b].map(([y,r,dx])=>[r,y*length,r,dx]),10,col);
      plume([-1,.012,-.075],[-.58,.18,-.04],'#ff6838');
      plume([-.58,.18,-.04],[-.31,.30,.015],'#ffa333');
      plume([-.31,.30,.015],[-.13,.26,0],'#ffda5e');
      plume([-.13,.26,0],[.002,.245,0],'#fff5b3');
      for(const side of [-1,1]) {
        const tip=side<0?.73:.59;
        m.rings(0,0,0,[[.008,-tip*length,.008,side*.27,.04],
          [.078,-(tip-.16)*length,.073,side*.205,.07],
          [.10,-.28*length,.095,side*.195,.05]],8,'#ff9c39');
      }
      for(let i=start+3;i<m.data.length;i+=6) m.data[i]+=8;
    }
    // Stand the pickup on its exhaust at an angle. The attached version lies
    // along the coach, pointing forward in its local frame with the glass up.
    const angle=.65, cant=.32;
    for(let i=0;i<m.data.length;i+=6) {
      const x=m.data[i],y=m.data[i+1],z=m.data[i+2];
      if(type==='rocket') {
        const up=y*Math.cos(cant)-z*Math.sin(cant);
        m.data[i]=-.47+x*Math.cos(angle)+up*Math.sin(angle);
        m.data[i+1]=.65-x*Math.sin(angle)+up*Math.cos(angle);
        m.data[i+2]=-.21+y*Math.sin(cant)+z*Math.cos(cant);
      } else {
        m.data[i+1]=-z;
        m.data[i+2]=y;
      }
    }
    return m;
  }

  function prop(type) {
    if(type==='rocket'||type==='rocketMotor'||type==='rocketFlame') return rocketModel(type);
    if(type==='cone') return window.BusCone.model();
    if(type==='boost') return window.BusBoost.model();
    const m=new Mesh();
    if(type==='barrier') {
      for(const side of [-1,1]) {
        m.box(side*.86,.05,0,.15,1.08,.20,'#7b685c');
        m.box(side*.86,.02,0,.42,.1,.85,'#715d51');
      }
      m.box(0,.52,0,2.25,.6,.22,'#fff1d4');
      for(const x of [-.85,-.24,.37]) {
        m.quad([x-.23,.52,-.12],[x+.06,.52,-.12],[x+.49,1.12,-.12],[x+.20,1.12,-.12],'#ed714b');
      }
      for(const x of [-.87,.87]) {
        m.box(x,1.12,0,.23,.16,.23,'#ec9c3d');
        m.box(x,1.28,0,.12,.06,.12,'#ffdc7b');
      }
    } else if(type==='ramp') {
      const {halfWidth:w,halfLength:l,lipHeight:h}=RAMP;
      const deck=(x,z,offset=0)=>[x,.035+(h-.035)*(z+l)/(2*l)+offset,z];
      for(const side of [-1,1]) {
        const x=side*w;
        m.quad([x,0,-l],deck(x,-l),deck(x,l),[x,0,l],'#db6a47',side<0?.92:.78);
      }
      m.quad([-w,0,l],[w,0,l],deck(w,l),deck(-w,l),'#a5453b');
      m.quad(deck(-w,-l),deck(w,-l),deck(w,l),deck(-w,l),'#21686d');
      // Paint atop the inclined deck. Keep the chevrons readable under moonlight.
      m.layers=[{offset:m.data.length,layer:1,side:0,end:0}];
      const paintStart=m.data.length;
      for(const side of [-1,1]) {
        const edge=side*w, inner=side*(w-.14);
        m.quad(deck(edge,-l,.012),deck(inner,-l,.012),deck(inner,l,.012),deck(edge,l,.012),'#7ef3cb');
      }
      for(const z of [-2.18,-.67,.84]) for(const side of [-1,1]) {
        const x=side*(w-.32);
        m.quad(deck(x,z,.018),deck(0,z+.63,.018),deck(0,z+1.08,.018),deck(x,z+.45,.018),'#ffdc76');
      }
      for(let i=paintStart+3;i<m.data.length;i+=6) m.data[i]+=6;
    } else if(type==='oil') {
      m.ellipse(0,.025,0,1.29,1.2,'#699eaf',13);
      m.ellipse(.06,.031,-.06,1.14,1.01,'#548d9e',12);
      m.ellipse(-.44,.035,-.30,.45,.075,'#b6e3de',9);
      m.ellipse(.27,.035,.40,.40,.055,'#9ed2d5',9);
      m.ellipse(.64,.035,.29,.12,.035,'#d6ede1',7);
    } else if(type==='pothole') {
      m.ellipse(0,.025,0,1.29,1.20,'#9c9586',11);
      m.ellipse(.03,.031,-.05,1.1,1.01,'#3e464e',10);
      m.ellipse(.14,.036,.24,.65,.29,'#4d5050',9);
    } else if(type==='repair') {
      m.box(0,.50,0,1.12,.81,.61,'#259c83');
      m.box(0,1.32,0,.51,.085,.15,'#305e60');
      for(const x of [-.21,.21]) m.box(x,1.27,0,.085,.17,.15,'#305e60');
      for(const s of [-1,1]) {
        m.box(0,.79,s*.316,.57,.18,.035,'#fff9dc');
        m.box(0,.63,s*.317,.18,.51,.035,'#fff9dc');
      }
      m.box(0,.51,0,1.14,.085,.64,'#73c5a1');
    } else if(type==='jumpShade') {
      m.ellipse(0,0,0,1,1,'#1e2735',20);
    } else if(type==='waterRipple'||type==='repairHalo'||type==='boostHalo') {
      const col=type==='waterRipple'?'#c1ece9':type==='repairHalo'?'#8fffd0':'#ffd879';
      const inner=type==='waterRipple'?.95:.89;
      m.ring(inner,col);
    } else if(type==='waterDrop') {
      m.rings(0,-.09,0,[[.02,0,.02],[.085,.08,.085],[.05,.16,.05],[.01,.24,.01]],6,'#a7e4e8');
    } else if(type==='repairSpark') {
      for(let i=0;i<8;i++) {
        const point=k=>{
          const a=TAU*k/8, r=k%2?.18:1;
          return [.21*r*Math.cos(a),.29*r*Math.sin(a),0];
        };
        m.tri([0,0,0],point(i),point(i+1),i%2?'#eeffdc':'#acffdb');
      }
    }
    return m;
  }

  // All parts share a local frame aligned with the road, or with the moving bus for pickups.
  // Scale first, then pitch (X), roll (Z) and yaw (Y). Positive pitch tips the top forward.
  function impactParts(s,emit) {
    if(!s.impacts?.length) return;
    const ease=value=>{
      const v=Math.max(0,Math.min(1,value));
      return v*v*(3-2*v);
    };
    for(const hit of s.impacts) {
      const age=s.time-hit.start, p=age/hit.duration;
      if(p<0||p>=1) continue;
      const pickup=hit.type==='repair'||hit.type==='boost';
      const z=pickup?s.roadZ??s.distance:hit.z;
      const x=pickup?roadX(z)+(s.laneX||0)*LANE:hit.x;
      const yaw=pickup?Math.atan(roadSlope(z))+(s.heading||0):hit.yaw;
      const sn=Math.sin(yaw), cs=Math.cos(yaw);
      function part(type,lateral,y,forward,turn,roll,pitch,sx,sy,sz,alpha) {
        if(alpha<=0) return;
        emit(type,x+lateral*cs+forward*sn,y,z+forward*cs-lateral*sn,
          yaw+turn,roll,pitch,sx,sy,sz,alpha);
      }
      if(hit.type==='cone') {
        const toVerge=Math.max(2.2,ROAD-hit.side*(hit.x-roadX(hit.z))+1.9);
        const f=window.BusCone.flight(p,age,hit.side,hit.speed,toVerge);
        part('cone',f.across,f.lift,f.forward,f.turn,f.roll,f.pitch,1,1,1,f.alpha);
      } else if(hit.type==='barrier') {
        const fall=ease((p-.08)/.43), crush=ease(p/.40);
        const pitch=fall*Math.PI*.5, depth=1-.46*crush;
        // A short skid clears the tall coach's silhouette before the striped face tips skyward.
        const skid=1-Math.pow(1-Math.min(1,p/.60),3);
        const shove=(2.0+hit.speed*.36)*skid;
        const across=hit.side*1.90*skid;
        // Keep the leading end of the skid feet on the tarmac as they tip over.
        const y=.01+.425*depth*Math.sin(pitch);
        part('barrier',across,y,shove,hit.side*.16*fall,0,pitch,
          1+.11*crush,1-.29*crush,depth,1-ease((p-.57)/.43));
      } else if(hit.type==='oil') {
        const spread=1-(1-p)*(1-p), fade=1-ease((p-.32)/.68);
        part('oil',0,0,0,0,0,0,1+1.38*spread,1,1+.80*spread,fade);
        part('waterRipple',0,.048,0,0,0,0,1.10+2.2*spread,1,1.05+1.27*spread,.72*Math.sin(Math.PI*p));
        for(let i=0;i<6;i++) {
          const side=i%2?1:-1, row=Math.floor(i/2), t=Math.min(1,p/(.63+.09*row));
          const across=side*(.70+(.95+.38*row)*t), forward=(row-1)*.64+1.35*t;
          const size=.80+.18*row;
          part('waterDrop',across,.11+3.7*t*(1-t),forward,0,-side*t*.9,0,size,size,size,(1-ease((t-.60)/.40))*ease(p/.08));
        }
      } else if(pickup) {
        const repair=hit.type==='repair';
        const ring=window.BusBoost.halo(p);
        const halo=repair?'repairHalo':'boostHalo';
        part(halo,0,.055,0,0,0,0,ring.width,1,ring.length,ring.light*.92);
        if(repair) {
          const spread=1-(1-p)*(1-p);
          part(halo,0,.050,0,0,0,0,1.48+1.60*spread,1,2.90+1.73*spread,ring.light*.29);
          for(let i=0;i<8;i++) {
            const side=i%2?1:-1, row=Math.floor(i/2), t=(p-(i%3)*.065)/.84;
            if(t<=0||t>=1) continue;
            const size=.58+.64*Math.sin(t*Math.PI);
            part('repairSpark',side*(1.28+.65*t),.60+2.65*t+row*.16,(row-1.5)*1.43,
              0,side*t*.30,.48,size,size,size,Math.sin(t*Math.PI));
          }
        }
      }
    }
  }

  // Sample each rear tire on the game clock so a slower display produces the same spray.
  function shoulderSpray() {
    const jitter=random(Math.floor(performance.now()*1000));
    const chips=[], previous=[];
    let wheels, lastTime=0;
    return function update(s) {
      const time=s.time||0;
      if(wheels!==s.rearWheels || time<lastTime) {
        wheels=s.rearWheels;
        chips.length=0;
        previous.length=0;
        for(const wheel of wheels||[]) previous.push({...wheel});
        lastTime=time;
      }
      if(!wheels || time===lastTime) return chips;
      const speed=s.speed/3.6, sin=Math.sin(s.worldHeading), cos=Math.cos(s.worldHeading);
      const lastTick=Math.floor(time*30);
      for(let tick=Math.max(lastTick-5,Math.floor(lastTime*30)+1);tick<=lastTick;tick++) {
        const start=tick/30, fraction=(start-lastTime)/(time-lastTime);
        for(let i=0;i<wheels.length;i++) {
          const wheel=wheels[i], from=previous[i];
          const contact=from.contact+(wheel.contact-from.contact)*fraction;
          if(s.jump || contact<=0 || jitter()>=Math.min(1,speed/22)*contact) continue;
          const x=from.x+(wheel.x-from.x)*fraction, z=from.z+(wheel.z-from.z)*fraction;
          const color=shoulderColorAt(x-roadX(z),z,s.lapBiomes);
          const burst=1+Math.floor(jitter()**2*4);
          for(let j=0;j<burst;j++) {
            const lateral=wheel.side*(.65+jitter()*3.3), forward=speed*(.07+jitter()*.25);
            const lift=1.7+jitter()*Math.min(4.3,speed*.22);
            chips.push({type:'shoulderChip',start,life:(lift+Math.sqrt(lift*lift+1.96))/9.8,
              originX:x,originZ:z,vx:lateral*cos+forward*sin,vz:forward*cos-lateral*sin,lift,
              size:.055+jitter()*.095,lean:jitter()-.5,spin:jitter()*4-2,
              color,shade:.68+jitter()*.57});
          }
        }
      }
      for(let i=0;i<wheels.length;i++) Object.assign(previous[i],wheels[i]);
      lastTime=time;
      let count=0;
      for(const chip of chips) {
        const age=time-chip.start;
        if(age>=chip.life) continue;
        chip.x=chip.originX+chip.vx*age;
        chip.y=.10+chip.lift*age-4.9*age*age;
        chip.z=chip.originZ+chip.vz*age;
        chip.radius=chip.size*Math.min(1,3*(1-age/chip.life));
        chip.tilt=chip.lean+chip.spin*age;
        chips[count++]=chip;
      }
      chips.length=count;
      return chips;
    };
  }

  function chipCorners(chip,cos,sin,originZ=0) {
    const {x,y,radius:r,tilt}=chip, z=chip.z-originZ;
    const vertex=(across,up)=>[x+cos*across*r,y+up*r,z-sin*across*r];
    return [vertex(-1,0),vertex(tilt,1.28),vertex(.84,.18),vertex(-tilt,-.72)];
  }

  // Frame the distant ridgeline one sixth of the way down the driving view.
  const FOCAL_LENGTH = 1.55;
  const SKY_FRACTION = 1/6;
  const RIDGE_PITCH = Math.atan((1-2*SKY_FRACTION)/FOCAL_LENGTH);
  function camera(state, aspect, bus) {
    const distance = state.roadZ ?? state.distance ?? 0;
    const a = Math.atan(roadSlope(distance));
    if (state.phase === 'demo') {
      // Keep the same three-quarter view through a swap, with room for the longest coach.
      const side = 5.75, back = 8.6 * Math.max(1, .92 / aspect), height = 5.65;
      const radius = Math.hypot(side, back), bearing = a + Math.atan2(side, back);
      const wide = Math.max(0, Math.min(1, (aspect - .92) / .65));
      const focal = 1.7;
      // Leave room beside the bus in landscape and above it in portrait.
      const pan = Math.atan(Math.min(.60, .36 * wide * aspect / focal));
      const pitch = Math.atan2(height - 1.5, radius * Math.cos(pan))
        - Math.atan((.37 - .10 * wide) / focal);
      return {cx:roadX(distance) - radius * Math.sin(bearing), cy:height,
        cz:distance - radius * Math.cos(bearing), a:bearing - pan, f:focal, pitch, aspect};
    }
    const framing = Math.max(1, .70 / aspect);
    const airborne = Math.max(0,(state.jump?.height||0)-RAMP.lipHeight*.5);
    // Pull back with the ignition to keep the exhaust and its pool of light
    // above the dashboard, including on the longer coaches.
    const remainingRocket=state.rocketRemaining||0;
    const pull=Math.max(0,Math.min(1,(ROCKET_METRES-remainingRocket)/18,remainingRocket/28));
    const wideView=Math.min(3.2,4.8*Math.max(0,aspect-1.7));
    const exhaustView=(4.65+.42*Math.max(0,bus.length-5)+wideView)*pull*pull*(3-2*pull);
    const back = 13.3 * framing + airborne*.24 + exhaustView;
    const height = 12.9 * framing + airborne*.27;
    // A low ridge 115 m ahead represents the skyline of the curved course.
    // Sight it from the actual camera height, including in portrait.
    const chasePitch = RIDGE_PITCH + Math.atan2(height-2,115);
    const offset = LANE * (state.laneX || 0);
    // In portrait, follow the bus farther once it leaves the outer asphalt lane.
    const extraFollow = Math.min(.5, Math.max(0, 1.5 - aspect));
    const follow = .22 * offset + Math.sign(offset) * Math.max(0, Math.abs(offset) - LANE) * extraFollow;
    const chase = {
      cx: roadX(distance) + follow - Math.sin(a) * back,
      cy: height,
      cz: distance - Math.cos(a) * back,
      a, f: FOCAL_LENGTH, pitch: chasePitch, aspect
    };
    if (!(state.introProgress < 1)) return chase;
    const t = Math.max(0,state.introProgress);
    const sweep = t*t*t*(t*(6*t-15)+10);
    const remaining = 1-sweep;
    // Orbit a point just inside the windscreen, then open the shot and lift the
    // sightline until position and tangent meet the normal chase camera.
    const angle = a + (Math.PI-.39)*remaining;
    const minFrontRadius = 4.65 + Math.max(0,bus.height-3.36)*.65;
    const frontRadius = Math.max(minFrontRadius,1.38+2.9/aspect);
    const radius = frontRadius*remaining + back*sweep;
    const frontPivot = bus.headlamp[2] * .51;
    const pivotX = roadX(distance) + follow*sweep + ((state.laneX||0)*LANE + Math.sin(a)*frontPivot)*remaining;
    const pivotZ = distance + Math.cos(a)*frontPivot*remaining;
    // Pulling back for the portrait close-up also reveals more of the horizon.
    const frontPitch = RIDGE_PITCH-.06 + Math.atan((frontRadius-minFrontRadius)/32);
    const pitch = frontPitch*remaining + chasePitch*sweep;
    const chaseSightline = chase.cy - Math.tan(chasePitch)*back;
    const aimY = 1.52 + (chaseSightline-1.52)*sweep*sweep;
    return {cx:pivotX-Math.sin(angle)*radius, cy:aimY+Math.tan(pitch)*radius, cz:pivotZ-Math.cos(angle)*radius,
      a:angle, f:FOCAL_LENGTH, pitch, aspect};
  }

  function brakingPitch(state) {
    if (!(state.stopProgress > 0 && state.stopProgress < 1)) return 0;
    return .032*Math.sin(state.stopProgress*Math.PI*1.28)*(1-state.stopProgress);
  }

  function coachPose(s,d) {
    const x=roadX(d)+(s.laneX||0)*LANE, angle=Math.atan(roadSlope(d))+(s.heading||0);
    const speed=Math.min(1,(s.speed||0)/70), t=s.time||0;
    let y=.035+Math.sin(d*1.05)*speed*.018+(s.flat?0:Math.cos(d*.73)*.008);
    let yaw=angle, pitch=brakingPitch(s);
    let roll=(s.steer||0)*.072+(s.flat?.044+Math.sin(d*1.6)*.013:0)+(s.hit?Math.sin(t*26)*.035*speed:0);
    const slope=RAMP.lipHeight/(2*RAMP.halfLength);
    if(s.jump) {
      const {height,progress,spinAngle}=s.jump;
      y+=height;
      yaw+=spinAngle;
      pitch-=Math.atan(slope)*(1-progress)+.21*Math.sin(TAU*progress);
      roll+=.08*Math.sin(spinAngle);
    } else {
      // Let each axle climb the deck before the impulse at the centre of the ramp.
      const axle=1.55;
      for(const o of s.objects||[]) {
        if(o.type!=='ramp' || o.passed || Math.abs(o.z)>RAMP.halfLength+axle+1) continue;
        const z=d+o.z, roadAngle=Math.atan(roadSlope(z)), cos=Math.cos(roadAngle), sin=Math.sin(roadAngle);
        const dx=x-roadX(z)-o.lane*LANE, along=dx*sin-o.z*cos;
        if(along>0 || Math.abs(dx*cos+o.z*sin)>RAMP.halfWidth+RAMP.wheelMargin) continue;
        const front=Math.max(0,along+axle+RAMP.halfLength)*slope;
        const rear=Math.max(0,along-axle+RAMP.halfLength)*slope;
        y+=(front+rear)*.5;
        pitch-=Math.atan((front-rear)/(2*axle));
        break;
      }
    }
    return {x,y,yaw,roll,pitch};
  }

  // At sunrise the cast shadow can leave the screen. A soft spot beneath the
  // airborne coach keeps its position on the road readable until touchdown.
  function landingSpot(s,bus) {
    if(!s.jump) return null;
    const h=s.jump.height, spread=1+.045*h, opacity=Math.min(1,h)*.16/(1+.11*h);
    return {radiusX:bus.width*.60*spread,radiusZ:bus.length*.49*spread,opacity};
  }

  function landingShadow(s,bus,emit) {
    const spot=landingSpot(s,bus);
    if(!spot) return;
    for(const scale of [1.25,1,.75,.5]) {
      emit(spot.radiusX*scale,spot.radiusZ*scale,spot.opacity);
    }
  }

  // Both renderers attach the engine and its light in the coach's own frame,
  // including its roll, nose angle and any rotation made in the air.
  function rocketAttachment(s,bus,pose,d) {
    if(!(s.rocketRemaining>0)) return null;
    const t=s.time||0;
    const pulse=.5+.28*Math.sin(31*t)+.22*Math.sin(49*t+.6);
    const length=2.04+1.04*pulse, width=.91+.18*Math.sin(35*t);
    const mountY=bus.height+.20, nozzleZ=bus.taillamp[2]-1.09;
    const lightZ=nozzleZ-length*.65;
    const cy=Math.cos(pose.yaw),sy=Math.sin(pose.yaw),cr=Math.cos(pose.roll),sr=Math.sin(pose.roll);
    const cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch);
    function position(y,z) {
      const up=y*cp-z*sp,along=y*sp+z*cp,across=-up*sr;
      return {x:pose.x+across*cy+along*sy,y:pose.y+up*cr,z:d-across*sy+along*cy};
    }
    return {nozzle:position(mountY,nozzleZ),light:position(mountY,lightZ),
      mountY,lightZ,length,width,power:.87+.13*pulse};
  }

  const skyBackdrop = {distance:FAR, offset:(forward,cam)=>-15-cam.cy+.64*groundBend(forward)};
  function lapLighting(state) {
    // Races change light in the final 60 m. The showcase fades over four seconds.
    return window.BusSky.lighting(periodForLap(state.lap),state.lapProgress||0,state.phase==='demo' ? 1/3 : .06);
  }

  function createDrivingScene(canvas,context,graphics) {
    const THREE=window.THREE;
    const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
    const scene=new THREE.Scene();
    const view=new THREE.PerspectiveCamera(60,1,.28,312);
    const sky=window.BusSky.createSky(THREE,scene,skyBackdrop);
    const lighting=window.BusThreeLighting.create(THREE,scene,renderer,{BEND_START,BEND_RATE,FAR});
    const objects=window.BusThreeScene.create(THREE,scene,{
      FAR,groundBend,section,backdrop,prop,PROP_TYPES,impactParts,landingSpot,shoulderSpray,chipCorners,lighting
    });
    const viewport=context.getParameter(context.MAX_VIEWPORT_DIMS);
    const maxSize=context.getParameter(context.MAX_RENDERBUFFER_SIZE);
    function render(s) {
      const cw=canvas.clientWidth||640, ch=canvas.clientHeight||400;
      const scale=Math.min(graphics.resolutionScale,maxSize/cw,maxSize/ch,viewport[0]/cw,viewport[1]/ch);
      const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
      if(canvas.width!==w || canvas.height!==h) renderer.setSize(w,h,false);
      const bus=fleetById.get(s.busModel)||fleet.models[0], d=s.roadZ??s.distance??0;
      const cam=camera(s,w/h,bus), light=lapLighting(s), pose=coachPose(s,d);
      const rocket=rocketAttachment(s,bus,pose,d), busOpacity=s.busOpacity??1;
      const fov=THREE.MathUtils.radToDeg(2*Math.atan(1/cam.f));
      if(view.fov!==fov || view.aspect!==cam.aspect) {
        view.fov=fov;
        view.aspect=cam.aspect;
        view.updateProjectionMatrix();
      }
      // The course advances along +Z. Keep its moving origin near the coach
      // and reflect Z so the Three.js camera sees the same left and right lanes.
      view.position.set(cam.cx,cam.cy,d-cam.cz);
      view.rotation.set(-cam.pitch,-cam.a,0,'YXZ');
      sky.update(cam,light);
      lighting.update({light,cam,bus,pose,d,rocket,busOpacity,level:graphics.level,time:s.time||0,lapBiomes:s.lapBiomes});
      objects.update(s,{d,t:s.time||0,cam,bus,pose,rocket,bodyOpacity:coachOpacity(s,busOpacity),light});
      renderer.render(scene,view);
    }
    function dispose() {
      objects.dispose();
      lighting.dispose();
      sky.dispose();
      renderer.dispose();
    }
    return {render,dispose};
  }

  function threeRenderer(canvas,context,graphics) {
    let drivingScene=createDrivingScene(canvas,context,graphics);
    function releaseScene() {
      drivingScene?.dispose();
      drivingScene=null;
    }
    function onContextLost(event) {
      event.preventDefault();
      // Retire the streamed buffers and VSM targets while their context is lost.
      // Disposing old buffers after restoration would touch the new context.
      releaseScene();
    }
    canvas.addEventListener('webglcontextlost',onContextLost);
    return {
      renderer:'Three.js (WebGL 2)',
      render(state) {
        if(context.isContextLost()) return;
        drivingScene??=createDrivingScene(canvas,context,graphics);
        drivingScene.render(state);
      },
      dispose() {
        canvas.removeEventListener('webglcontextlost',onContextLost);
        releaseScene();
      }
    };
  }

  // Software fallback projects the same bus and pickups. Simplified scenery keeps
  // the road playable on devices that cannot create a WebGL context.
  function canvasRenderer(canvas, ctx, graphics) {
    const updateSpray=shoulderSpray();
    const cars = new Map();
    const scenerySections = new Map();
    const terrainSections = new Map();
    const biomeShadows = new Map();
    const openModelShadows = new Map();
    let cachedRoute;
    let cachedSignLap;
    const fadeCanvas = canvas.ownerDocument.createElement('canvas');
    const fadeContext = fadeCanvas.getContext('2d');
    // A small horizon buffer replaces a per-pixel depth buffer in the software renderer.
    const columns=32, stride=columns+1, depthStep=6, rows=Math.ceil(FAR/depthStep)+1;
    const skyline=new Float32Array(stride*rows);
    const skylineZ=new Float64Array(stride*rows);
    // A few points describe each solid's silhouette in the software renderer.
    // Project these instead of reprocessing all the triangles used for its trim.
    function ring(rx,y,rz,n=8) {
      return Array.from({length:n},(_,i)=>[rx*Math.cos(i*TAU/n),y,rz*Math.sin(i*TAU/n)]);
    }
    function boxCorners(rx,low,high,rz) {
      return [low,high].flatMap(y=>[[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz]]);
    }
    // Paired points on the light disc keep the centre of the penumbra stable.
    const lightDiscs=new Map([1,5,9,17].map(count=>{
      const points=[[0,0]],pairs=(count-1)/2;
      for(let i=0;i<pairs;i++) {
        const radius=Math.sqrt((i+.75)/(pairs+.25)),angle=i*Math.PI*(3-Math.sqrt(5));
        const x=radius*Math.cos(angle),y=radius*Math.sin(angle);
        points.push([x,y],[-x,-y]);
      }
      return [count,points];
    }));
    const shadowProfiles={
      cone:[...ring(.52,.04,.49),[0,1.15,0]],
      barrier:boxCorners(1.12,.05,1.28,.25),
      ramp:[-RAMP.halfWidth,RAMP.halfWidth].flatMap(x=>[
        [x,.035,-RAMP.halfLength],[x,0,RAMP.halfLength],[x,RAMP.lipHeight,RAMP.halfLength]]),
      repair:boxCorners(.56,.50,1.36,.32),
      boost:[[0,.38,0],[-.56,.91,0],[.58,1.28,0],[.38,1.73,0],[-.10,1.73,0]],
      rocket:[[-.95,.65,-.14],[-.40,.52,-.26],[.50,1.32,-.30],[.71,2.19,.42],[.02,1.83,.51]],
      rocketMotor:[[0,0,0],[-.76,0,.1],[.76,0,.1],[0,.47,1.08],[0,0,2.04],[0,-.44,1.05]],
      pine:[[0,0,0],...ring(.31,.27,.31),[0,1,0]],
      fir:[[0,0,0],...ring(.21,.17,.21),[0,1,0]],
      lapSign:[...boxCorners(2.4,2.3,4.45,.18),[0,0,0]],
      broadleaf:[[0,0,0],...ring(.32,.62,.32),...ring(.18,.89,.18),[0,1,0]],
      home:boxCorners(2.9,0,4.7,3.6),
      shop:boxCorners(3.6,0,4.9,4.3),
      mairie:[...boxCorners(3.6,0,5.8,5.5),...boxCorners(1.3,6,9,1.3)],
      ecole:boxCorners(3.6,0,5.7,6.2)
    };
    // The narrow trunk and raised canopy cast distinct silhouettes in low sun.
    const treeParts={
      pine:[boxCorners(.045,0,.55,.05),shadowProfiles.pine.slice(1)],
      broadleaf:[boxCorners(.045,0,.55,.05),[...ring(.17,.37,.17),...shadowProfiles.broadleaf.slice(1)]],
      fir:[boxCorners(.026,0,.32,.026),shadowProfiles.fir.slice(1)]
    };
    function convexOutline(points) {
      points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const hull=[];
      function add(p,start) {
        while(hull.length>=start+2) {
          const a=hull[hull.length-2],b=hull[hull.length-1];
          if((b[0]-a[0])*(p[1]-a[1])>(b[1]-a[1])*(p[0]-a[0])) break;
          hull.pop();
        }
        hull.push(p);
      }
      for (const p of points) add(p,0);
      const end=hull.length-1;
      for (let i=points.length-2;i>=0;i--) add(points[i],end);
      hull.pop();
      return hull;
    }
    function faces(m) {
      const out=[],materials=new Map();
      let group=0, layer=0, side=0, end=0;
      for(let i=0;i<m.data.length;i+=18) {
        const d=m.data;
        while (m.layers?.[group]?.offset===i) ({layer,side,end}=m.layers[group++]);
        const tag=d[i+3]>7.9?8:d[i+3]>5.9?6:d[i+3]>3.9?4:d[i+3]>1.9?2:0;
        const red=d[i+3]-tag;
        const key=(Math.round(red*255)<<16)|(Math.round(d[i+4]*255)<<8)|Math.round(d[i+5]*255);
        if(!materials.has(key)) materials.set(key,[red,d[i+4],d[i+5]]);
        const emission=tag===8 ? materials.get(key) : tag===6 ? [red*.68,d[i+4]*.72,d[i+5]*.78]
          : tag===4 ? [.99,.14,.075] : tag===2 ? [1,.96,.74] : null;
        out.push({layer,side,end,v:[[d[i],d[i+1],d[i+2]],[d[i+6],d[i+7],d[i+8]],[d[i+12],d[i+13],d[i+14]]],
          col:materials.get(key),emission});
      }
      return out;
    }
    for(const type of PROP_TYPES) cars.set(type,faces(prop(type)));
    const busShadows=new Map(fleet.models.map(bus=>[bus,boxCorners(bus.width/2,.15,bus.height,bus.length/2)]));
    function buildingModel(a,lowDetail) {
      const key=[a.type,a.side,a.variant,lowDetail].join('/');
      if(!cars.has(key)) {
        const mesh=new Mesh();
        mesh.layers=[];
        a.building(mesh,a.type,0,0,0,a.side,a.variant,lowDetail);
        cars.set(key,faces(mesh));
      }
      return key;
    }
    function cachedBiomeModel(a) {
      const key='biome/'+a.model+'/'+a.variant;
      if(cars.has(key)) return key;
      const mesh=biomeModelMesh(a.model,a.variant), triangles=faces(mesh);
      const vertices=[],indices=new Map();
      for(const f of triangles) f.indices=f.v.map(v=>{
        const coordinate=v.join(',');
        if(!indices.has(coordinate)) {
          indices.set(coordinate,vertices.length);
          vertices.push(v);
        }
        return indices.get(coordinate);
      });
      triangles.vertices=vertices;
      cars.set(key,triangles);
      if(a.model==='bridgePortal') {
        // The portal is open over the traffic lanes. Each connected piece
        // of the original mesh supplies its own solid shadow silhouette.
        const neighbors=vertices.map(()=>[]),seen=new Set(),parts=[];
        for(const {indices:[a,b,c]} of triangles) {
          neighbors[a].push(b,c);neighbors[b].push(a,c);neighbors[c].push(a,b);
        }
        for(let i=0;i<vertices.length;i++) {
          if(seen.has(i)) continue;
          const stack=[i],part=[];
          while(stack.length) {
            const j=stack.pop();
            if(seen.has(j)) continue;
            seen.add(j);part.push(vertices[j]);stack.push(...neighbors[j]);
          }
          parts.push(part);
        }
        openModelShadows.set(key,parts);
      }
      // Support points on the actual hull keep shadows of skinny palms, wide
      // boats and towers distinct without projecting every triangle again.
      const hull=new Set();
      for(let i=0;i<8;i++) for(const elevation of [-1,0,1]) {
        const dx=Math.cos(i*TAU/8),dz=Math.sin(i*TAU/8);
        let best=-Infinity,vertex;
        for(const v of vertices) {
          const score=dx*v[0]+elevation*v[1]+dz*v[2];
          if(score>best) {best=score;vertex=v;}
        }
        if(vertex) hull.add(vertex);
      }
      biomeShadows.set(key,[...hull]);
      return key;
    }
    function sceneryInSection(index,lapBiomes) {
      const actors=[],start=index*CHUNK;
      for(const id of themesInSection(index,lapBiomes)) {
        const biome=biomeFor(id);
        // Biomes can supply simplified placements, a tiered fir silhouette,
        // or a reduced-detail building mesh for the software renderer.
        if(biome.canvasRoadside) actors.push(...biome.canvasRoadside({
          start,length:CHUNK,road:DRIVABLE_HALF_WIDTH,roadX,random,visible:isRoadsideActorVisible,
          contains:z=>routeThemeAt(z,lapBiomes)===id,heightAt:(x,z)=>terrainHeightAt(x,z,lapBiomes)
        }));
        if(biome.roadside) for(const a of roadsideScenery(index,id,lapBiomes)) {
          const fir=a.type==='pine' && biome.canvasFir;
          const building=a.type!=='broadleaf' && biome.canvasBuilding;
          actors.push({...a,type:fir?'fir':a.type,fir,building});
        }
      }
      return actors.concat(biomeActorsInSection(index,lapBiomes));
    }
    function terrainInSection(index,lapBiomes) {
      const start=index*CHUNK, strips=[];
      if(!themesInSection(index,lapBiomes).some(id=>biomeFor(id).surface)) return strips;
      // World-aligned patches keep shorelines, lakes and dune colours anchored
      // as the camera moves. Heights use the same grid as the hardware terrain.
      let previous;
      for(let z=start;z<=start+CHUNK;z+=4) {
        const center=roadX(z);
        const row=meadowBands.map(offset=>[center+offset,terrainHeightAt(center+offset,z,lapBiomes),z]);
        if(previous && biomeFor(routeThemeAt(z-2,lapBiomes)).surface) {
          const cells=[];
          for(let col=0;col<meadowBands.length-1;col++) {
            const l=meadowBands[col],r=meadowBands[col+1];
            const slope=(previous[col+1][1]-previous[col][1])/(r-l);
            const shade=1-.28*slope+.14*(row[col][1]-previous[col][1])/4;
            const color=surfaceColorAt((l+r)/2,z-2,lapBiomes);
            cells.push({color,shade:Math.round(12*Math.max(.55,Math.min(1.32,shade)))/12});
          }
          strips.push({back:previous,front:row,cells});
        }
        previous=row;
      }
      return strips;
    }
    function render(s) {
      const scale=graphics.resolutionScale, level=graphics.level;
      const w=Math.max(1,Math.round((canvas.clientWidth||640)*scale));
      const h=Math.max(1,Math.round((canvas.clientHeight||400)*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const lapBiomes=s.lapBiomes;
      if(cachedRoute!==lapBiomes) {
        scenerySections.clear();
        terrainSections.clear();
        cars.delete('lapSign');
        cachedSignLap=undefined;
        cachedRoute=lapBiomes;
      }
      const bus=fleetById.get(s.busModel)||fleet.models[0], busOpacity=s.busOpacity??1;
      if(!cars.has(bus)) cars.set(bus,faces(fleet.mesh(bus.id,true)));
      const c=camera(s,w/h,bus), d=s.roadZ ?? s.distance ?? 0;
      const cs=Math.cos(c.a),sn=Math.sin(c.a),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
      const focal=h*.5*c.f;
      // The extra margin covers long shadows and the relief blend on either side of a village.
      const reach=FAR*(1+Math.abs(sn)*w/(2*focal))+270;
      const firstLap=lapAtRoadZ(d-reach), lastLap=lapAtRoadZ(d+reach);
      const zones=[{theme:sceneryForLap(firstLap,lapBiomes),start:-Infinity,end:Infinity}];
      for(let lap=firstLap+1;lap<=lastLap;lap++) {
        const theme=sceneryForLap(lap,lapBiomes), prev=zones[zones.length-1];
        if(prev.theme===theme) continue;
        prev.end=roadZForLap(lap);
        zones.push({theme,start:prev.end,end:Infinity});
      }
      const mixed=zones.length>1, localBiome=biomeFor(zones[0].theme);
      const terrainHeight=mixed ? (x,z)=>terrainHeightAt(x,z,lapBiomes)
        : (x,z)=>heightAtOffset(localBiome,x-roadX(z),z);
      // Light and shadows meet the bridge deck before reaching the water below.
      function receiverHeight(x,z) {
        const offset=x-roadX(z);
        if(Math.abs(offset)<=DRIVABLE_HALF_WIDTH) return 0;
        const height=terrainHeight(x,z);
        if(height<0 && Math.abs(offset)<ROAD+biomeFor(routeThemeAt(z,lapBiomes)).shoulder) return 0;
        return height;
      }
      function point(x,y,z) {
        const dx=x-c.cx,dz=z-c.cz,forward=dx*sn+dz*cs;
        const dy=y-c.cy+groundBend(forward),depth=forward*cp-dy*sp;
        const scale=focal/Math.max(.2,depth);
        return [w*.5+(dx*cs-dz*sn)*scale,h*.5-(dy*cp+forward*sp)*scale,depth,forward];
      }
      function polygon(points,col,target=ctx) {
        target.fillStyle=col;target.beginPath();target.moveTo(points[0][0],points[0][1]);
        for(let i=1;i<points.length;i++) target.lineTo(points[i][0],points[i][1]);
        target.closePath();target.fill();
      }
      const intro=s.introProgress<1;
      const near=intro ? d-FAR : c.cz+1.7, far=d+FAR;
      // Sample the closest visible ridge in each screen column, front to back.
      // Its depth history clips distant crowns even when a bank crosses the road in perspective.
      skyline.fill(h+focal,0,stride);
      if(mixed) skylineZ.fill(c.cz,0,stride);
      for(let row=1;row<rows;row++) {
        const q=row*depthStep, base=groundBend(q)-c.cy, baseDepth=q*cp-base*sp;
        const x0=c.cx+q*sn,z0=c.cz+q*cs, offset=row*stride;
        for(let col=0;col<=columns;col++) {
          const slope=w*(col/columns-.5)/focal;
          let right=slope*baseDepth;
          let hill=terrainHeight(x0+right*cs,z0-right*sn);
          // Refine the azimuth for a raised bank on a pitched camera.
          if(hill!==0) {
            right=slope*(baseDepth-hill*sp);
            hill=terrainHeight(x0+right*cs,z0-right*sn);
          }
          const dy=base+hill;
          const screenY=h*.5-focal*(dy*cp+q*sp)/Math.max(.2,q*cp-dy*sp);
          skyline[offset+col]=Math.min(skyline[offset-stride+col],screenY);
          if(mixed) skylineZ[offset+col]=z0-right*sn;
        }
      }
      function crestAt(px,rowOffset) {
        const col=Math.max(0,Math.min(columns,px*columns/w)), i=Math.min(columns-1,Math.floor(col));
        const left=skyline[rowOffset+i];
        return left+(skyline[rowOffset+i+1]-left)*(col-i);
      }
      function ridgeBefore(forward) {
        return Math.max(0,Math.min(rows-1,Math.ceil(forward/depthStep)-1))*stride;
      }
      const farRidge=(rows-1)*stride,groundLine=skyline[farRidge+columns/2];
      const roadCrest=Math.sqrt(BEND_START*BEND_START+c.cy/BEND_RATE);
      const mountainBase=point(c.cx+roadCrest*sn,0,c.cz+roadCrest*cs)[1];
      const light=lapLighting(s), sun=light.direction;
      const horizonY=c.f*Math.tan(c.pitch);
      const sky=ctx.createLinearGradient(0,h*.5*(1-horizonY-.46),0,h*.5*(1-horizonY+.08));
      const skyColor=rgb=>'rgb('+rgb.map(v=>Math.round(255*v)).join(',')+')';
      sky.addColorStop(0,skyColor(light.zenith));sky.addColorStop(1,skyColor(light.horizon));
      ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      function drawDisc(body,moon,opacity) {
        if(opacity<=0) return;
        const disc=window.BusSky.projectDisc(body,c,skyBackdrop);
        if(!disc) return;
        const x=(1+disc[0])*w*.5,y=(1-disc[1])*h*.5;
        const radius=h*(moon?.0235:.025),halo=h*(moon?.12:.18);
        if(x < -halo || x>w+halo || y < -halo || y>h+halo) return;
        ctx.globalAlpha=opacity;
        const glow=ctx.createRadialGradient(x,y,radius,x,y,halo);
        glow.addColorStop(0,moon?'rgba(145,176,232,.24)':'rgba(255,194,115,.46)');
        glow.addColorStop(1,moon?'rgba(145,176,232,0)':'rgba(255,194,115,0)');
        ctx.fillStyle=glow;ctx.fillRect(x-halo,y-halo,2*halo,2*halo);
        ctx.fillStyle=moon?'#e3ebff':'#ffedb8';
        ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.fill();
        if(moon) {
          ctx.fillStyle='#cbd4ea';ctx.beginPath();
          ctx.arc(x-.30*radius,y-.25*radius,radius*.23,0,TAU);
          ctx.moveTo(x+.37*radius,y+.4*radius);
          ctx.arc(x+.19*radius,y+.4*radius,radius*.18,0,TAU);
          ctx.fill();
        }
        ctx.globalAlpha=1;
      }
      drawDisc(light.sun,false,1-light.night);
      drawDisc(light.moon,true,light.night);
      const pose=coachPose(s,d),busX=pose.x,busYaw=pose.yaw;
      const rocket=rocketAttachment(s,bus,pose,d);
      const lampSin=Math.sin(busYaw),lampCos=Math.cos(busYaw);
      function litColor(col,fog=0,lamp=0,emission=null) {
        const warm=[1,.87,.62];
        const channels=col.map((base,i)=>{
          const sunlight=level.lighting*(1-light.night);
          let lit=base*(light.tint[i]+warm[i]*(lamp*(1+.12*level.lighting))+
            sunlight*(i===0?.105:i===1?.065:.025));
          if(emission) lit+=(emission[i]-lit)*light.night;
          return Math.min(255,Math.round(255*(lit*(1-fog)+light.fog[i]*fog)));
        });
        return 'rgb('+channels.join(',')+')';
      }
      function fogAt(forward) {
        const t=Math.min(1,Math.max(0,(forward-55)/200));
        return .48*t*t*(3-2*t);
      }
      function beamPower(forward,height) {
        const beamY=pose.y+bus.headlamp[1]*Math.cos(pose.pitch)-(bus.headlamp[2]+forward)*Math.sin(pose.pitch);
        return window.BusThreeLighting.beamPower(forward,height-beamY);
      }
      function headlightAt(x,height,z) {
        if(light.night*busOpacity<=0) return 0;
        const dx=x-busX,dz=z-d,forward=dx*lampSin+dz*lampCos-bus.headlamp[2];
        const power=beamPower(forward,height);
        if(!power) return 0;
        const lateral=dx*lampCos-dz*lampSin, width=.26+.18*forward;
        let total=0;
        for(const side of [-1,1]) {
          const offset=(lateral-side*(bus.headlamp[0]+.055*forward))/width;
          const falloff=Math.max(0,1-offset*offset);
          total+=falloff*falloff;
        }
        return light.night*busOpacity*Math.min(1,total*power);
      }
      const skylineScale=skylineScaleAt(d+185*cs,lapBiomes);
      for (let layer=0;layer<2 && skylineScale>0;layer++) {
        ctx.fillStyle=litColor(rgb(layer?'#929979':'#ae9aa9'),layer?.18:.33);ctx.beginPath();ctx.moveTo(-6,h);
        for(let x=-6;x<=w+6;x+=6) {
          const k=x/h*4.8+c.a*.8+layer*4;
          const relief=.065+.032*Math.cos(k)+.027*Math.sin(k*2.9)+.019*Math.cos(k*4.2);
          ctx.lineTo(x,mountainBase+layer*2-h*relief*(layer ? .45 : 1)*skylineScale);
        }
        ctx.lineTo(w+6,h);ctx.fill();
      }
      function grassColor(theme) {
        const grass=biomeFor(theme).grass;
        const gradient=ctx.createLinearGradient(0,groundLine-h*.04,0,groundLine+h*.30);
        gradient.addColorStop(0,litColor(rgb(theme==='hills'?'#acbc86':grass),.25));
        gradient.addColorStop(1,litColor(rgb(grass)));
        return gradient;
      }
      ctx.fillStyle=grassColor(zones[0].theme);ctx.beginPath();ctx.moveTo(0,h);
      for(let col=0;col<=columns;col++) ctx.lineTo(w*col/columns,skyline[farRidge+col]);
      ctx.lineTo(w,h);ctx.fill();
      // Each skyline cell exposes a strip of ground. Clip its visible area at
      // the fixed world-space boundary, including on curves and raised banks.
      function clipZone(points,boundary,side) {
        const clipped=[];
        let prev=points[points.length-1];
        for(const next of points) {
          const inside=(next[2]-boundary)*side>=0;
          if(inside!==((prev[2]-boundary)*side>=0)) {
            const t=(boundary-prev[2])/(next[2]-prev[2]);
            clipped.push([prev[0]+t*(next[0]-prev[0]),prev[1]+t*(next[1]-prev[1]),boundary]);
          }
          if(inside) clipped.push(next);
          prev=next;
        }
        return clipped;
      }
      for(const zone of zones.slice(1)) {
        ctx.fillStyle=grassColor(zone.theme);ctx.beginPath();
        for(let row=1;row<rows;row++) for(let col=0;col<columns;col++) {
          const i=(row-1)*stride+col, j=i+stride;
          if(skyline[i]===skyline[j] && skyline[i+1]===skyline[j+1]) continue;
          const z0=skylineZ[i], z1=skylineZ[i+1], z2=skylineZ[j+1], z3=skylineZ[j];
          const low=Math.min(z0,z1,z2,z3), high=Math.max(z0,z1,z2,z3);
          if(high<zone.start || low>zone.end) continue;
          const x=w*col/columns, right=w*(col+1)/columns;
          let p=[[x,skyline[i],z0],[right,skyline[i+1],z1],[right,skyline[j+1],z2],[x,skyline[j],z3]];
          if(low<zone.start) p=clipZone(p,zone.start,1);
          if(high>zone.end) p=clipZone(p,zone.end,-1);
          if(p.length<3) continue;
          ctx.moveTo(p[0][0],p[0][1]);
          for(let k=1;k<p.length;k++) ctx.lineTo(p[k][0],p[k][1]);
          ctx.closePath();
        }
        ctx.fill();
      }
      function roadClearance(p) {
        return Math.min((roadCrest-p[3])*focal/roadCrest,crestAt(p[0],ridgeBefore(p[3]))+.4-p[1]);
      }
      function appendGroundPath(vertices,clearance,target=ctx,points=vertices.map(v=>point(...v))) {
        let visible=points;
        if (!points.every(p=>p[2]>.25)) {
          if (points.every(p=>p[2]<=.25)) return;
          // A side-facing camera can straddle the road. Clip its crossing edges
          // in world space before projecting them.
          visible=[];
          for(let i=0;i<points.length;i++) {
            const j=(i+1)%points.length, start=points[i][2], finish=points[j][2];
            if(start>.25) visible.push(points[i]);
            if((start>.25)!==(finish>.25)) {
              const ratio=(.25-start)/(finish-start);
              visible.push(point(vertices[i][0]+(vertices[j][0]-vertices[i][0])*ratio,
                vertices[i][1]+(vertices[j][1]-vertices[i][1])*ratio,
                vertices[i][2]+(vertices[j][2]-vertices[i][2])*ratio));
            }
          }
        }
        if(clearance && visible.some(p=>p[3]>depthStep)) {
          const clipped=[];
          let prev=visible[visible.length-1],prevEdge=clearance(prev);
          for(const next of visible) {
            const edge=clearance(next);
            if((prevEdge>0)!==(edge>0)) {
              const t=prevEdge/(prevEdge-edge);
              clipped.push([prev[0]+(next[0]-prev[0])*t,prev[1]+(next[1]-prev[1])*t]);
            }
            if(edge>0) clipped.push(next);
            prev=next;prevEdge=edge;
          }
          if(clipped.length<3) return;
          visible=clipped;
        }
        target.moveTo(visible[0][0],visible[0][1]);
        for(let i=1;i<visible.length;i++) target.lineTo(visible[i][0],visible[i][1]);
        target.closePath();
      }
      function drawTerrainSurfaces() {
        const first=Math.floor(near/CHUNK),last=Math.floor(far/CHUNK), paints=new Map();
        for(const index of terrainSections.keys()) if(index<first||index>last) terrainSections.delete(index);
        for(let index=first;index<=last;index++) {
          if(!terrainSections.has(index)) terrainSections.set(index,terrainInSection(index,lapBiomes));
          let oldRow,oldPoints;
          for(const strip of terrainSections.get(index)) {
            const back=strip.back===oldRow ? oldPoints : strip.back.map(v=>point(...v));
            const front=strip.front.map(v=>point(...v));
            oldRow=strip.front;oldPoints=front;
            for(let i=0;i<strip.cells.length;i++) {
              const p=[back[i],back[i+1],front[i+1],front[i]];
              if(p.every(v=>v[2]<=.25) || p.every(v=>v[2]>.25) &&
                (p.every(v=>v[0]<0)||p.every(v=>v[0]>w)||p.every(v=>v[1]>h)||p.every(v=>v[1]<0))) continue;
              const {color,shade}=strip.cells[i], fog=Math.round(10*fogAt(p[0][3]))/10;
              const key=color+'/'+shade+'/'+fog;
              if(!paints.has(key)) paints.set(key,{path:new Path2D(),style:litColor(rgb(color).map(v=>v*shade),fog)});
              const v=[strip.back[i],strip.back[i+1],strip.front[i+1],strip.front[i]];
              appendGroundPath(v,groundClearance,paints.get(key).path,p);
            }
          }
        }
        for(const {path,style} of paints.values()) { ctx.fillStyle=style;ctx.fill(path); }
      }
      drawTerrainSurfaces();
      function drawRocketLight() {
        const {x,y,z}=rocket.light;
        const above=y-receiverHeight(x,z);
        const falloff=Math.max(0,1-(above/10)**2), spread=Math.sqrt(falloff);
        if(!falloff) return;
        function groundPoint(across,along) {
          const px=x+across*lampCos+along*lampSin,pz=z-across*lampSin+along*lampCos;
          return point(px,receiverHeight(px,pz),pz);
        }
        const center=groundPoint(0,0),side=2.8*spread,end=3.8*spread;
        const left=groundPoint(-side,0),right=groundPoint(side,0),front=groundPoint(0,end),back=groundPoint(0,-end);
        if(center[2]<.25) return;
        ctx.save();
        ctx.transform((right[0]-left[0])/2,(right[1]-left[1])/2,
          (front[0]-back[0])/2,(front[1]-back[1])/2,center[0],center[1]);
        const glow=ctx.createRadialGradient(0,0,0,0,0,1);
        for(const r of [0,.25,.50,.75,1]) glow.addColorStop(r,'rgba(255,94,14,'+(1-r*r)**2+')');
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=rocket.power*falloff*falloff*.67;
        ctx.fillStyle=glow;ctx.fillRect(-1,-1,2,2);
        ctx.restore();
      }
      function drawHeadlightBeams() {
        // Trace equal-intensity contours of each beam onto the same ground as
        // the shadows. The two pools meet as they open up down the road.
        const layers=Math.round(20*level.shadowLayers);
        ctx.fillStyle='#f7dc9c';
        ctx.globalAlpha=light.night*busOpacity*(.40+.12*level.lighting)/layers;
        for(const side of [-1,1]) {
          const slices=[];
          for(let step=0;step<=32;step++) {
            const f=56*step/32;
            const lateral=side*(bus.headlamp[0]+.055*f),forward=f+bus.headlamp[2];
            const z=d+forward*lampCos-lateral*lampSin, x=busX+forward*lampSin+lateral*lampCos;
            slices.push({x,z,width:.26+.18*f,power:beamPower(f,receiverHeight(x,z))});
          }
          window.BusThreeLighting.beamContours(slices,layers,lampCos,lampSin,receiverHeight,outline=>{
            ctx.beginPath();appendGroundPath(outline,groundClearance);ctx.fill();
          });
        }
      }
      function drawLampGlows(a) {
        const dx=c.cx-a.x,dz=c.cz-a.z;
        const along=dx*lampSin+dz*lampCos,front=along>=0;
        const [lx,ly,lz]=front?bus.headlamp:bus.taillamp;
        const facing=(Math.abs(along)-Math.abs(lz))/Math.max(1,Math.hypot(dx,dz));
        if(facing<=0) return;
        const cr=Math.cos(a.roll),sr=Math.sin(a.roll),ct=Math.cos(a.pitch),st=Math.sin(a.pitch);
        ctx.save();ctx.globalAlpha=light.night*busOpacity*Math.min(1,2*facing);
        for(const side of [-1,1]) {
          const y=ly*ct-lz*st,z=ly*st+lz*ct,x=side*lx*cr-y*sr;
          const p=point(a.x+x*lampCos+z*lampSin,a.y+side*lx*sr+y*cr,a.z-x*lampSin+z*lampCos);
          if(p[2]<.25) continue;
          const radius=(front?.34:.23)*focal/p[2];
          const glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],radius);
          glow.addColorStop(0,front?'rgba(255,251,212,.9)':'rgba(255,63,29,.85)');
          glow.addColorStop(.38,front?'rgba(255,226,153,.35)':'rgba(255,44,20,.35)');
          glow.addColorStop(1,front?'rgba(255,212,130,0)':'rgba(255,44,20,0)');
          ctx.fillStyle=glow;ctx.fillRect(p[0]-radius,p[1]-radius,2*radius,2*radius);
        }
        ctx.restore();
      }
      function ribbon(l,r,y,color,dashed=false,start=near,end=far) {
        ctx.fillStyle=litColor(rgb(color));ctx.beginPath();
        for(let z=Math.floor(end/4)*4;z>=start-4;z-=4) {
          if(dashed && z%12!==0) continue;
          const a=Math.max(z,start), b=Math.min(z+4,end);
          if(a>=b) continue;
          const ax=roadX(a), bx=roadX(b);
          appendGroundPath([[ax+l,y,a],[ax+r,y,a],[bx+r,y,b],[bx+l,y,b]],roadClearance);
        }
        ctx.fill();
      }
      for(const zone of zones) {
        const start=Math.max(near,zone.start),end=Math.min(far,zone.end);
        if(start>=end) continue;
        const biome=biomeFor(zone.theme);
        drawShoulders(biome,start,end,lapBiomes,(a,b,l,r,y,color)=>ribbon(l,r,y,color,false,a,b));
        ribbon(-ROAD,ROAD,0,biome.roadColor,false,start,end);
        if(biome.curb) for(const side of [-1,1]) {
          const curb=side*(DRIVABLE_HALF_WIDTH+.20);
          ribbon(curb-.10,curb+.10,.02,'#e6d8ba',false,start,end);
        }
        for(const detail of biome.roadDetails) ribbon(detail.left,detail.right,detail.y,detail.color,false,start,end);
        if(biome.roadPaint) for(let z=Math.floor(start/4)*4;z<end;z+=4) {
          for(const stripe of biome.roadPaint(z)) {
            ribbon(stripe.left,stripe.right,stripe.y,stripe.color,false,Math.max(z,start),Math.min(z+stripe.length,end));
          }
        }
      }
      for(const side of [-1,1]) {
        const x=side*(ROAD-.16);
        ribbon(x-.06,x+.06,.02,'#f7db8c');
        ribbon(side*LANE*.5-.09,side*LANE*.5+.09,.02,'#fcf8de',true);
      }
      function model(type,x,y,z,yaw,roll,pitch=0,sx=1,sy=1,sz=1,alpha=1,lamp=0) {
        const source=cars.get(type);
        if(!source || alpha<=0) return;
        const cy=Math.cos(yaw),snYaw=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),tris=[];
        const cpitch=Math.cos(pitch),spitch=Math.sin(pitch);
        const cameraSide=((c.cx-x)*cy-(c.cz-z)*snYaw)*cr+(c.cy-y)*sr;
        const cameraEnd=(c.cx-x)*snYaw+(c.cz-z)*cy;
        const fog=fogAt((x-c.cx)*sn+(z-c.cz)*cs),palette=new Map();
        function projectVertex([vx,vy,vz]) {
          const py=vy*sy*cpitch-vz*sz*spitch,pz=vy*sy*spitch+vz*sz*cpitch;
          const lx=vx*sx*cr-py*sr;
          return point(x+lx*cy+pz*snYaw,y+vx*sx*sr+py*cr,z-lx*snYaw+pz*cy);
        }
        const projected=source.vertices?.map(projectVertex);
        for(const f of source) {
          if (f.side && f.side*cameraSide<1.1) continue;
          if (f.end && f.end*cameraEnd<2.5) continue;
          let p=projected ? f.indices.map(i=>projected[i]) : f.v.map(projectVertex);
          if(projected && p.some(v=>v[2]<=.2)) {
            if(p.every(v=>v[2]<=.2)) continue;
            const clipped=[];
            let prev=p[p.length-1];
            for(const next of p) {
              if((prev[2]>.2)!==(next[2]>.2)) {
                const t=(.2-prev[2])/(next[2]-prev[2]);
                const a=(1-t)*Math.max(.2,prev[2]), b=t*Math.max(.2,next[2]);
                clipped.push([w/2+((prev[0]-w/2)*a+(next[0]-w/2)*b)/.2,
                  h/2+((prev[1]-h/2)*a+(next[1]-h/2)*b)/.2,.2]);
              }
              if(next[2]>.2) clipped.push(next);
              prev=next;
            }
            p=clipped;
          }
          if(projected || p.every(v=>v[2]>.2)) {
            if(projected && (p.every(v=>v[0]<0)||p.every(v=>v[0]>w)||p.every(v=>v[1]<0)||p.every(v=>v[1]>h))) continue;
            const layer=f.layer>=2 && c.cy-y<2.94 ? f.layer-4 : f.layer;
            // Layer coplanar glass and trim by their outward offset. Centre
            // depth alone splits a reflection in two on a three-quarter view.
            let depth=p[0][2]+p[1][2]+p[2][2];
            if(f.end) depth=-f.end*(f.v[0][2]+f.v[1][2]+f.v[2][2]);
            if(f.side) depth=-f.side*(f.v[0][0]+f.v[1][0]+f.v[2][0]);
            if(!palette.has(f.col)) palette.set(f.col,litColor(f.col,fog,lamp));
            const col=f.emission&&light.night>0 ? litColor(f.col,fog,lamp,f.emission) : palette.get(f.col);
            tris.push({p,layer,z:depth,col});
          }
        }
        tris.sort((a,b)=>a.layer-b.layer||b.z-a.z);
        if (alpha>=1) {
          for (const t of tris) polygon(t.p,t.col);
          return;
        }
        // Fade the visible silhouette once so the triangles behind it do not show through.
        let left=w,right=0,top=h,bottom=0;
        for (const t of tris) for (const [px,py] of t.p) {
          left=Math.min(left,px); right=Math.max(right,px);
          top=Math.min(top,py); bottom=Math.max(bottom,py);
        }
        left=Math.max(0,Math.floor(left)); top=Math.max(0,Math.floor(top));
        const width=Math.min(w,Math.ceil(right))-left,height=Math.min(h,Math.ceil(bottom))-top;
        if (width<=0 || height<=0) return;
        if (fadeCanvas.width<width) fadeCanvas.width=Math.ceil(width/32)*32;
        if (fadeCanvas.height<height) fadeCanvas.height=Math.ceil(height/32)*32;
        fadeContext.setTransform(1,0,0,1,-left,-top);
        fadeContext.clearRect(left,top,width,height);
        for (const t of tris) polygon(t.p,t.col,fadeContext);
        ctx.globalAlpha=alpha;
        ctx.drawImage(fadeCanvas,0,0,width,height,left,top,width,height);
        ctx.globalAlpha=1;
      }
      const actors=[];
      // A tree just outside the streamed view can still shade the foreground.
      const sunHeight=Math.max(.12,sun.y),casterMargin=Math.min(FAR,40/sunHeight);
      const first=Math.floor((near-casterMargin)/CHUNK),last=Math.floor((far+casterMargin)/CHUNK);
      for(const index of scenerySections.keys()) if(index<first||index>last) scenerySections.delete(index);
      for(let index=first;index<=last;index++) {
        if(!scenerySections.has(index)) scenerySections.set(index,sceneryInSection(index,lapBiomes));
        for(const a of scenerySections.get(index)) actors.push(a.motion ? biomeActorPose(a,s.time||0) : a);
      }
      for(let lap=Math.max(2,firstLap);lap<=lastLap;lap++) {
        const z=roadZForLap(lap);
        if(z>=near-casterMargin && z<=far+casterMargin)
          actors.push({type:'lapSign',lap,x:roadX(z)+LAP_SIGN_OFFSET,y:0,z});
      }
      for(const o of s.objects||[]) if(o.z>=-8 && o.z<=FAR) {
        const z=d+o.z, pickup=o.type==='repair'||o.type==='boost'||o.type==='rocket', t=s.time||0;
        const hover=pickup && window.BusBoost.hover(t,z);
        actors.push({type:o.type,x:roadX(z)+o.lane*LANE,z,y:hover?hover.lift:0,
          yaw:Math.atan(roadSlope(z))+(hover?hover.turn:0),ground:o.type==='oil'||o.type==='pothole'});
      }
      if(busOpacity>0) actors.push({type:'bus',...pose,z:d,alpha:coachOpacity(s,busOpacity)});
      if(rocket) {
        const mount={...rocket.nozzle,yaw:pose.yaw,pitch:pose.pitch,roll:pose.roll};
        actors.push({type:'rocketMotor',...mount},{type:'rocketFlame',...mount,
          sx:rocket.width,sy:rocket.width,sz:rocket.length});
      }
      landingShadow(s,bus,(sx,sz,alpha)=>{
        actors.push({type:'jumpShade',ground:true,x:busX,y:.044,z:d,yaw:busYaw,sx,sz,alpha});
      });
      actors.push(...updateSpray(s));
      impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
        const ground=type==='oil'||type==='waterRipple'||type==='repairHalo'||type==='boostHalo';
        actors.push({type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha,ground});
      });
      for (const a of actors) {
        const centerY=(a.y||0)+(a.type==='bus' ? bus.height : a.height||0)*.5;
        a.forward=(a.x-c.cx)*sn+(a.z-c.cz)*cs;
        a.depth=a.forward*cp-(centerY+groundBend(a.forward))*sp;
      }
      actors.sort((a,b)=>Number(Boolean(b.ground))-Number(Boolean(a.ground))||b.depth-a.depth);
      function clipToRidge(base,halfWidth) {
        if(base[3]<depthStep) return false;
        const row=ridgeBefore(base[3]);
        if(base[1]<Math.min(crestAt(base[0]-halfWidth,row),crestAt(base[0],row),crestAt(base[0]+halfWidth,row))+.5) return false;
        ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w,0);
        for(let col=columns;col>=0;col--) ctx.lineTo(w*col/columns,skyline[row+col]+.5);
        ctx.closePath();ctx.clip();
        return true;
      }
      function drawSolid(a) {
        const base=point(a.x,a.y,a.z);
        const modular=a.type==='biomeModel',radius=modular?a.radius:a.building?9:a.type==='lapSign'?2.4:1.4;
        const halfWidth=focal*radius/Math.max(1,base[2]-radius);
        if(a.building || modular) {
          const height=a.height||10, depth=base[2]+radius, lateral=(a.x-c.cx)*cs-(a.z-c.cz)*sn;
          if(a.forward < -radius || a.forward>FAR+radius || (Math.abs(lateral)-radius)*focal>depth*w*.5) return;
          if(Math.max(2*radius,height)*focal/Math.max(1,depth)<1) return;
          const top=point(a.x,a.y+height,a.z),row=ridgeBefore(a.forward-radius);
          if(top[2]>1 && top[1]>Math.max(crestAt(base[0]-halfWidth,row),crestAt(base[0],row),crestAt(base[0]+halfWidth,row))+1) return;
        }
        const clipped=clipToRidge(base,halfWidth);
        const lamp=a.ground?0:headlightAt(a.x,a.y+.65,a.z);
        if(a.type==='lapSign' && cachedSignLap!==a.lap) {
          const mesh=new Mesh();
          mesh.layers=[];
          lapSign(mesh,a.lap,0,0,0,lapBiomes);
          cars.set('lapSign',faces(mesh));
          cachedSignLap=a.lap;
        }
        const type=a.type==='bus' ? bus : modular ? cachedBiomeModel(a) : a.building ? buildingModel(a,focal/Math.max(1,base[2])<4) : a.type;
        const scale=modular?a.size:undefined;
        model(type,a.x,a.y,a.z,a.yaw||0,a.roll||0,a.pitch,scale??a.sx,scale??a.sy,scale??a.sz,a.alpha,lamp);
        if(a.type==='bus'&&light.night>0) drawLampGlows(a);
        if(clipped) ctx.restore();
      }
      for(const a of actors) if(a.ground) drawSolid(a);

      const rayX=-sun.x/sunHeight,rayZ=-sun.z/sunHeight;
      const rayLength=Math.hypot(rayX,rayZ),sunX=rayLength?rayX/rayLength:0,sunZ=rayLength?rayZ/rayLength:1;
      const rayStep=4/Math.max(1,rayLength);
      const angularRadius=.019,sideSpread=angularRadius/sunHeight,alongSpread=sideSpread/sunHeight;
      // Find where the light ray meets the meadow, including shadows stretching
      // from an elevated bank across the flat road.
      function land(x,y,z) {
        let fall=Math.max(0,y-receiverHeight(x,z));
        for(let i=0;i<4;i++) {
          const next=Math.max(0,y-receiverHeight(x+rayX*fall,z+rayZ*fall));
          if(Math.abs(next-fall)<.015) break;
          fall=(fall+next)*.5;
        }
        return [x+rayX*fall,z+rayZ*fall];
      }
      function groundClearance(p) { return crestAt(p[0],ridgeBefore(p[3]))+.4-p[1]; }
      function areaShadowContour(outline) {
        // Trace the boundary in the light's plane before it meets the receiver.
        // Subdividing after landing would shortcut banks crossed by long shadows.
        const rim=[],bounds=[],spacing=level===graphicsLevels.extreme?2:3;
        let maxScreenSpread=0,aboveSurface=false;
        for(let i=0;i<outline.length;i++) {
          const [u,v,y]=outline[i],[nu,nv,ny]=outline[(i+1)%outline.length];
          const steps=Math.max(1,Math.ceil(Math.hypot(nu-u,nv-v)/spacing));
          for(let k=0;k<steps;k++) {
            const t=k/steps,top=y+t*(ny-y);
            const x=u+t*(nu-u)-rayX*top,z=v+t*(nv-v)-rayZ*top;
            // Advance at most one terrain cell along the ray, stopping at the
            // first bank or bridge deck. Interpolate the last crossing.
            let drop=0,gap=top-receiverHeight(x,z);
            while(gap>.015) {
              const step=Math.min(gap,rayStep),next=drop+step;
              const nextGap=top-next-receiverHeight(x+rayX*next,z+rayZ*next);
              if(nextGap<0) {
                const hit=drop+step*gap/(gap-nextGap);
                const error=top-hit-receiverHeight(x+rayX*hit,z+rayZ*hit);
                if(Math.abs(error)<.08) drop=hit;
                else {
                  // Refine discontinuities such as the step from water to the deck.
                  let low=drop,high=next;
                  for(let j=0;j<5;j++) {
                    const mid=(low+high)*.5;
                    if(top-mid>receiverHeight(x+rayX*mid,z+rayZ*mid)) low=mid;
                    else high=mid;
                  }
                  drop=high;
                }
                break;
              }
              drop=next;gap=nextGap;
            }
            const px=x+rayX*drop,pz=z+rayZ*drop;
            const ground=receiverHeight(px,pz),vertex=[px,ground,pz,drop],screen=point(...vertex);
            if(top>=ground-.02) aboveSurface=true;
            // Along-ray softness can be strongly foreshortened at sunset.
            // Use its projected extent to spend extra samples only where visible.
            const sx=px+drop*alongSpread*sunX,sz=pz+drop*alongSpread*sunZ;
            const edge=point(sx,receiverHeight(sx,sz),sz);
            maxScreenSpread=Math.max(maxScreenSpread,drop*sideSpread*focal/Math.max(1,screen[2]),
              Math.hypot(edge[0]-screen[0],edge[1]-screen[1]));
            rim.push(vertex);bounds.push(screen);
          }
        }
        const pad=maxScreenSpread+2;
        if(!aboveSurface || bounds.every(p=>p[2]<=.25) || bounds.every(p=>p[2]>.25) &&
          (bounds.every(p=>p[0]<-pad)||bounds.every(p=>p[0]>w+pad)||bounds.every(p=>p[1]>h+pad)||
           bounds.every(p=>groundClearance(p)<-pad))) return null;
        return {rim,bounds,maxScreenSpread};
      }
      function drawAreaShadow(outlines,opacity) {
        const contours=outlines.map(areaShadowContour).filter(Boolean);
        if(!contours.length) return;
        const spread=Math.max(...contours.map(p=>p.maxScreenSpread))*Math.sqrt(light.shadow);
        const count=spread<.55?1:spread<2?5:spread>5 && opacity>.33 && level===graphicsLevels.extreme?17:9;
        ctx.globalAlpha=1-Math.exp(-2*opacity/(Math.PI*count));
        for(const [across,along] of lightDiscs.get(count)) {
          const dx=across*sideSpread*sunZ+along*alongSpread*sunX;
          const dz=-across*sideSpread*sunX+along*alongSpread*sunZ;
          ctx.beginPath();
          for(const {rim,bounds} of contours) {
            if(dx===0 && dz===0) appendGroundPath(rim,groundClearance,ctx,bounds);
            else appendGroundPath(rim.map(([x,,z,drop])=>{
              x+=dx*drop;z+=dz*drop;
              return [x,receiverHeight(x,z),z];
            }),groundClearance);
          }
          ctx.fill();
        }
      }
      function drawShadow(a,profile) {
        if(a.forward < -casterMargin || a.forward>FAR+casterMargin) return;
        if(a.type==='fir' || a.type==='biomeModel') {
          const tip=a.forward+(rayX*sn+rayZ*cs)*(Math.max(0,a.y)+(a.height||a.size));
          const radius=a.radius||8;
          if(Math.min(a.forward,tip)>roadCrest+20+radius || Math.max(a.forward,tip)<-radius) return;
        }
        const yaw=a.yaw||0,roll=a.roll||0,pitch=a.pitch||0;
        const cy=Math.cos(yaw),sy=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),ct=Math.cos(pitch),st=Math.sin(pitch);
        const areaLight=level===graphicsLevels.high || level===graphicsLevels.extreme;
        function projectProfile([vx,vy,vz]) {
          const x=vx*(a.size||a.sx||1), y=vy*(a.size||a.sy||1), z=vz*(a.size||a.sz||1);
          const py=y*ct-z*st,pz=y*st+z*ct,px=x*cr-py*sr;
          const wx=a.x+px*cy+pz*sy,wy=a.y+x*sr+py*cr,wz=a.z-px*sy+pz*cy;
          return areaLight?[wx+rayX*wy,wz+rayZ*wy,wy]:land(wx,wy,wz);
        }
        const opacity=light.shadow*(a.type==='bus'?busOpacity:a.alpha??1)*(.72-.32*Math.min(1,Math.max(0,a.forward)/FAR));
        if(areaLight) {
          const parts=treeParts[a.type] || (a.model==='bridgePortal' && openModelShadows.get(cachedBiomeModel(a))) || [profile];
          drawAreaShadow(parts.map(part=>convexOutline(part.map(projectProfile))).filter(hull=>hull.length>=3),opacity);
          return;
        }
        const outline=convexOutline(profile.map(projectProfile));
        if(outline.length<3) return;
        let mx=0,mz=0;
        const rim=[];
        for(let i=0;i<outline.length;i++) {
          const [x,z]=outline[i], [nx,nz]=outline[(i+1)%outline.length];
          mx+=x;mz+=z;
          const steps=Math.ceil(Math.hypot(nx-x,nz-z)*level.shadowLayers/4);
          for(let k=0;k<steps;k++) {
            const px=x+(nx-x)*k/steps,pz=z+(nz-z)*k/steps;
            rim.push([px,pz]);
          }
        }
        mx/=outline.length;mz/=outline.length;
        const footprint=scale=>rim.map(([x,z])=>{
          x=mx+(x-mx)*scale;z=mz+(z-mz)*scale;
          return [x,receiverHeight(x,z),z];
        });
        const outer=footprint(1.34),screen=outer.map(v=>point(...v));
        const center=point(mx,receiverHeight(mx,mz),mz);
        const penumbra=a.building ? .72 : a.size ? a.size*.16 : a.type==='bus' ? .58 : .2;
        const blur=Math.min(h*.055,penumbra*focal/Math.max(2,center[2]));
        if(screen.every(p=>p[2]<=.25) || (screen.every(p=>p[2]>.25) &&
          (screen.every(p=>p[0]<-3*blur)||screen.every(p=>p[0]>w+3*blur)||screen.every(p=>p[1]>h+3*blur)||screen.every(p=>groundClearance(p)<-1)))) return;
        // Drape nested contours on the terrain. A smooth opacity ramp and
        // extra samples for large shadows keep the foreground feathered.
        const maxLayers=a.type==='fir' || a.type==='biomeModel'?8:36;
        const layers=Math.max(3,Math.round(Math.max(6,Math.min(maxLayers,Math.ceil(2*blur)))*level.shadowLayers));
        for(let i=0;i<layers;i++) {
          ctx.globalAlpha=opacity*Math.sin(Math.PI*(i+.5)/layers)/layers;
          ctx.beginPath();
          appendGroundPath(i===0?outer:footprint(1.34-i*.72/(layers-1)),groundClearance);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.beginPath();ctx.moveTo(0,h);
      for(let col=0;col<=columns;col++) ctx.lineTo(w*col/columns,skyline[farRidge+col]);
      ctx.lineTo(w,h);ctx.clip();
      ctx.fillStyle=litColor(rgb('#283849'));
      for(const a of actors) {
        if(light.shadow<=.005) break;
        const profile=a.type==='bus' ? busShadows.get(bus) : a.type==='biomeModel' ? biomeShadows.get(cachedBiomeModel(a)) : shadowProfiles[a.type];
        if(profile) drawShadow(a,profile);
      }
      if(light.night*busOpacity>0) drawHeadlightBeams();
      if(rocket) drawRocketLight();
      ctx.restore();
      function drawForestFir(a) {
        const base=point(a.x,a.y,a.z), top=point(a.x,a.y+a.size,a.z);
        const lateral=(a.x-c.cx)*cs-(a.z-c.cz)*sn, radius=a.size*.22;
        if(base[2]<.25 || a.forward>FAR || (Math.abs(lateral)-radius)*focal>base[2]*w*.5) return;
        const half=radius*focal/Math.max(1,top[2]), row=ridgeBefore(a.forward);
        if(top[2]>.25 && top[1]>Math.max(crestAt(base[0]-half,row),crestAt(base[0],row),crestAt(base[0]+half,row))+1) return;
        const clipped=clipToRidge(base,half), fog=fogAt(a.forward);
        const trunkLamp=headlightAt(a.x,a.y+.65,a.z), crownLamp=headlightAt(a.x,a.y+a.size*.67,a.z);
        // Project the tiers at their own height. Nearby firs can extend past
        // the camera plane, where a screen-space silhouette would diverge.
        const vertex=(offset,height)=>[a.x+offset*a.size*cs,a.y+height*a.size,a.z-offset*a.size*sn];
        function face(vertices,color) {
          ctx.fillStyle=color;ctx.beginPath();appendGroundPath(vertices);ctx.fill();
        }
        face([vertex(-.026,0),vertex(.026,0),vertex(.026,.32),vertex(-.026,.32)],litColor(rgb('#715b44'),fog,trunkLamp));
        const needles=litColor(rgb(a.fir.needles[a.variant]),fog,crownLamp);
        const shaded=litColor(rgb('#34594f'),fog,crownLamp);
        for(const [low,tip,spread] of a.fir.tiers) {
          const peak=vertex(0,tip), fold=vertex(spread*.20,low);
          face([peak,vertex(-spread,low+.025),fold],needles);
          face([peak,fold,vertex(spread,low+.025)],shaded);
        }
        if(clipped) ctx.restore();
      }
      for(const a of actors) {
        if(a.ground) continue;
        let clipped=false;
        if(a.type==='shoulderChip') {
          const [l,top,r,bottom]=chipCorners(a,cs,sn).map(v=>point(...v));
          if(l[2]<.3) continue;
          const color=rgb(a.color).map(channel=>channel*a.shade);
          polygon([l,top,bottom],litColor(color));
          polygon([top,r,bottom],litColor(color.map(channel=>channel*.80)));
        } else if(a.type==='fir') {
          drawForestFir(a);
        } else if(a.type==='pine' || a.type==='broadleaf') {
          const b=point(a.x,a.y,a.z),top=point(a.x,a.y+a.size,a.z),sh=b[1]-top[1];
          if(b[2]<1||sh<1||b[0]<-sh||b[0]>w+sh) continue;
          const half=sh*.33, row=ridgeBefore(a.forward);
          if(top[1]>Math.max(crestAt(b[0]-half,row),crestAt(b[0],row),crestAt(b[0]+half,row))+1) continue;
          clipped=clipToRidge(b,half);
          const fog=fogAt(a.forward),crownLamp=headlightAt(a.x,a.y+a.size*.67,a.z);
          ctx.fillStyle=litColor(rgb('#856a48'),fog,headlightAt(a.x,a.y+.65,a.z));ctx.fillRect(b[0]-sh*.045,b[1]-.53*sh,.09*sh,.55*sh);
          if(a.type==='pine') {
            polygon([[b[0],top[1]],[b[0]-.3*sh,b[1]-.24*sh],[b[0]+.29*sh,b[1]-.24*sh]],litColor(rgb('#608261'),fog,crownLamp));
            polygon([[b[0],top[1]],[b[0]+.29*sh,b[1]-.24*sh],[b[0]+.055*sh,b[1]-.24*sh]],litColor(rgb('#486c54'),fog,crownLamp));
          } else {
            ctx.fillStyle=litColor(rgb('#89a153'),fog,crownLamp);ctx.beginPath();ctx.ellipse(b[0],top[1]+sh*.33,sh*.32,sh*.34,0,0,TAU);ctx.fill();
          }
        } else {
          drawSolid(a);
        }
        if(clipped) ctx.restore();
      }
    }
    return {render,renderer:'Canvas 2D',dispose(){}};
  }

  window.BusWorld = {
    init(canvas,preferences) {
      const graphics={level:graphicsLevels.medium,resolutionScale:1};
      function setGraphicsSettings(settings={}) {
        if(Object.hasOwn(graphicsLevels,settings.detail)) graphics.level=graphicsLevels[settings.detail];
        if(settings.resolutionScale===1 || settings.resolutionScale===2) graphics.resolutionScale=settings.resolutionScale;
      }
      setGraphicsSettings(preferences);
      const options={antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false};
      const context=window.THREE && canvas.getContext('webgl2',options);
      if(context) return {...threeRenderer(canvas,context,graphics),setGraphicsSettings};
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx) throw Error('Le navigateur ne peut pas créer de surface de dessin.');
      return {...canvasRenderer(canvas,ctx,graphics),setGraphicsSettings};
    }
  };
})();
