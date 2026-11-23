/* Local coordinates: Y up, +Z forward. Shared by WebGL and the software renderer. */
(() => {
  'use strict';
  const {Mesh, lettering, turn:TAU} = window.BusMesh;

  const wheelRadius=.46, axleHeight=.52;

  function drawWheel(m,side,x,y,z,segments,hub,articulated) {
    const loop=(offset,rad,col) => {
      const a=x+side*offset;
      for(let i=0;i<segments;i++) {
        const u=i*TAU/segments, v=(i+1)*TAU/segments;
        m.tri([a,y,z],[a,y+rad*Math.cos(u),z+rad*Math.sin(u)],[a,y+rad*Math.cos(v),z+rad*Math.sin(v)],col);
      }
    };
    for(let i=0;i<segments;i++) {
      const u=i*TAU/segments,v=(i+1)*TAU/segments, ax=x+side*.12, bx=x-side*.17;
      m.quad([ax,y+wheelRadius*Math.cos(u),z+wheelRadius*Math.sin(u)],[bx,y+wheelRadius*Math.cos(u),z+wheelRadius*Math.sin(u)],[bx,y+wheelRadius*Math.cos(v),z+wheelRadius*Math.sin(v)],[ax,y+wheelRadius*Math.cos(v),z+wheelRadius*Math.sin(v)],'#35444b');
    }
    loop(.12,wheelRadius,'#313d44'); loop(.125,.28,hub);
    if(segments>8) { loop(.13,.18,'#75888a'); loop(.135,.095,'#cfd8ce'); }
    if(articulated) {
      // Steering exposes the inner sidewall. The hub slots make rolling visible.
      loop(-.17,wheelRadius,'#313d44');
      const face=x+side*.128;
      const point=(angle,r)=>[face,y+r*Math.cos(angle),z+r*Math.sin(angle)];
      for(let i=0;i<5;i++) {
        const a=i*TAU/5;
        m.quad(point(a-.18,.197),point(a+.18,.197),point(a+.14,.256),point(a-.14,.256),'#52626a');
      }
    }
  }

  // Axles are listed from rear to front. The arcade mesh keeps its original triangle/layer order.
  function addWheels(body,wheelParts,side,axles,lowDetail,halfWidth=1.16,hub='#dfd8bb') {
    const x=side*halfWidth, segments=lowDetail?8:14;
    for(const z of axles) {
      if(wheelParts) {
        const mesh=new Mesh();
        drawWheel(mesh,side,0,0,0,segments,hub,true);
        wheelParts.push({mesh,x,y:axleHeight,z,front:z===axles[axles.length-1],radius:wheelRadius});
      } else drawWheel(body,side,x,axleHeight,z,segments,hub,false);
    }
  }

  function alpineCoach(lowDetail,wheelParts) {
    const m=new Mesh();
    // Canvas draws exterior trim after the body and luggage after the rack.
    // A triangle's centre depth alone cannot order small decals on a long face.
    const layers = [];
    const mark = (layer, side=0, end=0) => {
      if (lowDetail) layers.push({offset:m.data.length, layer, side, end});
    };
    // Both renderers read the lens material from the unused red-channel range.
    function markLens(first,tag) {
      for(let i=first+3;i<m.data.length;i+=6) m.data[i]+=tag;
    }
    function mountainDecal(point) {
      for(const [foot,peak,edge,height,ink,layer] of [
        [-1,-.40,.26,.78,'#77a7a0',0],[-.53,.20,1,1,'#336477',1]
      ]) {
        m.tri(point(foot,0,layer),point(peak,height,layer),point(edge,0,layer),ink);
        const left=peak+(foot-peak)*.46, right=peak+(edge-peak)*.46;
        const tip=point(peak,height,layer+1), notch=point(peak,height*.65,layer+1);
        m.tri(tip,point(left,height*.54,layer+1),notch,'#fff3d6');
        m.tri(tip,notch,point(right,height*.54,layer+1),'#fff3d6');
      }
    }
    m.layers = layers;
    m.shell([[1.02,.34,2.40,.16],[1.16,.52,2.57,.22],[1.18,1.35,2.61,.25]],'#d84b3a');
    m.shell([[1.181,1.32,2.611,.25],[1.185,1.54,2.614,.25]],'#fff0ce');
    m.shell([[1.181,1.53,2.611,.25],[1.17,1.65,2.59,.25],[1.13,2.66,2.49,.25]],'#fff8df');
    m.shell([[1.14,2.61,2.51,.25],[1.16,2.73,2.53,.28],[1.04,2.9,2.37,.34],[.9,2.94,2.25,.32]],'#f7edd1');
    mark(1,0,-1);
    m.box(0,.54,-2.609,2.14,.135,.16,'#d3d5bf');
    m.box(0,.51,-2.68,1.4,.047,.04,'#82918d');
    function panel(x,y,w,h,r,z,col) {
      if (lowDetail && z<0) {
        m.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],col);
        return;
      }
      const ring=[];
      const steps=lowDetail?1:3;
      for(const [dx,dy,start] of [[1,1,0],[-1,1,.25],[-1,-1,.5],[1,-1,.75]]) {
        for(let j=0;j<=steps;j++) {
          const a=(start+j/(4*steps))*TAU;
          ring.push([x+dx*(w/2-r)+r*Math.cos(a),y+dy*(h/2-r)+r*Math.sin(a),z]);
        }
      }
      for(let j=0;j<ring.length;j++) m.tri([x,y,z],ring[j],ring[(j+1)%ring.length],col);
    }
    panel(0,2.073,2.03,.83,.13,-2.621,'#d0c6aa');
    panel(0,2.073,1.96,.77,.105,-2.638,'#3b4f59');
    for(const dir of [-1,1]) panel(dir*.47,2.075,.85,.651,.07,-2.648,'#538294');
    for(const k of [-.865,.075]) {
      m.quad([k,2.29,-2.651],[k+.57,2.29,-2.651],[k+.70,2.36,-2.651],[k+.11,2.36,-2.651],'#83a8b0');
    }
    panel(0,2.604,.63,.232,.07,-2.64,'#decbad');
    panel(0,2.604,.58,.197,.055,-2.652,'#374b50');
    lettering(m,'03',0,2.67,-2.658,.029,'#ffdf89');
    m.box(0,.76,-2.622,.58,.2,.045,'#ffdb89');
    if (!lowDetail) lettering(m,'BS3',0,.917,-2.648,.0205,'#455257');
    for(const s of [-1,1]) {
      mark(1,0,-1);
      m.box(s*.93,.78,-2.61,.215,.34,.08,'#703d38');
      m.box(s*.93,.94,-2.658,.16,.106,.021,'#ffc66a');
      const tailLens=m.data.length;
      m.box(s*.93,.82,-2.658,.16,.10,.021,'#fb7760');
      markLens(tailLens,4);
      mark(1,s);
      mountainDecal((u,v,layer)=>[s*(1.185+.003*layer),.68+.60*v,u*1.10]);
      for(let j=0;j<4;j++) {
        const z=-1.67+j*1.03;
        m.box(s*1.129,1.68,z,.115,.85,.88,'#405962');
        m.box(s*1.19,1.77,z,.02,.66,.73,'#5d98a4');
        m.box(s*1.203,2.19,z,.014,.19,.72,'#77aeb7');
      }
      addWheels(m,wheelParts,s,[-1.55,1.54],lowDetail);
      m.box(s*1.25,2.1,1.77,.27,.055,.09,'#586a68');
      m.box(s*1.39,2.01,1.77,.11,.25,.15,'#52666a');
    }
    mark(1,0,-1);
    mountainDecal((u,v,layer)=>[-.46+.34*u,.99+.29*v,-2.619-.003*layer]);
    for(let i=0;i<4;i++) m.box(.56,1.00+i*.077,-2.622,.52,.024,.018,'#b34b3d');
    // A destination blind, split windscreen and warm headlamps face the direction of travel.
    mark(1,0,1);
    panel(0,2.08,2.02,.94,.13,2.621,'#bcb99f');
    panel(0,2.08,1.96,.89,.11,2.634,'#394e55');
    for(const side of [-1,1]) {
      const x=side*.476;
      panel(x,2.08,.896,.785,.085,2.641,'#639aa4');
      m.quad([x-.40,2.16,2.646],[x+.23,2.43,2.646],[x+.40,2.43,2.646],[x-.06,2.16,2.646],'#91bdbe');
      m.quad([x-.34,1.75,2.652],[x-.32,1.72,2.652],[x+.28,1.91,2.652],[x+.28,1.95,2.652],'#344e53');
      panel(side*.82,1.06,.38,.29,.135,2.622,'#9b5547');
      const lens=m.data.length;
      panel(side*.82,1.06,.31,.233,.11,2.633,'#efe6c5');
      panel(side*.82,1.07,.235,.16,.075,2.645,'#fff3b7');
      markLens(lens,2);
      panel(side*.9,1.30,.15,.09,.04,2.626,'#ffc169');
    }
    panel(0,2.694,.70,.245,.09,2.555,'#415451');
    lettering(m,'03',0,2.78,2.562,.036,'#ffdd83',-1);
    panel(0,1.15,.65,.20,.085,2.627,'#a04236');
    for(const y of [1.10,1.16,1.22]) panel(0,y,.53,.019,.008,2.634,'#ebbe96');
    m.box(0,.55,2.608,2.13,.15,.17,'#dddac3');
    panel(0,.815,.51,.15,.025,2.637,'#f2d490');
    lettering(m,'BS3',0,.865,2.641,.020,'#4c5755',-1);
    mark(2);
    for(const s of [-1,1]) {
      m.box(s*.77,2.94,.23,.055,.13,2.26,'#838f88');
      m.box(s*.77,3.08,.23,.059,.047,2.28,'#c7d0be');
    }
    for(let i=0;i<5;i++) m.box(0,2.982,-.85+i*.54,1.54,.05,.075,'#9aa8a0');
    mark(3);
    m.box(-.30,3.048,-.30,.66,.31,.89,'#d6ac68');
    for(const z of [-.61,.00]) m.box(-.30,3.047,z,.67,.318,.055,'#9b714b');
    m.box(.35,3.045,.42,.53,.23,.72,'#75a399');
    for(const z of [.17,.66]) m.box(.35,3.046,z,.545,.237,.044,'#4f7d76');
    return m;
  }

  // Dimensions describe the coachwork. Lamp centres are in the same frame as the wheels.
  const models = [
    {id:'alpin', name:'L’Alpin', width:2.37, length:5.23, height:3.37,
      headlamp:[.82,1.06,2.645], taillamp:[.93,.87,-2.665]},
    {id:'lagon', name:'Combi Lagon', width:2.16, length:3.92, height:2.78,
      headlamp:[.76,1.03,1.993], taillamp:[.86,.88,-1.993]},
    {id:'ecolier', name:'L’Écolier', width:2.30, length:6.08, height:3.05,
      headlamp:[.82,1.06,3.073], taillamp:[.93,.87,-3.073]},
    {id:'nocturne', name:'Nuit Express', width:2.40, length:6.96, height:2.98,
      headlamp:[.87,.93,3.513], taillamp:[.97,.97,-3.513]},
    {id:'imperiale', name:'L’Impériale', width:2.34, length:5.68, height:3.99,
      headlamp:[.82,1.06,2.873], taillamp:[.93,.87,-2.873]}
  ];

  function buildCoach(model,lowDetail,wheelParts) {
    const m=new Mesh();
    m.layers=[];
    const halfWidth=model.width/2, end=model.length/2;
    function mark(layer, side=0, face=0) {
      if (lowDetail) m.layers.push({offset:m.data.length,layer,side,end:face});
    }
    // Draw a coloured polygon on one end or side. A signed offset orders coplanar trim.
    function panel(side, plane, points, color) {
      const vertices=points.map(([u,y])=>side ? [plane,y,u] : [u,y,plane]);
      for(let i=1;i<vertices.length-1;i++) m.tri(vertices[0],vertices[i],vertices[i+1],color);
    }
    function rect(side,plane,u,y,w,h,color) {
      panel(side,plane,[[u-w/2,y],[u+w/2,y],[u+w/2,y+h],[u-w/2,y+h]],color);
    }
    function disc(side,plane,u,y,ru,ry,color,segments=10) {
      const points=Array.from({length:segments},(_,i)=>{
        const a=TAU*(i+.5)/segments;
        return [u+ru*Math.cos(a),y+ry*Math.sin(a)];
      });
      panel(side,plane,points,color);
    }
    function pane(side,plane,u,bottom,width,height,glass='#42697d') {
      const sign=Math.sign(plane), w=width/2, top=bottom+height;
      const cut=Math.min(.1,height/6,width/8), bevel=(x,b,t)=>[
        [u-x+cut,b],[u+x-cut,b],[u+x,b+cut],[u+x,t-cut],
        [u+x-cut,t],[u-x+cut,t],[u-x,t-cut],[u-x,b+cut]];
      panel(side,plane,bevel(w,bottom,top),'#273e50');
      panel(side,plane+.009*sign,bevel(w-.045,bottom+.05,top-.05),glass);
      panel(side,plane+.016*sign,[[u-w+.09,top-.12],[u+w-.09,top-.12],
        [u+w-.15,top-.24],[u-w+.20,top-.24]],'#8dbcc4');
    }
    function sideWindows(s,start,stop,count,bottom,height,glass) {
      const step=(stop-start)/count;
      for(let i=0;i<count;i++) pane(true,s*(halfWidth+.009),start+(i+.5)*step,bottom,step-.07,height,glass);
    }
    function wheels(s,axles,hub) {
      addWheels(m,wheelParts,s,axles,lowDetail,halfWidth-.016,hub);
    }
    function bumper(sign,color) {
      m.box(0,.49,sign*(end-.004),model.width-.20,.13,.12,color);
    }
    function lamps(sign,round=false) {
      const [x,y,z]=sign===1?model.headlamp:model.taillamp;
      const front=sign===1, w=front?.29:.20, h=front?.16:.14;
      for(const s of [-1,1]) {
        const lens=(plane,width,height,col)=>round ? disc(false,plane,s*x,y,width/2,height/2,col)
          : rect(false,plane,s*x,y-height/2,width,height,col);
        lens(z-sign*.009,w+.065,h+.06,'#484c53');
        const start=m.data.length;
        lens(z,w,h,front?'#fff2be':'#fb7055');
        for(let i=start+3;i<m.data.length;i+=6) m.data[i]+=front?2:4;
      }
    }
    function endPlate(sign,word,bottom,px,color='#ffdb80') {
      const z=sign*(end+.02);
      rect(false,z,0,bottom,(word.length*4-1)*px+.16,5*px+.07,'#263b46');
      lettering(m,word,0,bottom+.035+5*px,z+sign*.007,px,color,-sign);
    }
    function mirrors(s,z,y) {
      m.box(s*(halfWidth+.085),y+.08,z,.22,.045,.07,'#5b696a');
      m.box(s*(halfWidth+.17),y,z,.085,.19,.12,'#354954');
    }
    // School-bus hood and cabin share a chassis but have different centre points.
    function offsetShell(offset,levels,color) {
      const start=m.data.length;
      m.shell(levels,color);
      for(let i=start+2;i<m.data.length;i+=6) m.data[i]+=offset;
    }

    if (model.id==='lagon') {
      m.shell([[.90,.34,1.72,.26],[1.06,.54,1.94,.32],[1.08,1.39,end,.38]],'#39bcae');
      m.shell([[1.08,1.38,end,.38],[1.08,1.59,end,.38],[1.03,2.14,1.88,.34]],'#fff1c9');
      m.shell([[1.06,2.14,1.89,.35],[1.03,2.31,1.85,.39],[.85,2.43,1.62,.45]],'#f8e4b4');
      for(const s of [-1,1]) {
        mark(1,s);
        sideWindows(s,-1.52,1.51,3,1.53,.59,'#5b90a2');
        const x=s*(halfWidth+.016);
        // Foam curls along the bodywork like a breaking wave.
        panel(true,x,[[-1.52,1.22],[-.70,1.19],[-.20,1.05],[.28,1.08],[.61,1.24],
          [.84,1.20],[.57,.99],[.19,.91],[-.35,.94],[-.82,1.11]],'#fff3ce');
        disc(true,x+s*.009,1.10,1.14,.14,.14,'#ffbe5e');
        wheels(s,[-1.13,1.12],'#f9dfaf');
        mirrors(s,1.35,1.69);
      }
      for(const sign of [-1,1]) {
        mark(1,0,sign);
        pane(false,sign*(end+.005),0,1.52,1.55,.59,'#548c9d');
        rect(false,sign*(end+.024),0,1.54,.047,.54,'#ead8b6');
        panel(false,sign*(end+.011),[[-.76,1.39],[.76,1.39],[0,.90]],'#fff0cb');
        disc(false,sign*(end+.026),0,1.18,.10,.10,'#eab264');
        lamps(sign,true); bumper(sign,'#eadbb9');
      }
      mark(2);
      for(const z of [-.64,.64]) m.box(0,2.43,z,1.40,.10,.08,'#947757');
      mark(3);
      // A pointed surfboard with a painted stringer, deck stripes and a tail fin.
      m.rings(0,2.52,0,[[.34,0,1.60],[.37,.065,1.65],[.31,.11,1.55]],12,'#fb9262');
      m.box(0,2.631,0,.045,.01,2.95,'#fff1be');
      for(const z of [-.60,.65]) m.box(0,2.635,z,.65,.012,.07,'#236e76');
      m.tri([0,2.64,-1.26],[0,2.78,-1.04],[0,2.64,-.93],'#f9ddb0');
    } else if (model.id==='ecolier') {
      const cabinEnd=1.96, middle=(-end+cabinEnd)/2, cabinHalf=(end+cabinEnd)/2;
      m.shell([[1.06,.36,end-.09,.13],[halfWidth,.52,end,.17],[halfWidth,1.22,end,.18]],'#efac31');
      offsetShell(middle,[[halfWidth,1.20,cabinHalf,.18],[halfWidth,2.62,cabinHalf,.18],
        [1.08,2.84,cabinHalf-.06,.22],[.85,2.98,cabinHalf-.17,.27]],'#ffd056');
      offsetShell((end+cabinEnd)/2,[[.91,1.21,.54,.16],[.74,1.50,.50,.19]],'#ffc64b');
      for(const s of [-1,1]) {
        mark(1,s);
        sideWindows(s,-end+.22,cabinEnd-.15,6,1.72,.77,'#618998');
        for(const y of [1.03,1.21,1.45]) rect(true,s*(halfWidth+.012),middle,y,2*cabinHalf-.34,.058,'#343e45');
        const x=s*(halfWidth+.028);
        disc(true,x,cabinEnd-.93,1.37,.255,.255,'#f8edde',8);
        disc(true,x+s*.007,cabinEnd-.93,1.37,.214,.214,'#df5948',8);
        rect(true,x+s*.014,cabinEnd-.93,1.34,.29,.055,'#fff2dd');
        wheels(s,[-1.82,2.15],'#e9af44');
        mirrors(s,cabinEnd-.20,1.91);
      }
      mark(1,0,-1);
      rect(false,-end-.004,0,.62,1.11,1.68,'#38424a');
      rect(false,-end-.010,0,.66,1.00,1.58,'#eeb342');
      for(const s of [-1,1]) pane(false,-end-.017,s*.52,1.75,.84,.65,'#587e8d');
      endPlate(-1,'ECOLE',2.46,.061);
      for(const s of [-1,1]) for(const [x,col] of [[.79,'#ca4c3e'],[.57,'#f99239']]) {
        disc(false,-end-.015,s*x,2.66,.080,.080,col);
      }
      lamps(-1); bumper(-1,'#353f48');
      mark(1,0,1);
      pane(false,cabinEnd+.008,0,1.72,1.96,.79,'#668f9a');
      rect(false,cabinEnd+.027,0,1.74,.055,.73,'#383e42');
      rect(false,cabinEnd+.012,0,2.55,1.31,.25,'#303a42');
      lettering(m,'ECOLE',0,2.755,cabinEnd+.023,.036,'#ffd873',-1);
      rect(false,end+.014,0,.75,.84,.44,'#343e46');
      for(const x of [-.32,-.16,0,.16,.32]) rect(false,end+.020,x,.77,.037,.39,'#c8bba4');
      lamps(1,true); bumper(1,'#353f48');
      mark(2);
      for(const z of [-1.97,-1.12,-.27,.58,1.40]) m.box(0,2.972,z,1.58,.033,.065,'#e9ac3c');
      m.box(0,2.99,-.72,.7,.06,.61,'#f4c568');
    } else if (model.id==='nocturne') {
      m.shell([[1.02,.35,end-.24,.29],[1.17,.53,end-.04,.20],[halfWidth,1.28,end,.22]],'#693e79');
      m.shell([[halfWidth,1.28,end,.22],[halfWidth,1.55,end,.22],
        [1.14,2.39,end-.22,.30],[1.02,2.64,end-.43,.37]],'#343752');
      m.shell([[1.04,2.61,end-.40,.34],[1.02,2.72,end-.45,.38],[.87,2.76,end-.60,.35]],'#a47dba');
      for(const s of [-1,1]) {
        mark(1,s);
        // Swept panorama windows follow the taper at both ends of the coach.
        const x=s*(halfWidth+.01);
        for(let i=0;i<6;i++) {
          const start=-end+.33+i*.99;
          panel(true,x,[[start,1.57],[start+.92,1.57],[start+1.01,2.33],[start+.12,2.33]],'#507a91');
          panel(true,x+s*.007,[[start+.10,2.18],[start+.98,2.18],
            [start+1.00,2.29],[start+.12,2.29]],'#80adbb');
        }
        panel(true,x,[[-3.12,.91],[-1.80,.91],[-.25,1.24],[2.99,1.36],
          [1.12,1.17],[-.34,1.10],[-1.71,.77],[-3.12,.77]],'#ffc487');
        for(const [z,y,r] of [[-2.29,1.26,.14],[-1.80,1.36,.075],[-1.48,1.29,.06]]) {
          panel(true,x+s*.014,[[z,y+r],[z+r*.36,y+.03],[z+r,y],[z+.03,y-.04],[z,y-r],
            [z-.03,y-.04],[z-r,y],[z-.03,y+.04]],'#ffe0a6');
        }
        wheels(s,[-2.20,-1.22,2.34],'#c6afc9');
        mirrors(s,2.79,1.90);
      }
      for(const sign of [-1,1]) {
        mark(1,0,sign);
        // The glass slopes into the roof. Each stripe sits on the same raked plane.
        const rake=(x,y,out=0)=>[x,y,sign*(end+.015-(y-1.55)*.265+out)];
        m.quad(rake(-1,1.56),rake(1,1.56),rake(.85,2.40),rake(-.85,2.40),'#568495');
        m.quad(rake(-.89,2.19,.008),rake(.57,2.19,.008),rake(.76,2.30,.008),rake(-.80,2.30,.008),'#93bbc2');
        rect(false,sign*(end+.013),0,1.20,1.90,.064,'#f6bc82');
        if(sign<0) endPlate(sign,'NUIT',.75,.054);
        lamps(sign); bumper(sign,'#514a62');
      }
      mark(2);
      for(const z of [-1.98,-.69,.60]) {
        m.box(0,2.755,z,1.25,.028,1.12,'#423e59');
        m.box(0,2.783,z,1.12,.015,.98,'#6498a3');
      }
      m.box(0,2.76,1.93,1.27,.22,.93,'#c3aec7');
      for(const z of [1.62,1.79,1.96,2.13]) m.box(0,2.973,z,1.03,.009,.045,'#76617c');
    } else {
      // Two enclosed passenger decks and a rounded crown over the upper saloon.
      m.shell([[1.02,.32,end-.12,.19],[halfWidth,.51,end,.17],[halfWidth,2.15,end,.17]],'#315e9c');
      m.shell([[halfWidth,2.15,end,.17],[halfWidth,2.33,end,.17]],'#f6bb5e');
      m.shell([[halfWidth,2.33,end,.17],[halfWidth,3.59,end-.02,.18]],'#4087b5');
      m.shell([[halfWidth,3.59,end-.02,.18],[1.13,3.76,end-.05,.22],
        [.95,3.94,end-.20,.27],[.80,3.99,end-.33,.30]],'#f6dab0');
      for(const s of [-1,1]) {
        mark(1,s);
        sideWindows(s,-end+.24,end-.23,5,1.35,.70,'#507d95');
        sideWindows(s,-end+.23,end-.22,5,2.56,.85,'#6e9ba9');
        const x=s*(halfWidth+.018);
        rect(true,x,0,.95,model.length-.44,.058,'#ecc687');
        disc(true,x+s*.005,-.27,1.04,.30,.30,'#fbe5b7');
        disc(true,x+s*.010,-.27,1.04,.21,.21,'#d7604e');
        rect(true,x+s*.016,-.27,1.00,.69,.085,'#293d66');
        wheels(s,[-1.74,1.87],'#d9b77e');
        mirrors(s,2.17,1.70);
      }
      for(const sign of [-1,1]) {
        mark(1,0,sign);
        pane(false,sign*(end+.008),0,1.37,1.98,.70,'#5b8b9b');
        pane(false,sign*(end+.008),0,2.54,1.99,.84,'#648d9e');
        for(const y of [1.40,2.57]) rect(false,sign*(end+.030),0,y,.06,y>2?.76:.61,'#e7c991');
        rect(false,sign*(end+.015),0,3.41,1.04,.20,'#263c51');
        lettering(m,'03',0,3.581,sign*(end+.024),.029,'#ffdc91',-sign);
        rect(false,sign*(end+.016),0,1.18,1.71,.055,'#e2bf83');
        endPlate(sign,'BS3',.76,.042);
        lamps(sign); bumper(sign,'#e8c7a1');
      }
    }
    return m;
  }

  function mesh(id,lowDetail=false,wheelParts) {
    const model=models.find(item=>item.id===id)||models[0];
    return model===models[0] ? alpineCoach(lowDetail,wheelParts) : buildCoach(model,lowDetail,wheelParts);
  }

  function parts(id,lowDetail=false) {
    const wheels=[];
    return {body:mesh(id,lowDetail,wheels),wheels};
  }
  window.BusModels={models,mesh,parts};
})();
