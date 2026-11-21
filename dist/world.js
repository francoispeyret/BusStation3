/* Bus Station 3. A small, batched WebGL renderer with streamed track sections. */
(() => {
  'use strict';

  const CHUNK = 72;
  const FAR = 288;
  const LANE = 3.65;
  const ROAD = LANE * 1.5;
  const TAU = Math.PI * 2;
  const {roadX, roadSlope} = window.BusDrive;
  const colorCache = new Map();

  function rgb(hex) {
    if (!colorCache.has(hex)) {
      const n = parseInt(hex.slice(1), 16);
      colorCache.set(hex, [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
    }
    return colorCache.get(hex);
  }

  function random(seed) {
    let x = (seed * 2654435761 + 12345) | 0;
    return () => {
      x = Math.imul(1664525, x) + 1013904223 | 0;
      return (x >>> 0) / 4294967296;
    };
  }

  class Mesh {
    constructor() { this.data = []; }
    tri(a, b, c, color, light = 1) {
      const v = rgb(color);
      const r = v[0] * light, g = v[1] * light, blue = v[2] * light;
      this.data.push(...a,r,g,blue,...b,r,g,blue,...c,r,g,blue);
    }
    quad(a,b,c,d,color,light=1) {
      this.tri(a,b,c,color,light);
      this.tri(a,c,d,color,light);
    }
    box(x,y,z,w,h,l,col) {
      const x0=x-w/2, x1=x+w/2, z0=z-l/2, z1=z+l/2, t=y+h;
      this.quad([x0,y,z0],[x1,y,z0],[x1,t,z0],[x0,t,z0],col,.94);
      this.quad([x0,y,z0],[x0,t,z0],[x0,t,z1],[x0,y,z1],col,.86);
      this.quad([x1,y,z0],[x1,t,z0],[x1,t,z1],[x1,y,z1],col,.73);
      this.quad([x0,y,z1],[x1,y,z1],[x1,t,z1],[x0,t,z1],col,.82);
      this.quad([x0,t,z0],[x1,t,z0],[x1,t,z1],[x0,t,z1],col,1);
    }
    /* Horizontal rings with explicit per-face lighting keep distant meshes stable. */
    rings(x,y,z,levels,n,col,angle=0) {
      const rings = levels.map(([rx,ry,rz,dx=0,dz=0]) =>
        Array.from({length:n},(_,i) => {
          const a=i*TAU/n + angle;
          return [x+dx+rx*Math.cos(a),y+ry,z+dz+rz*Math.sin(a)];
        }));
      for (let j=1;j<rings.length;j++) {
        for (let i=0;i<n;i++) {
          const k=(i+1)%n, a=(i+.5)*TAU/n+angle;
          const tone=.89 - .085*Math.cos(a) - .045*Math.sin(a) + .06*j/(rings.length-1);
          this.quad(rings[j-1][i],rings[j-1][k],rings[j][k],rings[j][i],col,tone);
        }
      }
      const top = rings[rings.length-1];
      for(let i=1;i<n-1;i++) this.tri(top[0],top[i],top[i+1],col);
    }
    ellipse(x,y,z,rx,rz,col,n=14) {
      const c=[x,y,z];
      for(let i=0;i<n;i++) {
        const a=TAU*i/n,b=TAU*(i+1)/n;
        this.tri(c,[x+rx*Math.cos(a),y,z+rz*Math.sin(a)],[x+rx*Math.cos(b),y,z+rz*Math.sin(b)],col);
      }
    }
    /* A vertically stacked, clipped-corner rectangle for coachwork and trim. */
    shell(levels,color) {
      const contour=([w,y,l,r]) => [[-w+r,y,-l],[w-r,y,-l],[w,y,-l+r],[w,y,l-r],[w-r,y,l],[-w+r,y,l],[-w,y,l-r],[-w,y,-l+r]];
      const shades=[.97,.88,.81,.79,.84,.89,.92,.98];
      const rs=levels.map(contour);
      for (let j=1;j<rs.length;j++) for(let i=0;i<8;i++) {
        const k=(i+1)%8;
        this.quad(rs[j-1][i],rs[j-1][k],rs[j][k],rs[j][i],color,shades[i]);
      }
      const t=rs[rs.length-1];
      for (let i=1;i<7;i++) this.tri(t[0],t[i],t[i+1],color);
    }
  }

  function tree(m,x,z,size,kind,r) {
    const s=size;
    m.ellipse(x-s*.30,.012,z-s*.15,s*.60,s*.29,'#8e9d58',9);
    m.box(x,0,z,s*.09,s*.55,s*.11,'#866b49');
    if(kind===0) {
      const col = r()<.5 ? '#48765a' : '#53795c';
      m.rings(x,s*.19,z,[[s*.20,0,s*.20],[s*.30,s*.08,s*.29],[s*.05,s*.43,s*.05]],8,col,.28);
      m.rings(x,s*.37,z,[[s*.21,0,s*.21],[s*.245,s*.035,s*.23],[s*.028,s*.40,s*.028]],7,col);
      m.rings(x,s*.55,z,[[s*.19,0,s*.18],[0,s*.45,0]],7,col,.28);
    } else {
      const col = kind===1 ? '#92aa54' : '#71904c';
      m.rings(x,s*.34,z,[[s*.12,0,s*.11],[s*.33,s*.12,s*.31],[s*.35,s*.32,s*.32,.02*s],[s*.20,s*.52,s*.21,.04*s],[s*.03,s*.62,s*.04]],8,col,.23);
    }
  }

  function house(m,x,z,col) {
    m.box(x,0,z,5.4,3.3,4.3,'#ffe6af');
    m.tri([x-3.05,3.27,z-2.4],[x+3.05,3.27,z-2.4],[x,5.4,z-2.4],'#fff1cb',.97);
    m.quad([x-3.05,3.27,z-2.45],[x,5.48,z-2.45],[x,5.48,z+2.45],[x-3.05,3.27,z+2.45],col);
    m.quad([x,5.48,z-2.45],[x+3.05,3.27,z-2.45],[x+3.05,3.27,z+2.45],[x,5.48,z+2.45],col,.8);
    m.box(x+.95,3.75,z+1,.55,1.5,.58,'#c08160');
    m.box(x-.3,0,z-2.18,.83,2.12,.09,'#5a8a80');
    for (const k of [-1.65,1.5]) {
      m.box(x+k,.97,z-2.18,.94,1.13,.1,'#fdf2d0');
      m.box(x+k,1.09,z-2.25,.72,.89,.08,'#47787e');
    }
  }

  function section(index) {
    const m=new Mesh(), start=index*CHUNK, r=random(index+843);
    function strip(z0,z1,l,r,y,col) {
      const a=roadX(start+z0),b=roadX(start+z1);
      m.quad([a+l,y,z0],[a+r,y,z0],[b+r,y,z1],[b+l,y,z1],col);
    }
    for(let z=0;z<CHUNK;z+=4) {
      strip(z,z+4,-190,190,-.06,'#afba6d');
      strip(z,z+4,-ROAD-.68,ROAD+.68,-.015,'#d6bf86');
      strip(z,z+4,-ROAD,ROAD,0,'#595564');
      for(const side of [-1,1]) {
        const x=side*(ROAD-.18);
        strip(z,z+4,x-.055,x+.055,.013,'#f7db8c');
      }
      if(z%12===0) for(const x of [-LANE/2,LANE/2]) strip(z,z+3.7,x-.08,x+.08,.015,'#ffe7b8');
    }
    for (let i=0;i<32;i++) {
      const side=i%2 ? 1 : -1;
      const z=r()*CHUNK, gap=i<10 ? 4.8+r()*5 : 11+r()*38;
      const x=roadX(start+z)+side*(ROAD+gap);
      tree(m,x,z,3+r()*6,(r()<.62?0:1+Math.floor(r()*2)),r);
    }
    for(let i=0;i<36;i++) {
      const z=r()*CHUNK, side=r()<.5?1:-1, x=roadX(start+z)+side*(ROAD+.96+r()*27);
      const size=.3+r()*1.6;
      m.ellipse(x,-.026,z,size*1.5,size*.8,i%3===0?'#bdbe76':'#a5b466',6);
    }
    for (let i=0;i<31;i++) {
      const z=r()*CHUNK, side=r()<.5?1:-1, x=roadX(start+z)+side*(ROAD+1.2+r()*4);
      if(i%4===0) {
        m.rings(x,0,z,[[.49,0,.4],[.51,.28,.38],[.23,.48,.24]],6,'#a1afa0',i);
      } else {
        const col=i%5===0?'#ffe5a0':'#8b9e53';
        for(let j=0;j<3;j++) m.tri([x-.12+j*.12,0,z],[x+j*.12,0,z+.06],[x-.08+j*.16,.16+r()*.18,z+.04],col);
      }
    }
    const fenceSide=index%4<2 ? -1:1;
    for(let i=0;i<6;i++) {
      const z=6+i*4, x=roadX(start+z)+fenceSide*(ROAD+2.2);
      const nextX=roadX(start+z+4)+fenceSide*(ROAD+2.2);
      m.box(x,0,z,.19,1.12,.2,'#b88c61');
      if(i<5) for(const y of [.43,.84]) m.quad([x,y,z],[x,y+.14,z],[nextX,y+.14,z+4],[nextX,y,z+4],'#cfab77');
    }
    for (const z of [4,28,52]) for(const side of [-1,1]) {
      const x=roadX(start+z)+side*(ROAD+.99);
      m.box(x,0,z,.14,.84,.14,'#fff2d7');
      m.box(x,.56,z-.08,.13,.17,.035,'#da7352');
    }
    if((index%3+3)%3===1) {
      house(m,roadX(start+40)-22,40,'#d4825f');
    } else if ((index%3+3)%3===0) {
      const z=42, x=roadX(start+z)+8.5;
      m.box(x,0,z,.18,2.75,.16,'#799090');
      m.box(x,1.86,z,.92,1,.15,'#305e7a');
      m.box(x,2.08,z-.084,.53,.53,.025,'#fff3ce');
      m.box(x,2.27,z-.103,.4,.17,.02,'#4a8d9c');
      m.box(x+.1,0,z+2.6,1.9,.16,.51,'#b77e53');
      m.box(x+.1,.17,z+2.82,1.9,.43,.11,'#cb9770');
    }
    return m;
  }

  function backdrop() {
    const m=new Mesh(),r=random(83);
    // Broken snow lines and broad shaded ridges give the road an alpine skyline.
    for(let i=-9;i<=9;i++) {
      const x=i*44+r()*16, z=247+r()*12, h=31+r()*39;
      const n=8, base=[], ridge=[], snow=[], peak=[x+6*r()-3,h,z+3];
      for(let j=0;j<n;j++) {
        const u=TAU*j/n, rx=38+r()*13, rz=17+r()*9;
        base.push([x+rx*Math.cos(u),-4,z+rz*Math.sin(u)]);
        ridge.push([x+rx*.54*Math.cos(u),h*(.37+r()*.08),z+rz*.52*Math.sin(u)]);
        snow.push([x+rx*.24*Math.cos(u),h*(.65+r()*.15),z+rz*.25*Math.sin(u)]);
      }
      for(let j=0;j<n;j++) {
        const k=(j+1)%n,shade=.80+.20*Math.max(0,Math.cos(TAU*(j+.5)/n));
        m.quad(base[j],base[k],ridge[k],ridge[j],'#95869d',shade);
        m.tri(ridge[j],ridge[k],snow[j],'#b39ba6',shade);
        m.tri(ridge[k],snow[k],snow[j],'#a493a2',shade);
        m.tri(snow[j],snow[k],peak,'#ffe3cc',shade);
      }
    }
    for(let i=-12;i<=12;i++) {
      const x=i*25+r()*15, h=9+r()*17;
      m.rings(x,-4,188+r()*17,[[34,0,19],[27,h*.41,14],[17,h*.74,7],[4,h,3]],8,'#8e977a',r());
    }
    for(const [x,y,z,s,k] of [[-68,35,148,1.30,.9],[44,37,151,1.02,.59],[105,44,164,1.36,.8],[-139,55,168,1.55,.72],[3,51,176,.77,.7]]) {
      for(const [dx,dy,w,h] of [[-10,0,8,2.6],[-3,1,9,4.6],[4,2.5,8,6],[11,0,8,3]]) {
        m.rings(x+dx*s,y+dy*s*k,z,[[w*s*.8,0,3*s],[w*s,h*s*.45*k,3.6*s],[.6*w*s,h*s*k,2*s]],9,'#ffdfb3');
      }
    }
    return m;
  }

  const glyphs = {
    B:['110','101','110','101','110'], S:['111','100','111','001','111'],
    '0':['111','101','101','101','111'], '3':['111','001','111','001','111']
  };
  function lettering(m,str,cx,cy,z,pixel,col) {
    const start=cx-(str.length*4-1)*pixel/2;
    Array.from(str).forEach((ch,c) => glyphs[ch].forEach((row,y) => Array.from(row).forEach((v,x) => {
      if(v==='1') m.quad([start+(c*4+x)*pixel,cy-y*pixel,z],[start+(c*4+x+1)*pixel,cy-y*pixel,z],
        [start+(c*4+x+1)*pixel,cy-(y+1)*pixel,z],[start+(c*4+x)*pixel,cy-(y+1)*pixel,z],col);
    })));
  }

  function wheel(m,side,z) {
    const x=side*1.16, y=.52;
    const loop=(offset,rad,col) => {
      const a=x+side*offset;
      for(let i=0;i<14;i++) {
        const u=i*TAU/14, v=(i+1)*TAU/14;
        m.tri([a,y,z],[a,y+rad*Math.cos(u),z+rad*Math.sin(u)],[a,y+rad*Math.cos(v),z+rad*Math.sin(v)],col);
      }
    };
    for(let i=0;i<14;i++) {
      const u=i*TAU/14,v=(i+1)*TAU/14, ax=x+side*.12, bx=x-side*.17;
      m.quad([ax,y+.46*Math.cos(u),z+.46*Math.sin(u)],[bx,y+.46*Math.cos(u),z+.46*Math.sin(u)],[bx,y+.46*Math.cos(v),z+.46*Math.sin(v)],[ax,y+.46*Math.cos(v),z+.46*Math.sin(v)],'#35444b');
    }
    loop(.12,.46,'#313d44'); loop(.125,.28,'#dfd8bb'); loop(.13,.18,'#75888a'); loop(.135,.095,'#cfd8ce');
  }

  function bus(lowDetail = false) {
    const m=new Mesh();
    // Canvas draws exterior trim after the body and luggage after the rack.
    // A triangle's centre depth alone cannot order small decals on a long face.
    const layers = [];
    const mark = (layer, side=0) => {
      if (lowDetail) layers.push({offset:m.data.length, layer, side});
    };
    m.layers = layers;
    m.shell([[1.02,.34,2.40,.16],[1.16,.52,2.57,.22],[1.18,1.35,2.61,.25]],'#d84b3a');
    m.shell([[1.181,1.32,2.611,.25],[1.185,1.54,2.614,.25]],'#fff0ce');
    m.shell([[1.181,1.53,2.611,.25],[1.17,1.65,2.59,.25],[1.13,2.66,2.49,.25]],'#fff8df');
    m.shell([[1.14,2.61,2.51,.25],[1.16,2.73,2.53,.28],[1.04,2.9,2.37,.34],[.9,2.94,2.25,.32]],'#f7edd1');
    mark(1);
    m.box(0,.54,-2.609,2.14,.135,.16,'#d3d5bf');
    m.box(0,.51,-2.68,1.4,.047,.04,'#82918d');
    function rearPanel(x,y,w,h,r,z,col) {
      if (lowDetail) {
        m.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],col);
        return;
      }
      const ring=[];
      for(const [dx,dy,start] of [[1,1,0],[-1,1,.25],[-1,-1,.5],[1,-1,.75]]) {
        for(let j=0;j<=3;j++) {
          const a=(start+j/12)*TAU;
          ring.push([x+dx*(w/2-r)+r*Math.cos(a),y+dy*(h/2-r)+r*Math.sin(a),z]);
        }
      }
      for(let j=0;j<ring.length;j++) m.tri([x,y,z],ring[j],ring[(j+1)%ring.length],col);
    }
    rearPanel(0,2.073,2.03,.83,.13,-2.621,'#d0c6aa');
    rearPanel(0,2.073,1.96,.77,.105,-2.638,'#3b4f59');
    for(const dir of [-1,1]) rearPanel(dir*.47,2.075,.85,.651,.07,-2.648,'#538294');
    for(const k of [-.865,.075]) {
      m.quad([k,2.29,-2.651],[k+.57,2.29,-2.651],[k+.70,2.36,-2.651],[k+.11,2.36,-2.651],'#83a8b0');
    }
    rearPanel(0,2.604,.63,.232,.07,-2.64,'#decbad');
    rearPanel(0,2.604,.58,.197,.055,-2.652,'#374b50');
    lettering(m,'03',0,2.67,-2.658,.029,'#ffdf89');
    m.box(0,.76,-2.622,.58,.2,.045,'#ffdb89');
    if (!lowDetail) lettering(m,'BS3',0,.917,-2.648,.0205,'#455257');
    for(const s of [-1,1]) {
      mark(1);
      m.box(s*.93,.78,-2.61,.215,.34,.08,'#703d38');
      m.box(s*.93,.94,-2.658,.16,.106,.021,'#ffc66a');
      m.box(s*.93,.82,-2.658,.16,.10,.021,'#fb7760');
      mark(1,s);
      for(let j=0;j<4;j++) {
        const z=-1.67+j*1.03;
        m.box(s*1.129,1.68,z,.115,.85,.88,'#405962');
        m.box(s*1.19,1.77,z,.02,.66,.73,'#5d98a4');
        m.box(s*1.203,2.19,z,.014,.19,.72,'#77aeb7');
      }
      for(const z of [-1.55,1.54]) {
        if (lowDetail) m.box(s*1.14,.08,z,.24,.77,.79,'#35444b');
        else wheel(m,s,z);
      }
      m.box(s*1.25,2.1,1.77,.27,.055,.09,'#586a68');
      m.box(s*1.39,2.01,1.77,.11,.25,.15,'#52666a');
    }
    mark(1);
    for(let i=0;i<4;i++) m.box(.56,1.00+i*.077,-2.622,.52,.024,.018,'#b34b3d');
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

  const IMPACT_MESHES = ['waterRipple','waterDrop','repairHalo','repairSpark','boostHalo'];

  function prop(type) {
    const m=new Mesh();
    if(type==='cone') {
      m.box(0,.01,0,.95,.12,.90,'#c25a3a');
      m.quad([-.475,.01,-.45],[-.475,.01,.45],[.475,.01,.45],[.475,.01,-.45],'#854632');
      for(const [y,top,r,r2,c] of [[.13,.50,.37,.26,'#fa793e'],[.50,.69,.26,.19,'#fff3d2'],[.69,1.15,.19,.056,'#fa793e']])
        m.rings(0,0,0,[[r,y,r],[r2,top,r2]],8,c);
    } else if(type==='barrier') {
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
    } else if(type==='waterRipple'||type==='repairHalo'||type==='boostHalo') {
      const col=type==='waterRipple'?'#c1ece9':type==='repairHalo'?'#8fffd0':'#ffd879';
      const inner=type==='waterRipple'?.95:.89;
      for(let i=0;i<32;i++) {
        const a=TAU*i/32, b=TAU*(i+1)/32;
        const x=Math.cos(a), z=Math.sin(a), u=Math.cos(b), v=Math.sin(b);
        m.quad([x*inner,0,z*inner],[x,0,z],[u,0,v],[u*inner,0,v*inner],col);
      }
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
    } else {
      const shape=[[-.10,1.73],[-.56,.91],[-.12,.91],[-.31,.38],[.58,1.28],[.13,1.28],[.38,1.73]];
      // Two convex parts share the lightning bolt's central diagonal.
      const polys=[[0,1,2,5,6],[2,3,4,5]];
      for(const poly of polys) for(let i=1;i<poly.length-1;i++) for(const z of [-.14,.14]) {
        const p=k=>[shape[k][0],shape[k][1],z];
        m.tri(p(poly[0]),p(poly[i]),p(poly[i+1]),'#ffdb50');
      }
      shape.forEach(([x,y],i)=>{const [u,v]=shape[(i+1)%shape.length];m.quad([x,y,-.14],[u,v,-.14],[u,v,.14],[x,y,.14],'#e99932');});
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
        const across=hit.side*toVerge*p*(1.5-.5*p);
        const forward=hit.speed*age*(1.04-.20*p);
        const lift=8*p-6.4*p*p;
        part('cone',across,lift,forward,hit.side*p*2.4,-hit.side*p*5.9,p*3.4,1,1,1,1-ease((p-.52)/.48));
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
        const repair=hit.type==='repair', spread=1-(1-p)*(1-p);
        const light=(1-ease((p-.24)/.76))*(.40+.60*ease(p/.12));
        const halo=repair?'repairHalo':'boostHalo';
        part(halo,0,.055,0,0,0,0,1.47+1.13*spread,1,2.88+1.23*spread,light*.92);
        if(repair) {
          part(halo,0,.050,0,0,0,0,1.48+1.60*spread,1,2.90+1.73*spread,light*.29);
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

  // Aim the vanishing point 2.5% above the image. Back the camera up on
  // narrow screens so both outer lanes remain readable without changing pitch.
  const FOCAL_LENGTH = 1.55;
  const CAMERA_PITCH = Math.atan(1.05 / FOCAL_LENGTH);
  function camera(state, aspect) {
    const distance = state.roadZ ?? state.distance ?? 0;
    const a = Math.atan(roadSlope(distance));
    const framing = Math.max(1, .70 / aspect);
    const back = 11.8 * framing;
    const follow = .22 * LANE * (state.laneX || 0);
    return {
      cx: roadX(distance) + follow - Math.sin(a) * back,
      cy: 14.2 * framing,
      cz: distance - Math.cos(a) * back,
      a, f: FOCAL_LENGTH, pitch: CAMERA_PITCH, aspect
    };
  }

  const vertexCode = `
    attribute vec3 aPos;
    attribute vec3 aColor;
    uniform vec3 offset;
    uniform mat3 model;
    uniform vec4 cameraAngles;
    uniform vec3 projection;
    uniform float lighting;
    varying lowp vec3 color;
    void main() {
      vec3 w = offset + model * aPos;
      float forward = w.x*cameraAngles.y + w.z*cameraAngles.x;
      float viewX = w.x*cameraAngles.x - w.z*cameraAngles.y;
      float viewY = w.y*cameraAngles.z + forward*cameraAngles.w;
      float depth = forward*cameraAngles.z - w.y*cameraAngles.w;
      gl_Position = vec4(viewX*projection.x,viewY*projection.y,depth*1.0018 - .56, depth);
      float fog = smoothstep(58.0,278.0,depth)*.44;
      color = mix(aColor*lighting,vec3(.91,.77,.67),fog);
    }`;
  const fragmentCode=`precision mediump float; varying lowp vec3 color; uniform lowp float opacity;
    void main(){gl_FragColor=vec4(color,opacity);}`;
  const skyVertex=`attribute vec2 aPos; varying lowp float altitude;
    varying mediump vec2 uv; void main(){altitude=aPos.y;uv=aPos;gl_Position=vec4(aPos,0.,1.);}`;
  const skyFragment=`precision mediump float; varying lowp float altitude;
    varying mediump vec2 uv; uniform vec2 sun; uniform float aspect;
    void main(){
      vec3 col=mix(vec3(1.,.80,.59),vec3(.66,.68,.81),smoothstep(.12,1.18,altitude));
      float r=length((uv-sun)*vec2(aspect,1.));
      col+=vec3(.15,.061,.004)*(1.-smoothstep(.05,.52,r));
      col=mix(vec3(1.,.91,.67),col,smoothstep(.051,.055,r));
      gl_FragColor=vec4(col,1.);
    }`;

  function program(gl,is2,vert,frag) {
    const compile=(type,src) => {
      if(is2) {
        src=src.replace(/\battribute\b/g,'in').replace(/\bvarying\b/g,type===gl.VERTEX_SHADER?'out':'in');
        if(type===gl.FRAGMENT_SHADER) src=src.replace('void main()', 'out lowp vec4 result; void main()').replace('gl_FragColor','result');
        src='#version 300 es\n'+src;
      }
      const sh=gl.createShader(type);
      gl.shaderSource(sh,src); gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const a=compile(gl.VERTEX_SHADER,vert),b=compile(gl.FRAGMENT_SHADER,frag),p=gl.createProgram();
    gl.attachShader(p,a); gl.attachShader(p,b);
    gl.bindAttribLocation(p,0,'aPos'); gl.bindAttribLocation(p,1,'aColor');
    gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    return p;
  }

  function gpuRenderer(canvas,gl,is2) {
    let scene,sky,uniform,skySun,skyAspect,skyBuffer,coach,shadow,trail,range,items, lost=false;
    const chunks=new Map();
    const modelMatrix=new Float32Array(9);
    function upload(model) {
      const b=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,b);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(model.data),gl.STATIC_DRAW);
      return {buf:b,n:model.data.length/6};
    }
    function prepare() {
      scene=program(gl,is2,vertexCode,fragmentCode);
      sky=program(gl,is2,skyVertex,skyFragment);
      skySun=gl.getUniformLocation(sky,'sun');skyAspect=gl.getUniformLocation(sky,'aspect');
      uniform=Object.fromEntries(['offset','model','cameraAngles','projection','lighting','opacity'].map(n=>[n,gl.getUniformLocation(scene,n)]));
      skyBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      coach=upload(bus());
      range=upload(backdrop());
      const shade=new Mesh(); shade.ellipse(0,0,0,1.43,2.91,'#414c55',18);
      shadow=upload(shade);
      const streak=new Mesh();
      for(const side of [-1,1]) for (const [x,l] of [[.94,1.5],[1.09,.88]]) {
        streak.tri([side*(x-.038),0,-2.30],[side*(x+.038),0,-2.30],[side*x,0,-2.30-l],'#ffcc66');
      }
      trail=upload(streak);
      items={};
      for(const type of ['cone','barrier','oil','pothole','repair','boost',...IMPACT_MESHES]) items[type]=upload(prop(type));
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      chunks.clear();
    }
    prepare();
    const lostHandler=e=>{e.preventDefault();lost=true;};
    const restoreHandler=()=>{prepare();lost=false;};
    canvas.addEventListener('webglcontextlost',lostHandler);
    canvas.addEventListener('webglcontextrestored',restoreHandler);
    let quality=1, lastClock=0, frameMs=16, count=0, cssW=0, cssH=0;
    const observe=typeof ResizeObserver==='function' ? new ResizeObserver(entries=>{
      const b=entries[0].contentRect;cssW=b.width;cssH=b.height;
    }) : null;
    if(observe) observe.observe(canvas);

    function render(s) {
      if(lost||gl.isContextLost()) return;
      const clock=performance.now(), delta=clock-lastClock;
      if(delta>1&&delta<1000) frameMs+=.06*(Math.min(delta,125)-frameMs);
      lastClock=clock;
      if(++count%100===0) {
        if(frameMs>21) quality=Math.max(.6,quality-.12);
        else if(frameMs<17) quality=Math.min(1,quality+.06);
      }
      const cw=cssW||canvas.clientWidth||canvas.width||640, ch=cssH||canvas.clientHeight||canvas.height||400;
      const scale=Math.min(1.65,window.devicePixelRatio||1,1900/cw,1900/ch)*quality;
      const w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
      if(canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(sky);
      const d=s.roadZ ?? s.distance ?? 0, t=s.time||0, lane=s.laneX||0, cam=camera(s,w/h);
      gl.uniform2f(skySun,(.86-roadSlope(d)*1.4)/(w/h),.99);gl.uniform1f(skyAspect,w/h);
      gl.disable(gl.DEPTH_TEST); gl.disableVertexAttribArray(1);
      gl.enableVertexAttribArray(0); gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
      gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.drawArrays(gl.TRIANGLES,0,3);
      gl.useProgram(scene); gl.enable(gl.DEPTH_TEST);gl.enableVertexAttribArray(1);
      gl.uniform4f(uniform.cameraAngles,Math.cos(cam.a),Math.sin(cam.a),Math.cos(cam.pitch),Math.sin(cam.pitch));
      gl.uniform3f(uniform.projection,cam.f/cam.aspect,cam.f,0);
      gl.uniform1f(uniform.lighting,1);
      gl.uniform1f(uniform.opacity,1);
      function draw(mesh,x,y,z,a=0,roll=0,pitch=0,sx=1,sy=1,sz=1,fadeSolid=false) {
        const cy=Math.cos(a), sn=Math.sin(a), cr=Math.cos(roll), sr=Math.sin(roll);
        const cp=Math.cos(pitch), sp=Math.sin(pitch);
        modelMatrix[0]=cy*cr*sx; modelMatrix[1]=sr*sx; modelMatrix[2]=-sn*cr*sx;
        modelMatrix[3]=(sn*sp-cy*sr*cp)*sy; modelMatrix[4]=cr*cp*sy; modelMatrix[5]=(sn*sr*cp+cy*sp)*sy;
        modelMatrix[6]=(sn*cp+cy*sr*sp)*sz; modelMatrix[7]=-cr*sp*sz; modelMatrix[8]=(cy*cp-sn*sr*sp)*sz;
        gl.uniformMatrix3fv(uniform.model,false,modelMatrix);
        gl.uniform3f(uniform.offset,x-cam.cx,y-cam.cy,z-cam.cz);
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buf);
        gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
        gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
        // Fade the exterior silhouette without accumulating alpha on hidden interior faces.
        if(fadeSolid) {
          gl.colorMask(false,false,false,false);
          gl.depthMask(true);
          gl.drawArrays(gl.TRIANGLES,0,mesh.n);
          gl.depthMask(false);
          gl.colorMask(true,true,true,true);
          gl.depthFunc(gl.LEQUAL);
        }
        gl.drawArrays(gl.TRIANGLES,0,mesh.n);
        if(fadeSolid) gl.depthFunc(gl.LESS);
      }
      draw(range,0,-15,d);
      const start=Math.floor((cam.cz-5)/CHUNK),end=Math.floor((d+FAR)/CHUNK);
      for(let idx=start;idx<=end;idx++) {
        if(!chunks.has(idx)) chunks.set(idx,upload(section(idx)));
        draw(chunks.get(idx),0,0,idx*CHUNK);
      }
      for(const [idx,mesh] of chunks) if(idx<start-1||idx>end+1) {
        gl.deleteBuffer(mesh.buf);chunks.delete(idx);
      }
      for(const o of s.objects||[]) {
        if(!items[o.type]||o.z < -8||o.z>FAR) continue;
        const z=d+o.z, x=roadX(z)+o.lane*LANE, a=Math.atan(roadSlope(z));
        const pickup=o.type==='boost'||o.type==='repair';
        draw(items[o.type],x,pickup?Math.sin(t*3+z*.06)*.12:0,z,a+(pickup?.29*Math.sin(t*2.5+z*.17):0));
      }
      const x=roadX(d)+lane*LANE;
      const a=cam.a+(s.heading||0);
      const speed=Math.min(1,(s.speed||0)/70);
      const roll=(s.steer||0)*.072+(s.flat?.044+Math.sin(d*1.6)*.013:0)+(s.hit ? Math.sin(t*26)*.035:0);
      draw(shadow,x+.13,.018,d+.12,a);
      if(s.boost) draw(trail,x,.12,d+.16*Math.sin(t*16),a);
      draw(coach,x,.035+Math.sin(d*1.05)*speed*.018+(s.flat?0:Math.cos(d*.73)*.008),d,a,roll);
      if(s.impacts?.length) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
          const solid=type==='cone'||type==='barrier';
          gl.uniform1f(uniform.opacity,alpha);
          if(solid && alpha===1) gl.depthMask(true);
          draw(items[type],x,y,z,yaw,roll,pitch,sx,sy,sz,solid && alpha<1);
          if(solid && alpha===1) gl.depthMask(false);
        });
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    function dispose(){
      observe?.disconnect();
      canvas.removeEventListener('webglcontextlost',lostHandler);
      canvas.removeEventListener('webglcontextrestored',restoreHandler);
      for(const model of [coach,range,shadow,trail,...Object.values(items),...chunks.values()]) gl.deleteBuffer(model.buf);
      gl.deleteBuffer(skyBuffer);gl.deleteProgram(sky);gl.deleteProgram(scene);
    }
    return {render,dispose,renderer:is2?'WebGL 2':'WebGL'};
  }

  // Software fallback projects the same bus and pickups. Simplified scenery keeps
  // the road playable on devices that cannot create a WebGL context.
  function canvasRenderer(canvas, ctx) {
    const cars = new Map();
    const fadeCanvas = canvas.ownerDocument.createElement('canvas');
    const fadeContext = fadeCanvas.getContext('2d');
    function faces(m) {
      const out=[];
      let group=0, layer=0, side=0;
      for(let i=0;i<m.data.length;i+=18) {
        const d=m.data;
        while (m.layers?.[group]?.offset===i) ({layer,side}=m.layers[group++]);
        out.push({layer,side,v:[[d[i],d[i+1],d[i+2]],[d[i+6],d[i+7],d[i+8]],[d[i+12],d[i+13],d[i+14]]],
          col:'rgb('+[d[i+3],d[i+4],d[i+5]].map(c=>Math.min(255,Math.round(c*255))).join(',')+')'});
      }
      return out;
    }
    for(const type of ['cone','barrier','oil','pothole','boost','repair',...IMPACT_MESHES]) cars.set(type,faces(prop(type)));
    cars.set('bus',faces(bus(true)));
    function render(s) {
      const w=canvas.clientWidth||640,h=canvas.clientHeight||400;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const c=camera(s,w/h), d=s.roadZ ?? s.distance ?? 0;
      const cs=Math.cos(c.a),sn=Math.sin(c.a),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
      function point(x,y,z) {
        const dx=x-c.cx,dy=y-c.cy,dz=z-c.cz,forward=dx*sn+dz*cs,depth=forward*cp-dy*sp;
        const scale=h*.5*c.f/Math.max(.2,depth);
        return [w*.5+(dx*cs-dz*sn)*scale,h*.5-(dy*cp+forward*sp)*scale,depth];
      }
      function polygon(points,col,target=ctx) {
        target.fillStyle=col;target.beginPath();target.moveTo(points[0][0],points[0][1]);
        for(let i=1;i<points.length;i++) target.lineTo(points[i][0],points[i][1]);
        target.closePath();target.fill();
      }
      const near=c.cz+1.7, far=d+FAR, zs=Math.floor(far/4)*4;
      const groundLine=point(roadX(zs+4),0,zs+4)[1];
      const sky=ctx.createLinearGradient(0,0,0,groundLine);
      sky.addColorStop(0,'#abaaca');sky.addColorStop(1,'#ffcb98');
      ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      for (let layer=0;layer<2;layer++) {
        const base=groundLine+layer*2;
        ctx.fillStyle=layer?'#929979':'#ae9aa9';ctx.beginPath();ctx.moveTo(0,base);
        for(let x=-6;x<=w+6;x+=6) {
          const k=x/h*4.8+c.a*.8+layer*4;
          const relief=.065+.032*Math.cos(k)+.027*Math.sin(k*2.9)+.019*Math.cos(k*4.2);
          ctx.lineTo(x,base-h*relief*(layer ? .45 : 1));
        }
        ctx.lineTo(w,base+5);ctx.lineTo(0,base+5);ctx.fill();
      }
      ctx.fillStyle='#afba6d';ctx.fillRect(0,groundLine,w,h-groundLine);
      for(let z=zs;z>=near-4;z-=4) {
        const a=Math.max(z,near), b=z+4;
        const strip=(l,r,y,col)=>polygon([point(roadX(a)+l,y,a),point(roadX(a)+r,y,a),point(roadX(b)+r,y,b),point(roadX(b)+l,y,b)],col);
        strip(-ROAD-.65,ROAD+.65,-.01,'#d6bf86');
        strip(-ROAD,ROAD,0,'#595564');
        for(const side of [-1,1]) {
          const x=side*(ROAD-.16);
          strip(x-.06,x+.06,.02,'#f7db8c');
          if(Math.abs(z/4%3)===0) strip(side*LANE*.5-.09,side*LANE*.5+.09,.02,'#fcf8de');
        }
      }
      function model(type,x,y,z,yaw,roll,pitch=0,sx=1,sy=1,sz=1,alpha=1) {
        const source=cars.get(type);
        if(!source || alpha<=0) return;
        const cy=Math.cos(yaw),snYaw=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),tris=[];
        const cpitch=Math.cos(pitch),spitch=Math.sin(pitch);
        const cameraSide=((c.cx-x)*cy-(c.cz-z)*snYaw)*cr+(c.cy-y)*sr;
        for(const f of source) {
          if (f.side && f.side*cameraSide<1.1) continue;
          const p=f.v.map(([vx,vy,vz])=>{
            const py=vy*sy*cpitch-vz*sz*spitch,pz=vy*sy*spitch+vz*sz*cpitch;
            const lx=vx*sx*cr-py*sr;
            return point(x+lx*cy+pz*snYaw,y+vx*sx*sr+py*cr,z-lx*snYaw+pz*cy);
          });
          if(p.every(v=>v[2]>.2)) tris.push({p,layer:f.layer,z:p[0][2]+p[1][2]+p[2][2],col:f.col});
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
      for(let n=Math.floor(near/8);n<=Math.ceil(far/8);n++) {
        const z=n*8, r=random(n+463);
        for(const side of [-1,1]) {
          const x=roadX(z)+side*(ROAD+3.8+r()*12), size=3.5+r()*4;
          actors.push({type:'tree',x,z,size,kind:r()<.53});
        }
      }
      for(const o of s.objects||[]) if(o.z>-7&&o.z<155) actors.push({type:o.type,x:roadX(d+o.z)+o.lane*LANE,z:d+o.z});
      actors.push({type:'bus',x:roadX(d)+(s.laneX||0)*LANE,z:d});
      impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
        const ground=type==='oil'||type==='waterRipple'||type==='repairHalo'||type==='boostHalo'||type==='barrier';
        actors.push({type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha,ground});
      });
      for (const a of actors) {
        const centerY=a.type==='bus' ? 1.4 : a.y||0;
        a.depth=((a.x-c.cx)*sn+(a.z-c.cz)*cs)*cp-centerY*sp;
      }
      actors.sort((a,b)=>Number(Boolean(b.ground))-Number(Boolean(a.ground))||b.depth-a.depth);
      for(const a of actors) {
        if(a.type==='tree') {
          const b=point(a.x,0,a.z),top=point(a.x,a.size,a.z),sh=b[1]-top[1];
          if(b[2]<1||sh<1||b[0]<-sh||b[0]>w+sh) continue;
          ctx.fillStyle='#856a48';ctx.fillRect(b[0]-sh*.045,b[1]-.53*sh,.09*sh,.55*sh);
          if(a.kind) {
            polygon([[b[0],top[1]],[b[0]-.3*sh,b[1]-.24*sh],[b[0]+.29*sh,b[1]-.24*sh]],'#608261');
            polygon([[b[0],top[1]],[b[0]+.29*sh,b[1]-.24*sh],[b[0]+.055*sh,b[1]-.24*sh]],'#486c54');
          } else {
            ctx.fillStyle='#89a153';ctx.beginPath();ctx.ellipse(b[0],top[1]+sh*.33,sh*.32,sh*.34,0,0,TAU);ctx.fill();
          }
        } else if (a.alpha!==undefined) {
          model(a.type,a.x,a.y,a.z,a.yaw,a.roll,a.pitch,a.sx,a.sy,a.sz,a.alpha);
        } else {
          const bus=a.type==='bus';
          const yaw=Math.atan(roadSlope(a.z))+(bus ? s.heading||0 : 0);
          const roll=bus ? (s.steer||0)*.072+(s.flat ? .045 : 0) : 0;
          if (bus) {
            const shadow=[];
            for (let i=0;i<12;i++) {
              const theta=i*TAU/12, x=1.43*Math.cos(theta), z=2.91*Math.sin(theta);
              shadow.push(point(a.x+.13+x*Math.cos(yaw)+z*Math.sin(yaw),.018,a.z+.12-x*Math.sin(yaw)+z*Math.cos(yaw)));
            }
            polygon(shadow,'#414c55');
          }
          model(a.type,a.x,bus?.025:0,a.z,yaw,roll);
        }
      }
    }
    return {render,renderer:'Canvas 2D',dispose(){}};
  }

  window.BusWorld = {
    init(canvas) {
      const options={antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false};
      const gl2=canvas.getContext('webgl2',options);
      const gl=gl2||canvas.getContext('webgl',options);
      if(gl) return gpuRenderer(canvas,gl,Boolean(gl2));
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx) throw Error('Le navigateur ne peut pas créer de surface de dessin.');
      return canvasRenderer(canvas,ctx);
    }
  };
})();
