/* Bus Station 3. A small, batched WebGL renderer with streamed track sections. */
(() => {
  'use strict';

  const CHUNK = 72;
  const FAR = 288;
  const LANE = 3.65;
  const ROAD = LANE * 1.5;
  const TAU = Math.PI * 2;
  const {roadX, roadSlope, periodForLap} = window.BusDrive;
  const colorCache = new Map();
  const BEND_START = 24;
  const BEND_RATE = .00095;
  const outerBands = Array.from({length:14}, (_,i) => 88 + 24*i);
  const meadowBands = [...outerBands.map(x => -x).reverse(),
    ...Array.from({length:33}, (_,i) => (i-16)*4), ...outerBands];
  const centreBand = (meadowBands.length-1)/2;

  function groundBend(forward) {
    const beyond = Math.max(0, forward-BEND_START);
    return -BEND_RATE*beyond*beyond;
  }

  function meadowRise(offset, z) {
    const t = Math.min(1, Math.max(0, (Math.abs(offset)-8.5)/32));
    if (!t) return 0;
    const side = Math.sign(offset);
    const ridge = 4.4 + 1.7*Math.sin(z*.030 + side*1.5)
      + 1.1*Math.cos(z*.018 + offset*.040) + .8*Math.sin(z*.048 - offset*.024);
    return t*t*(3-2*t)*ridge;
  }

  function meadowHeight(x, z) { return meadowRise(x-roadX(z), z); }

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
    // Cache the slope once per streamed section. One extra row on each end
    // also grounds trees whose branches cross the section seam.
    const rows = Array.from({length:CHUNK/4+3}, (_,i) => {
      const z=(i-1)*4, worldZ=start+z;
      return {x:roadX(worldZ), heights:meadowBands.map(x => meadowRise(x,worldZ))};
    });
    function strip(z0,z1,l,r,y,col) {
      const a=roadX(start+z0),b=roadX(start+z1);
      m.quad([a+l,y,z0],[a+r,y,z0],[b+r,y,z1],[b+l,y,z1],col);
    }
    for(let z=0;z<CHUNK;z+=4) {
      const a=rows[z/4+1], b=rows[z/4+2];
      for (let i=0;i<meadowBands.length-1;i++) {
        const l=meadowBands[i], u=meadowBands[i+1];
        const al=a.heights[i], ar=a.heights[i+1], bl=b.heights[i], br=b.heights[i+1];
        const light=1-.28*(ar-al)/(u-l)+.14*(bl-al)/4;
        m.quad([a.x+l,al-.06,z],[a.x+u,ar-.06,z],[b.x+u,br-.06,z+4],
          [b.x+l,bl-.06,z+4],'#afba6d',light);
      }
      strip(z,z+4,-ROAD-.68,ROAD+.68,-.015,'#d6bf86');
      strip(z,z+4,-ROAD,ROAD,0,'#595564');
      for(const side of [-1,1]) {
        const x=side*(ROAD-.18);
        strip(z,z+4,x-.055,x+.055,.013,'#f7db8c');
      }
      if(z%12===0) for(const x of [-LANE/2,LANE/2]) strip(z,z+3.7,x-.08,x+.08,.015,'#ffe7b8');
    }
    const firstProp=m.data.length;
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
    // Match the same two grass triangles used above so roots and rocks sit
    // on the hillside, even between grid vertices.
    for (let i=firstProp;i<m.data.length;i+=6) {
      const x=m.data[i], z=m.data[i+2], cell=Math.floor(z/4), v=z/4-cell;
      const a=rows[cell+1], b=rows[cell+2];
      const offset=x-(a.x+(b.x-a.x)*v);
      if (Math.abs(offset)<8) continue;
      if (Math.abs(offset)>=64) { m.data[i+1]+=meadowHeight(x,start+z); continue; }
      const col=Math.floor(offset/4), j=centreBand+col, u=offset/4-col;
      m.data[i+1]+=u>=v
        ? (1-u)*a.heights[j]+(u-v)*a.heights[j+1]+v*b.heights[j+1]
        : (1-v)*a.heights[j]+(v-u)*b.heights[j]+u*b.heights[j+1];
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
  function lettering(m,str,cx,cy,z,pixel,col,direction=1) {
    const width=(str.length*4-1)*pixel;
    Array.from(str).forEach((ch,c) => glyphs[ch].forEach((row,y) => Array.from(row).forEach((v,x) => {
      if(v!=='1') return;
      const left=cx+direction*((c*4+x)*pixel-width/2), right=left+direction*pixel;
      m.quad([left,cy-y*pixel,z],[right,cy-y*pixel,z],[right,cy-(y+1)*pixel,z],[left,cy-(y+1)*pixel,z],col);
    })));
  }

  function wheel(m,side,z,segments=14) {
    const x=side*1.16, y=.52;
    const loop=(offset,rad,col) => {
      const a=x+side*offset;
      for(let i=0;i<segments;i++) {
        const u=i*TAU/segments, v=(i+1)*TAU/segments;
        m.tri([a,y,z],[a,y+rad*Math.cos(u),z+rad*Math.sin(u)],[a,y+rad*Math.cos(v),z+rad*Math.sin(v)],col);
      }
    };
    for(let i=0;i<segments;i++) {
      const u=i*TAU/segments,v=(i+1)*TAU/segments, ax=x+side*.12, bx=x-side*.17;
      m.quad([ax,y+.46*Math.cos(u),z+.46*Math.sin(u)],[bx,y+.46*Math.cos(u),z+.46*Math.sin(u)],[bx,y+.46*Math.cos(v),z+.46*Math.sin(v)],[ax,y+.46*Math.cos(v),z+.46*Math.sin(v)],'#35444b');
    }
    loop(.12,.46,'#313d44'); loop(.125,.28,'#dfd8bb');
    if(segments>8) { loop(.13,.18,'#75888a'); loop(.135,.095,'#cfd8ce'); }
  }

  function bus(lowDetail = false) {
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
      for(let j=0;j<4;j++) {
        const z=-1.67+j*1.03;
        m.box(s*1.129,1.68,z,.115,.85,.88,'#405962');
        m.box(s*1.19,1.77,z,.02,.66,.73,'#5d98a4');
        m.box(s*1.203,2.19,z,.014,.19,.72,'#77aeb7');
      }
      for(const z of [-1.55,1.54]) wheel(m,s,z,lowDetail?8:14);
      m.box(s*1.25,2.1,1.77,.27,.055,.09,'#586a68');
      m.box(s*1.39,2.01,1.77,.11,.25,.15,'#52666a');
    }
    mark(1,0,-1);
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

  // Frame the distant ridgeline one sixth of the way down the driving view.
  const FOCAL_LENGTH = 1.55;
  const SKY_FRACTION = 1/6;
  const RIDGE_PITCH = Math.atan((1-2*SKY_FRACTION)/FOCAL_LENGTH);
  function camera(state, aspect) {
    const distance = state.roadZ ?? state.distance ?? 0;
    const a = Math.atan(roadSlope(distance));
    const framing = Math.max(1, .70 / aspect);
    const back = 13.3 * framing;
    const height = 12.9 * framing;
    // A low ridge 115 m ahead represents the skyline of the curved course.
    // Sight it from the actual camera height, including in portrait.
    const chasePitch = RIDGE_PITCH + Math.atan2(height-2,115);
    const follow = .22 * LANE * (state.laneX || 0);
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
    const minFrontRadius = 4.65;
    const frontRadius = Math.max(minFrontRadius,1.38+2.9/aspect);
    const radius = frontRadius*remaining + back*sweep;
    const pivotX = roadX(distance) + follow*sweep + ((state.laneX||0)*LANE + Math.sin(a)*1.35)*remaining;
    const pivotZ = distance + Math.cos(a)*1.35*remaining;
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

  // Start and end angles are in degrees. The fourth lap is lit by the moon.
  const lapSkies=[
    {elevation:[12.5,16.5],azimuth:[6,13],horizon:[1,.72,.49],zenith:[.53,.64,.82],
      tint:[1.03,.91,.79],fog:[.91,.72,.59],shadow:.97,night:0},
    {elevation:[49,55],azimuth:[30,-22],horizon:[.83,.91,.95],zenith:[.31,.63,.89],
      tint:[1,1,1],fog:[.82,.86,.85],shadow:1,night:0},
    {elevation:[17,12],azimuth:[-13,-9],horizon:[1,.55,.31],zenith:[.46,.36,.61],
      tint:[1.04,.73,.63],fog:[.82,.54,.51],shadow:.93,night:0},
    {elevation:[14,16.5],azimuth:[-5,6],horizon:[.20,.26,.41],zenith:[.045,.065,.16],
      tint:[.23,.31,.55],fog:[.18,.24,.37],shadow:.35,night:1}
  ];
  function lightDirection(elevation,azimuth) {
    elevation*=Math.PI/180;azimuth*=Math.PI/180;
    const horizontal=Math.cos(elevation);
    return {x:horizontal*Math.sin(azimuth),y:Math.sin(elevation),z:horizontal*Math.cos(azimuth)};
  }

  function lapLighting(state) {
    const lap=state.lap??1, p=Math.min(1,Math.max(0,state.lapProgress||0));
    const current=lapSkies[periodForLap(lap)], next=lapSkies[periodForLap(lap+1)];
    // Ease into the next period over the final 60 m. Pausing, restarting and
    // crossing the fourth lap all use the same distance-based state.
    const end=Math.min(1,Math.max(0,(p-.94)/.06)), blend=end*end*(3-2*end);
    const mix=(a,b,t=blend)=>a+(b-a)*t;
    const palette=key=>blend ? current[key].map((value,i)=>mix(value,next[key][i])) : current[key];
    const elevation=mix(current.elevation[0],current.elevation[1],p);
    const azimuth=mix(current.azimuth[0],current.azimuth[1],p);
    const direction=lightDirection(mix(elevation,next.elevation[0]),mix(azimuth,next.azimuth[0]));
    let sun=direction, moon=direction;
    if(current.night!==next.night && blend>0) {
      const departing=lightDirection(elevation,azimuth);
      const arriving=lightDirection(next.elevation[0],next.azimuth[0]);
      sun=current.night ? arriving : departing;
      moon=current.night ? departing : arriving;
    }
    return {direction,sun,moon,night:mix(current.night,next.night),shadow:mix(current.shadow,next.shadow),
      horizon:palette('horizon'),zenith:palette('zenith'),tint:palette('tint'),fog:palette('fog')};
  }

  function projectDisc(body,cam) {
    // Place each disc on the curved backdrop beyond the ridge so low sun
    // and moon sit inside the narrow strip of sky above the mountains.
    const ca=Math.cos(cam.a), sa=Math.sin(cam.a), cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
    const scale=FAR/Math.hypot(body.x,body.z);
    const forward=scale*(body.x*sa+body.z*ca);
    const dy=body.y*scale-15-cam.cy+.64*groundBend(forward);
    const depth=forward*cp-dy*sp;
    if(forward<1 || depth<1) return null;
    return [cam.f*scale*(body.x*ca-body.z*sa)/(cam.aspect*depth),cam.f*(dy*cp+forward*sp)/depth];
  }

  // A light ray keeps xz - y * sun.xz / sun.y constant. Using its ground
  // intersection as the map coordinate keeps both cascades aligned to the road.
  // Work relative to the camera, before applying the curved-horizon effect.
  const lightCoordinates = `
    uniform vec2 lightSlope;
    uniform float cameraHeight;
    vec3 lightPoint(vec3 relative) {
      float height = relative.y + cameraHeight;
      return vec3(relative.xz - height * lightSlope, (height + 4.0) / 28.0);
    }`;
  const momentPacking = `
    vec4 packMoments(vec2 v) {
      vec2 scaled = clamp(v, 0.0, 1.0) * 255.0;
      return vec4(floor(scaled)/255.0, fract(scaled));
    }
    vec2 moments(vec4 value) { return value.rg + value.ba / 255.0; }`;
  const shaderPrecision = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
  `;
  const casterVertex = `
    attribute vec3 aPos;
    uniform vec3 offset;
    uniform mat3 model;
    uniform vec4 bounds;
    ${lightCoordinates}
    varying mediump float height;
    void main() {
      vec3 p = lightPoint(offset + model * aPos);
      height = p.z;
      gl_Position = vec4((p.xy - bounds.xy) * bounds.zw * 2.0, 1.0 - 2.0*p.z, 1.);
    }`;
  const casterFragment = `${shaderPrecision}
    varying mediump float height;
    uniform float opacity;
    ${momentPacking}
    void main() {
      // A dissolving collision object gradually stops blocking the sun.
      // Stable screen-door coverage becomes continuous after the spatial filter.
      if (opacity < 1.0 && fract(dot(mod(floor(gl_FragCoord.xy), 4.0),
          vec2(.3125,.25))) >= opacity) discard;
      gl_FragColor = packMoments(vec2(height, height*height));
    }`;
  const filterVertex = `attribute vec2 aPos; varying mediump vec2 uv;
    void main(){uv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`;
  const filterFragment = `${shaderPrecision}
    varying mediump vec2 uv;
    uniform mediump sampler2D source;
    uniform vec2 stepUV;
    ${momentPacking}
    void main() {
      vec2 m = .227027 * moments(texture2D(source,uv));
      m += .316216 * (moments(texture2D(source,uv-1.384615*stepUV))
                    + moments(texture2D(source,uv+1.384615*stepUV)));
      m += .070270 * (moments(texture2D(source,uv-3.230769*stepUV))
                    + moments(texture2D(source,uv+3.230769*stepUV)));
      gl_FragColor = packMoments(m);
    }`;

  const vertexCode = `
    attribute vec3 aPos;
    attribute vec3 aColor;
    uniform vec3 offset;
    uniform mat3 model;
    uniform vec4 cameraAngles;
    uniform vec3 projection;
    varying lowp vec3 color;
    uniform vec3 coachOffset;
    uniform mat3 coachFrame;
    varying mediump vec3 lampPoint;
    varying lowp float lens;
    ${lightCoordinates}
    uniform vec4 nearBounds, farBounds;
    uniform vec2 farLightSlope;
    varying mediump vec4 shadowUV;
    varying mediump float receiverHeight;
    varying lowp float shadowVisibility;
    void main() {
      vec3 w = offset + model * aPos;
      lampPoint = (w - coachOffset) * coachFrame - vec3(0.,1.06,2.645);
      float isLamp=step(1.9,aColor.r), isTail=step(3.9,aColor.r);
      lens = isLamp-2.*isTail;
      color = aColor - vec3(2.*(isLamp+isTail),0.,0.);
      vec3 light = lightPoint(w);
      vec2 farPoint = w.xz - (w.y + cameraHeight)*farLightSlope;
      shadowUV = vec4((light.xy - nearBounds.xy)*nearBounds.zw,
                      (farPoint - farBounds.xy)*farBounds.zw) + .5;
      receiverHeight = light.z;
      float forward = w.x*cameraAngles.y + w.z*cameraAngles.x;
      float beyond = max(0.0, forward - ${BEND_START.toFixed(1)});
      w.y -= projection.z * beyond * beyond;
      float viewX = w.x*cameraAngles.x - w.z*cameraAngles.y;
      float viewY = w.y*cameraAngles.z + forward*cameraAngles.w;
      float depth = forward*cameraAngles.z - w.y*cameraAngles.w;
      gl_Position = vec4(viewX*projection.x,viewY*projection.y,depth*1.0018 - .56, depth);
      float fog = smoothstep(55.0,255.0,forward)*.48;
      shadowVisibility = 1.0-fog;
    }`;
  const fragmentCode=`${shaderPrecision}
    varying lowp vec3 color;
    varying mediump vec3 lampPoint;
    varying lowp float lens;
    uniform lowp float opacity, shadowStrength, headlamps;
    uniform mediump vec3 ambientTint, fogColor;
    uniform mediump sampler2D nearShadow, farShadow;
    varying mediump vec4 shadowUV;
    varying mediump float receiverHeight;
    varying lowp float shadowVisibility;
    ${momentPacking}
    float edge(vec2 uv) {
      vec2 halfUV = abs(uv-.5);
      return max(halfUV.x,halfUV.y);
    }
    float occlusion(vec4 sampleValue, float bias) {
      vec2 m = moments(sampleValue);
      // Scale before squaring to retain small offsets on mediump-only GPUs.
      float delta = max(0., m.x - receiverHeight - bias) * 16.;
      if (delta<=0.) return 0.;
      float variance = max(.0046, (m.y*16. - m.x*(m.x*16.))*16.);
      return delta*delta / (delta*delta + variance);
    }
    float beamLight(vec3 p) {
      if(p.z<=0. || p.z>=56.) return 0.;
      // The dipped axes meet the road roughly 15 m ahead. The beams first
      // form separate pools, then overlap as their angular width increases.
      float axis=.82+.055*p.z, width=.26+.18*p.z;
      float vertical=(p.y+.070*p.z)/(.20+.18*p.z);
      vec2 lateral=(p.x+vec2(-axis,axis))/width;
      vec2 beam=1.-smoothstep(vec2(.04),vec2(1.35),lateral*lateral+vertical*vertical);
      float cutoff=1.-smoothstep(.04+.012*p.z,.45+.055*p.z,p.y);
      return (beam.x+beam.y-beam.x*beam.y)*cutoff*(1.-smoothstep(16.,56.,p.z));
    }
    void main(){
      float shade=0.;
      if (shadowStrength>0.) {
        float blend=smoothstep(.34,.47,edge(shadowUV.xy));
        if (blend<1.) shade=(1.-blend)*occlusion(texture2D(nearShadow,shadowUV.xy),.0007);
        if (blend>0.) shade+=blend*(1.-smoothstep(.46,.495,edge(shadowUV.zw)))
          *occlusion(texture2D(farShadow,shadowUV.zw),.0015);
      }
      vec3 lit=color*ambientTint*mix(vec3(1.),vec3(.58,.64,.72),shade*shadowStrength);
      if(headlamps>0.) {
        lit+=headlamps*beamLight(lampPoint)*(color*vec3(.93,.78,.50)+vec3(.065,.045,.012));
        // Warm spill on the immediate housing leaves the lenses brighter than the grille.
        vec3 toLens=vec3(abs(lampPoint.x)-.82,lampPoint.y,2.*lampPoint.z);
        float housing=1.-smoothstep(.09,.36,length(toLens));
        lit+=headlamps*housing*vec3(.34,.22,.08);
        vec3 toTail=vec3(abs(lampPoint.x)-.93,lampPoint.y+.19,2.*(lampPoint.z+5.31));
        lit+=headlamps*(1.-smoothstep(.045,.22,length(toTail)))*vec3(.27,.018,.009);
        vec3 lampTint=lens<0. ? vec3(1.42,.46,.30) : vec3(1.16,1.09,1.03);
        lit=mix(lit,min(vec3(1.),color*lampTint),headlamps*abs(lens));
      }
      gl_FragColor=vec4(mix(fogColor,lit,shadowVisibility),opacity);
    }`;
  const skyVertex=`attribute vec2 aPos; varying mediump vec2 uv;
    void main(){uv=aPos;gl_Position=vec4(aPos,0.,1.);}`;
  const skyFragment=`precision mediump float;
    varying mediump vec2 uv;
    uniform vec4 discs;
    uniform vec3 horizonColor, zenithColor;
    uniform float aspect, horizonY, night;
    void main(){
      vec3 col=mix(horizonColor,zenithColor,smoothstep(-.08,.46,uv.y-horizonY));
      vec2 scale=vec2(aspect,1.);
      float r=length((uv-discs.xy)*scale);
      col=mix(col,vec3(1.,.76,.45),.46*(1.-night)*(1.-smoothstep(.048,.36,r)));
      col=mix(col,vec3(1.,.93,.72),(1.-night)*(1.-smoothstep(.048,.052,r)));
      vec2 moon=(uv-discs.zw)*scale;
      float m=length(moon);
      col=mix(col,vec3(.57,.69,.91),.24*night*(1.-smoothstep(.045,.24,m)));
      float maria=1.-smoothstep(.007,.014,length(moon-vec2(-.014,.012)));
      maria+=1.-smoothstep(.005,.011,length(moon-vec2(.009,-.019)));
      vec3 moonColor=vec3(.89,.92,1.)-maria*vec3(.11,.10,.07);
      col=mix(col,moonColor,night*(1.-smoothstep(.045,.048,m)));
      gl_FragColor=vec4(col,1.);
    }`;

  function program(gl,is2,vert,frag) {
    const compile=(type,src) => {
      if(is2) {
        src=src.replace(/\battribute\b/g,'in').replace(/\bvarying\b/g,type===gl.VERTEX_SHADER?'out':'in');
        src=src.replace(/\btexture2D\b/g,'texture');
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
    let scene,sky,uniform,skyUniform,skyBuffer,coach,trail,range,items, lost=false;
    let caster,filter,casterUniform,filterUniform,rawMap,blurMap,nearMap,farMap;
    let farSample=null;
    const chunks=new Map();
    const modelMatrix=new Float32Array(9);
    function transform(a,roll,pitch,sx=1,sy=1,sz=1) {
      const cy=Math.cos(a), sn=Math.sin(a), cr=Math.cos(roll), sr=Math.sin(roll);
      const cp=Math.cos(pitch), sp=Math.sin(pitch);
      modelMatrix[0]=cy*cr*sx; modelMatrix[1]=sr*sx; modelMatrix[2]=-sn*cr*sx;
      modelMatrix[3]=(sn*sp-cy*sr*cp)*sy; modelMatrix[4]=cr*cp*sy; modelMatrix[5]=(sn*sr*cp+cy*sp)*sy;
      modelMatrix[6]=(sn*cp+cy*sr*sp)*sz; modelMatrix[7]=-cr*sp*sz; modelMatrix[8]=(cy*cp-sn*sr*sp)*sz;
      return modelMatrix;
    }
    const locations=(p,names)=>Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,n)]));
    function shadowTarget(width,height,withDepth=false) {
      const texture=gl.createTexture(), framebuffer=gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      let depth=null;
      if(withDepth) {
        depth=gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
        gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      }
      return {texture,framebuffer,depth,width,height};
    }
    function upload(model) {
      const b=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,b);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(model.data),gl.STATIC_DRAW);
      return {buf:b,n:model.data.length/6};
    }
    function prepare() {
      scene=program(gl,is2,vertexCode,fragmentCode);
      sky=program(gl,is2,skyVertex,skyFragment);
      caster=program(gl,is2,casterVertex,casterFragment);
      filter=program(gl,is2,filterVertex,filterFragment);
      skyUniform=locations(sky,['discs','aspect','horizonY','night','horizonColor','zenithColor']);
      uniform=locations(scene,['offset','model','cameraAngles','projection','opacity','ambientTint','fogColor',
        'coachOffset','coachFrame','headlamps','shadowStrength','lightSlope','farLightSlope',
        'cameraHeight','nearBounds','farBounds','nearShadow','farShadow']);
      casterUniform=locations(caster,['offset','model','lightSlope','cameraHeight','bounds','opacity']);
      filterUniform=locations(filter,['source','stepUV']);
      const limit=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      const width=Math.min(512,limit),height=Math.min(640,limit);
      rawMap=shadowTarget(width,height,true);
      blurMap=shadowTarget(width/2,height/2);
      nearMap=shadowTarget(width/2,height/2);
      farMap=shadowTarget(width/2,height/2);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.useProgram(scene);
      gl.uniform1i(uniform.nearShadow,0);
      gl.uniform1i(uniform.farShadow,1);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,farMap.texture);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,nearMap.texture);
      skyBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      coach=upload(bus());
      range=upload(backdrop());
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
      farSample=null;
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
      const light=lapLighting(s), sun=light.direction;
      const solar=light.night<1 && projectDisc(light.sun,cam);
      const lunar=light.night>0 && projectDisc(light.moon,cam);
      gl.uniform4f(skyUniform.discs,solar?solar[0]:0,solar?solar[1]:-10,lunar?lunar[0]:0,lunar?lunar[1]:-10);
      gl.uniform1f(skyUniform.aspect,cam.aspect);
      gl.uniform1f(skyUniform.horizonY,cam.f*Math.tan(cam.pitch));
      gl.uniform1f(skyUniform.night,light.night);
      gl.uniform3fv(skyUniform.horizonColor,light.horizon);
      gl.uniform3fv(skyUniform.zenithColor,light.zenith);
      gl.disable(gl.DEPTH_TEST); gl.disableVertexAttribArray(1);
      gl.enableVertexAttribArray(0); gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
      gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.drawArrays(gl.TRIANGLES,0,3);
      gl.useProgram(scene); gl.enable(gl.DEPTH_TEST);gl.enableVertexAttribArray(1);
      gl.uniform4f(uniform.cameraAngles,Math.cos(cam.a),Math.sin(cam.a),Math.cos(cam.pitch),Math.sin(cam.pitch));
      // Distant mountains form a backdrop behind the rolling ground.
      gl.uniform3f(uniform.projection,cam.f/cam.aspect,cam.f,BEND_RATE*.64);
      gl.uniform3fv(uniform.ambientTint,light.tint);
      gl.uniform3fv(uniform.fogColor,light.fog);
      gl.uniform1f(uniform.headlamps,0);
      gl.uniform1f(uniform.opacity,1);
      gl.uniform1f(uniform.shadowStrength,0);
      let transformUniform=uniform;
      function draw(mesh,x,y,z,a=0,roll=0,pitch=0,sx=1,sy=1,sz=1,fadeSolid=false) {
        gl.uniformMatrix3fv(transformUniform.model,false,transform(a,roll,pitch,sx,sy,sz));
        gl.uniform3f(transformUniform.offset,x-cam.cx,y-cam.cy,z-cam.cz);
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buf);
        gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
        if(transformUniform===uniform) gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
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
      const intro=s.introProgress<1;
      draw(range,0,-15,d);
      if(intro) {
        // As the camera rises, move the lateral matte below the terrain so it
        // joins the forward skyline without a cut on ultrawide views.
        const settle=Math.max(0,2*s.introProgress-1);
        const base=-15-84*settle*settle;
        draw(range,0,base,d,Math.PI*.5);
        draw(range,0,base,d,Math.PI);
      }
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(uniform.projection,cam.f/cam.aspect,cam.f,BEND_RATE);
      const start=Math.floor((intro ? d-FAR : cam.cz-5)/CHUNK),end=Math.floor((d+FAR)/CHUNK);
      // Include off-screen casters even at moonrise or sunset, when the
      // highest trees on the hillside can project beyond an entire section.
      const slopeZ=sun.z/sun.y, reachZ=18*Math.abs(slopeZ)+5;
      const firstCaster=start-(slopeZ<0 ? Math.ceil(reachZ/CHUNK) : 1);
      const lastCaster=end+(slopeZ>0 ? Math.ceil(reachZ/CHUNK) : 1);
      for(let idx=firstCaster;idx<=lastCaster;idx++) {
        if(!chunks.has(idx)) chunks.set(idx,upload(section(idx)));
      }
      for(const [idx,mesh] of chunks) if(idx<firstCaster||idx>lastCaster) {
        gl.deleteBuffer(mesh.buf);chunks.delete(idx);
      }
      const actors=[];
      for(const o of s.objects||[]) {
        if(!items[o.type]||o.z < -8||o.z>FAR) continue;
        const z=d+o.z, x=roadX(z)+o.lane*LANE, a=Math.atan(roadSlope(z));
        const pickup=o.type==='boost'||o.type==='repair';
        actors.push({casts:o.type!=='oil'&&o.type!=='pothole',
          args:[items[o.type],x,pickup?Math.sin(t*3+z*.06)*.12:0,z,a+(pickup?.29*Math.sin(t*2.5+z*.17):0)]});
      }
      const x=roadX(d)+lane*LANE;
      const a=Math.atan(roadSlope(d))+(s.heading||0);
      const speed=Math.min(1,(s.speed||0)/70);
      const roll=(s.steer||0)*.072+(s.flat?.044+Math.sin(d*1.6)*.013:0)+(s.hit ? Math.sin(t*26)*.035*speed:0);
      const busY=.035+Math.sin(d*1.05)*speed*.018+(s.flat?0:Math.cos(d*.73)*.008),pitch=brakingPitch(s);
      actors.push({casts:true,args:[coach,x,busY,d,a,roll,pitch]});
      const impacts=[];
      impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
        impacts.push({solid:type==='cone'||type==='barrier',alpha,args:[items[type],x,y,z,yaw,roll,pitch,sx,sy,sz]});
      });

      function bounds(cx,cz,width,depth) {
        // Snap to world texels to keep filtered edges still as the camera pans.
        const tx=width/rawMap.width,tz=depth/rawMap.height;
        return [Math.round(cx/tx)*tx-cam.cx,Math.round(cz/tz)*tz-cam.cz,1/width,1/depth];
      }
      const nearBounds=bounds(cam.cx+12*Math.sin(cam.a),cam.cz+12*Math.cos(cam.a),84,84);
      function filterPass(source,target,dx,dz) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
        gl.viewport(0,0,target.width,target.height);
        gl.bindTexture(gl.TEXTURE_2D,source.texture);
        gl.uniform2f(filterUniform.stepUV,dx,dz);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      function renderMap(target,area,blurStep) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,rawMap.framebuffer);
        gl.viewport(0,0,rawMap.width,rawMap.height);
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(caster);
        transformUniform=casterUniform;
        gl.uniform2f(casterUniform.lightSlope,sun.x/sun.y,sun.z/sun.y);
        gl.uniform1f(casterUniform.cameraHeight,cam.cy);
        gl.uniform4fv(casterUniform.bounds,area);
        gl.uniform1f(casterUniform.opacity,1);
        const midZ=area[1]+cam.cz;
        // The highest trees reach under 18 m, including their hillside.
        const reach=.5/area[3]+reachZ;
        const first=Math.max(firstCaster,Math.floor((midZ-reach)/CHUNK));
        const last=Math.min(lastCaster,Math.floor((midZ+reach)/CHUNK));
        for(let i=first;i<=last;i++) draw(chunks.get(i),0,0,i*CHUNK);
        for(const actor of actors) if(actor.casts && Math.abs(actor.args[3]-midZ)<reach) draw(...actor.args);
        for(const impact of impacts) if(impact.solid) {
          gl.uniform1f(casterUniform.opacity,impact.alpha);
          draw(...impact.args);
        }
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(filter);
        gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
        gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        gl.uniform1i(filterUniform.source,0);
        filterPass(rawMap,blurMap,blurStep*area[2],0);
        filterPass(blurMap,target,0,blurStep*area[3]);
      }
      gl.disableVertexAttribArray(1);
      gl.disable(gl.DITHER);
      // The filter operates in metres, so dynamic screen resolution does not
      // change the penumbra. A lower sun gives the longer shadows softer edges.
      const blurStep=.23+.14*(1-sun.y);
      renderMap(nearMap,nearBounds,blurStep);
      // Distant features move by a fraction of a pixel between frames. Keep
      // the light and world-space origin with their map until its next redraw.
      if(!farSample || t<=farSample.t || t-farSample.t>=.10 || Math.abs(d-farSample.d)>3 ||
          intro!==farSample.intro || Math.abs(sun.x/sun.y-farSample.sx)+Math.abs(slopeZ-farSample.sz)>.35) {
        const sx=sun.x/sun.y,sz=sun.z/sun.y;
        // Scenery lies within 75 m of the route's world axis. Fit its full
        // projected height range and the visible route, including rear views
        // in the opening orbit, so small roadside objects retain map texels.
        const midZ=intro ? d : (cam.cz+d+FAR)*.5;
        const spanZ=intro ? 2*(FAR+CHUNK) : d+FAR-cam.cz+CHUNK;
        const area=bounds(-8*sx,midZ-8*sz,192+18*Math.abs(sx),spanZ+18*Math.abs(sz));
        renderMap(farMap,area,.48);
        farSample={t,d,intro,x:area[0]+cam.cx,z:area[1]+cam.cz,invX:area[2],invZ:area[3],sx,sz};
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,w,h);
      gl.enable(gl.DITHER);
      gl.enable(gl.DEPTH_TEST);gl.enableVertexAttribArray(1);
      gl.useProgram(scene);
      transformUniform=uniform;
      gl.uniform1f(uniform.shadowStrength,light.shadow);
      gl.uniform1f(uniform.headlamps,light.night);
      gl.uniform3f(uniform.coachOffset,x-cam.cx,busY-cam.cy,d-cam.cz);
      gl.uniformMatrix3fv(uniform.coachFrame,false,transform(a,roll,pitch));
      gl.uniform2f(uniform.lightSlope,sun.x/sun.y,sun.z/sun.y);
      gl.uniform2f(uniform.farLightSlope,farSample.sx,farSample.sz);
      gl.uniform1f(uniform.cameraHeight,cam.cy);
      gl.uniform4fv(uniform.nearBounds,nearBounds);
      gl.uniform4f(uniform.farBounds,farSample.x-cam.cx,farSample.z-cam.cz,farSample.invX,farSample.invZ);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,farMap.texture);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,nearMap.texture);
      for(let i=start;i<=end;i++) draw(chunks.get(i),0,0,i*CHUNK);
      if(s.boost) draw(trail,x,.12,d+.16*Math.sin(t*16),a);
      for(const actor of actors) draw(...actor.args);
      if(impacts.length) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for(const {solid,alpha,args} of impacts) {
          gl.uniform1f(uniform.opacity,alpha);
          if(solid && alpha===1) gl.depthMask(true);
          draw(...args,solid && alpha<1);
          if(solid && alpha===1) gl.depthMask(false);
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    function dispose(){
      observe?.disconnect();
      canvas.removeEventListener('webglcontextlost',lostHandler);
      canvas.removeEventListener('webglcontextrestored',restoreHandler);
      for(const model of [coach,range,trail,...Object.values(items),...chunks.values()]) gl.deleteBuffer(model.buf);
      for(const target of [rawMap,blurMap,nearMap,farMap]) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
        if(target.depth) gl.deleteRenderbuffer(target.depth);
      }
      gl.deleteBuffer(skyBuffer);
      for(const p of [sky,scene,caster,filter]) gl.deleteProgram(p);
    }
    return {render,dispose,renderer:is2?'WebGL 2':'WebGL'};
  }

  // Software fallback projects the same bus and pickups. Simplified scenery keeps
  // the road playable on devices that cannot create a WebGL context.
  function canvasRenderer(canvas, ctx) {
    const cars = new Map();
    const fadeCanvas = canvas.ownerDocument.createElement('canvas');
    const fadeContext = fadeCanvas.getContext('2d');
    // A small horizon buffer replaces a per-pixel depth buffer in the software renderer.
    const columns=32, stride=columns+1, depthStep=6, rows=Math.ceil(FAR/depthStep)+1;
    const skyline=new Float32Array(stride*rows);
    // A few points describe each solid's silhouette in the software renderer.
    // Project these instead of reprocessing all the triangles used for its trim.
    function ring(rx,y,rz,n=8) {
      return Array.from({length:n},(_,i)=>[rx*Math.cos(i*TAU/n),y,rz*Math.sin(i*TAU/n)]);
    }
    function boxCorners(rx,low,high,rz) {
      return [low,high].flatMap(y=>[[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz]]);
    }
    const shadowProfiles={
      bus:boxCorners(1.18,.15,2.94,2.58),
      cone:[...ring(.52,.04,.49),[0,1.15,0]],
      barrier:boxCorners(1.12,.05,1.28,.25),
      repair:boxCorners(.56,.50,1.36,.32),
      boost:[[0,.38,0],[-.56,.91,0],[.58,1.28,0],[.38,1.73,0],[-.10,1.73,0]],
      pine:[[0,0,0],...ring(.31,.27,.31),[0,1,0]],
      crown:[[0,0,0],...ring(.32,.62,.32),...ring(.18,.89,.18),[0,1,0]]
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
        const tag=d[i+3]>3.9?4:d[i+3]>1.9?2:0;
        const red=d[i+3]-tag;
        const key=(Math.round(red*255)<<16)|(Math.round(d[i+4]*255)<<8)|Math.round(d[i+5]*255);
        if(!materials.has(key)) materials.set(key,[red,d[i+4],d[i+5]]);
        const emission=tag===4 ? [.99,.14,.075] : tag===2 ? [1,.96,.74] : null;
        out.push({layer,side,end,v:[[d[i],d[i+1],d[i+2]],[d[i+6],d[i+7],d[i+8]],[d[i+12],d[i+13],d[i+14]]],
          col:materials.get(key),emission});
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
      const focal=h*.5*c.f;
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
      const near=intro ? d-FAR : c.cz+1.7, far=d+FAR, zs=Math.floor(far/4)*4;
      // Sample the closest visible ridge in each screen column, front to back.
      // Its depth history clips distant crowns even when a bank crosses the road in perspective.
      skyline.fill(h+focal,0,stride);
      for(let row=1;row<rows;row++) {
        const q=row*depthStep, base=groundBend(q)-c.cy, baseDepth=q*cp-base*sp;
        const x0=c.cx+q*sn,z0=c.cz+q*cs, offset=row*stride;
        for(let col=0;col<=columns;col++) {
          const slope=w*(col/columns-.5)/focal;
          let right=slope*baseDepth;
          let hill=meadowHeight(x0+right*cs,z0-right*sn);
          // Refine the azimuth for a raised bank on a pitched camera.
          if(hill>0) {
            right=slope*(baseDepth-hill*sp);
            hill=meadowHeight(x0+right*cs,z0-right*sn);
          }
          const dy=base+hill;
          const screenY=h*.5-focal*(dy*cp+q*sp)/Math.max(.2,q*cp-dy*sp);
          skyline[offset+col]=Math.min(skyline[offset-stride+col],screenY);
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
        const disc=projectDisc(body,c);
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
      const busX=roadX(d)+(s.laneX||0)*LANE,busYaw=Math.atan(roadSlope(d))+(s.heading||0);
      const lampSin=Math.sin(busYaw),lampCos=Math.cos(busYaw);
      function litColor(col,fog=0,lamp=0,emission=null) {
        const warm=[1,.87,.62];
        const channels=col.map((base,i)=>{
          let lit=base*(light.tint[i]+warm[i]*lamp);
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
        if(forward<=0 || forward>=56) return 0;
        const fade=Math.min(1,Math.max(0,(forward-16)/40));
        const vertical=(height-1.06+.07*forward)/(.25+.16*forward);
        return (1-fade*fade*(3-2*fade))*Math.max(0,1-vertical*vertical);
      }
      function headlightAt(x,height,z) {
        if(light.night<=0) return 0;
        const dx=x-busX,dz=z-d,forward=dx*lampSin+dz*lampCos-2.64;
        const power=beamPower(forward,height);
        if(!power) return 0;
        const lateral=dx*lampCos-dz*lampSin, width=.26+.18*forward;
        let total=0;
        for(const side of [-1,1]) {
          const offset=(lateral-side*(.82+.055*forward))/width;
          const falloff=Math.max(0,1-offset*offset);
          total+=falloff*falloff;
        }
        return light.night*Math.min(1,total*power);
      }
      for (let layer=0;layer<2;layer++) {
        ctx.fillStyle=litColor(rgb(layer?'#929979':'#ae9aa9'),layer?.18:.33);ctx.beginPath();ctx.moveTo(-6,h);
        for(let x=-6;x<=w+6;x+=6) {
          const k=x/h*4.8+c.a*.8+layer*4;
          const relief=.065+.032*Math.cos(k)+.027*Math.sin(k*2.9)+.019*Math.cos(k*4.2);
          ctx.lineTo(x,mountainBase+layer*2-h*relief*(layer ? .45 : 1));
        }
        ctx.lineTo(w+6,h);ctx.fill();
      }
      const grass=ctx.createLinearGradient(0,groundLine-h*.04,0,groundLine+h*.30);
      grass.addColorStop(0,litColor(rgb('#acbc86'),.25));grass.addColorStop(1,litColor(rgb('#afba6d')));
      ctx.fillStyle=grass;ctx.beginPath();ctx.moveTo(0,h);
      for(let col=0;col<=columns;col++) ctx.lineTo(w*col/columns,skyline[farRidge+col]);
      ctx.lineTo(w,h);ctx.fill();
      function roadClearance(p) {
        return Math.min((roadCrest-p[3])*focal/roadCrest,crestAt(p[0],ridgeBefore(p[3]))+.4-p[1]);
      }
      function appendGroundPath(vertices,clearance) {
        const points=vertices.map(v=>point(v[0],v[1],v[2]));
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
        if(visible.some(p=>p[3]>depthStep)) {
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
        ctx.moveTo(visible[0][0],visible[0][1]);
        for(let i=1;i<visible.length;i++) ctx.lineTo(visible[i][0],visible[i][1]);
        ctx.closePath();
      }
      function drawHeadlightBeams() {
        // Trace equal-intensity contours of each beam onto the same ground as
        // the shadows. The two pools meet as they open up down the road.
        const layers=20;
        ctx.fillStyle='#f7dc9c';
        ctx.globalAlpha=light.night*.40/layers;
        for(const side of [-1,1]) {
          const slices=[];
          for(let step=0;step<=32;step++) {
            const f=56*step/32;
            const lateral=side*(.82+.055*f),z=d+(f+2.64)*lampCos-lateral*lampSin;
            const x=busX+(f+2.64)*lampSin+lateral*lampCos;
            slices.push({x,z,width:.26+.18*f,power:beamPower(f,meadowHeight(x,z))});
          }
          for(let i=0;i<layers;i++) {
            const level=(i+.5)/layers,left=[],right=[];
            let previous=slices[0];
            for(const slice of slices) {
              if((previous.power>level)!==(slice.power>level)) {
                const ratio=(level-previous.power)/(slice.power-previous.power);
                const x=previous.x+(slice.x-previous.x)*ratio,z=previous.z+(slice.z-previous.z)*ratio;
                const tip=[x,meadowHeight(x,z),z];
                left.push(tip);right.push(tip);
              }
              previous=slice;
              if(slice.power<=level) continue;
              const half=slice.width*Math.sqrt(1-Math.sqrt(level/slice.power));
              const dx=half*lampCos,dz=-half*lampSin;
              const x=slice.x,z=slice.z;
              left.push([x-dx,meadowHeight(x-dx,z-dz),z-dz]);
              right.push([x+dx,meadowHeight(x+dx,z+dz),z+dz]);
            }
            if(left.length<2) continue;
            ctx.beginPath();appendGroundPath(left.concat(right.reverse()),groundClearance);ctx.fill();
          }
        }
      }
      function drawLampGlows(a) {
        const dx=c.cx-a.x,dz=c.cz-a.z;
        const along=dx*lampSin+dz*lampCos,front=along>=0;
        const facing=(Math.abs(along)-2.65)/Math.max(1,Math.hypot(dx,dz));
        if(facing<=0) return;
        const cr=Math.cos(a.roll),sr=Math.sin(a.roll),ct=Math.cos(a.pitch),st=Math.sin(a.pitch);
        ctx.save();ctx.globalAlpha=light.night*Math.min(1,2*facing);
        for(const side of [-1,1]) {
          const lx=side*(front?.82:.93),ly=front?1.07:.87,lz=front?2.65:-2.67;
          const y=ly*ct-lz*st,z=ly*st+lz*ct,x=lx*cr-y*sr;
          const p=point(a.x+x*lampCos+z*lampSin,a.y+lx*sr+y*cr,a.z-x*lampSin+z*lampCos);
          if(p[2]<.25) continue;
          const radius=(front?.34:.23)*focal/p[2],glow=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],radius);
          glow.addColorStop(0,front?'rgba(255,251,212,.9)':'rgba(255,63,29,.85)');
          glow.addColorStop(.38,front?'rgba(255,226,153,.35)':'rgba(255,44,20,.35)');
          glow.addColorStop(1,front?'rgba(255,212,130,0)':'rgba(255,44,20,0)');
          ctx.fillStyle=glow;ctx.fillRect(p[0]-radius,p[1]-radius,2*radius,2*radius);
        }
        ctx.restore();
      }
      function ribbon(l,r,y,color,dashed=false) {
        ctx.fillStyle=litColor(rgb(color));ctx.beginPath();
        for(let z=zs;z>=near-4;z-=4) {
          if(dashed && z%12!==0) continue;
          const a=Math.max(z,near), b=z+4, ax=roadX(a), bx=roadX(b);
          appendGroundPath([[ax+l,y,a],[ax+r,y,a],[bx+r,y,b],[bx+l,y,b]],roadClearance);
        }
        ctx.fill();
      }
      ribbon(-ROAD-.65,ROAD+.65,-.01,'#d6bf86');
      ribbon(-ROAD,ROAD,0,'#595564');
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
        for(const f of source) {
          if (f.side && f.side*cameraSide<1.1) continue;
          if (f.end && f.end*cameraEnd<2.5) continue;
          const p=f.v.map(([vx,vy,vz])=>{
            const py=vy*sy*cpitch-vz*sz*spitch,pz=vy*sy*spitch+vz*sz*cpitch;
            const lx=vx*sx*cr-py*sr;
            return point(x+lx*cy+pz*snYaw,y+vx*sx*sr+py*cr,z-lx*snYaw+pz*cy);
          });
          if(p.every(v=>v[2]>.2)) {
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
      const sunHeight=Math.max(.12,sun.y),casterMargin=16/sunHeight;
      for(let n=Math.floor((near-casterMargin)/8);n<=Math.ceil((far+casterMargin)/8);n++) {
        const z=n*8, r=random(n+463);
        for(const side of [-1,1]) {
          const x=roadX(z)+side*(ROAD+3.8+r()*12), size=3.5+r()*4;
          actors.push({type:'tree',x,y:meadowHeight(x,z),z,size,kind:r()<.53});
        }
      }
      for(const o of s.objects||[]) if(o.z>=-8 && o.z<=FAR) {
        const z=d+o.z, pickup=o.type==='repair'||o.type==='boost', t=s.time||0;
        actors.push({type:o.type,x:roadX(z)+o.lane*LANE,z,y:pickup?.12*Math.sin(t*3+z*.06):0,
          yaw:Math.atan(roadSlope(z))+(pickup?.29*Math.sin(t*2.5+z*.17):0),ground:o.type==='oil'||o.type==='pothole'});
      }
      actors.push({type:'bus',x:busX,y:.025,z:d,
        yaw:busYaw,roll:(s.steer||0)*.072+(s.flat?.045:0),pitch:brakingPitch(s)});
      impactParts(s,(type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha)=>{
        const ground=type==='oil'||type==='waterRipple'||type==='repairHalo'||type==='boostHalo';
        actors.push({type,x,y,z,yaw,roll,pitch,sx,sy,sz,alpha,ground});
      });
      for (const a of actors) {
        const centerY=a.type==='bus' ? 1.4 : a.y||0;
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
        const clipped=clipToRidge(base,focal*1.4/Math.max(1,base[2]));
        const lamp=a.ground?0:headlightAt(a.x,a.y+.65,a.z);
        model(a.type,a.x,a.y,a.z,a.yaw,a.roll||0,a.pitch,a.sx,a.sy,a.sz,a.alpha,lamp);
        if(a.type==='bus'&&light.night>0) drawLampGlows(a);
        if(clipped) ctx.restore();
      }
      for(const a of actors) if(a.ground) drawSolid(a);

      const rayX=-sun.x/sunHeight,rayZ=-sun.z/sunHeight;
      // Find where the light ray meets the meadow, including shadows stretching
      // from an elevated bank across the flat road.
      function land(x,y,z) {
        let fall=Math.max(0,y-meadowHeight(x,z));
        for(let i=0;i<4;i++) {
          const next=Math.max(0,y-meadowHeight(x+rayX*fall,z+rayZ*fall));
          if(Math.abs(next-fall)<.015) break;
          fall=(fall+next)*.5;
        }
        return [x+rayX*fall,z+rayZ*fall];
      }
      function groundClearance(p) { return crestAt(p[0],ridgeBefore(p[3]))+.4-p[1]; }
      function drawShadow(a,profile) {
        if(a.forward < -casterMargin || a.forward>FAR+casterMargin) return;
        const yaw=a.yaw||0,roll=a.roll||0,pitch=a.pitch||0;
        const cy=Math.cos(yaw),sy=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),ct=Math.cos(pitch),st=Math.sin(pitch);
        const outline=convexOutline(profile.map(([vx,vy,vz])=>{
          const x=vx*(a.size||a.sx||1), y=vy*(a.size||a.sy||1), z=vz*(a.size||a.sz||1);
          const py=y*ct-z*st,pz=y*st+z*ct,px=x*cr-py*sr;
          return land(a.x+px*cy+pz*sy,a.y+x*sr+py*cr,a.z-px*sy+pz*cy);
        }));
        if(outline.length<3) return;
        let mx=0,mz=0;
        const rim=[];
        for(let i=0;i<outline.length;i++) {
          const [x,z]=outline[i], [nx,nz]=outline[(i+1)%outline.length];
          mx+=x;mz+=z;
          const steps=Math.ceil(Math.hypot(nx-x,nz-z)/4);
          for(let k=0;k<steps;k++) {
            const px=x+(nx-x)*k/steps,pz=z+(nz-z)*k/steps;
            rim.push([px,pz]);
          }
        }
        mx/=outline.length;mz/=outline.length;
        const footprint=scale=>rim.map(([x,z])=>{
          x=mx+(x-mx)*scale;z=mz+(z-mz)*scale;
          return [x,meadowHeight(x,z),z];
        });
        const outer=footprint(1.34),screen=outer.map(v=>point(...v));
        const center=point(mx,meadowHeight(mx,mz),mz);
        const penumbra=a.size ? a.size*.16 : a.type==='bus' ? .58 : .2;
        const blur=Math.min(h*.055,penumbra*focal/Math.max(2,center[2]));
        if(screen.every(p=>p[2]<=.25) || (screen.every(p=>p[2]>.25) &&
          (screen.every(p=>p[0]<-3*blur)||screen.every(p=>p[0]>w+3*blur)||screen.every(p=>p[1]>h+3*blur)||screen.every(p=>groundClearance(p)<-1)))) return;
        // Drape nested contours on the terrain. A smooth opacity ramp and
        // extra samples for large shadows keep the foreground feathered.
        const opacity=light.shadow*(a.alpha??1)*(.72-.32*Math.min(1,Math.max(0,a.forward)/FAR));
        const layers=Math.max(6,Math.min(36,Math.ceil(2*blur)));
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
        const profile=shadowProfiles[a.type==='tree'?(a.kind?'pine':'crown'):a.type];
        if(profile && light.shadow>.005) drawShadow(a,profile);
      }
      if(light.night>0) drawHeadlightBeams();
      ctx.restore();
      for(const a of actors) {
        if(a.ground) continue;
        let clipped=false;
        if(a.type==='tree') {
          const b=point(a.x,a.y,a.z),top=point(a.x,a.y+a.size,a.z),sh=b[1]-top[1];
          if(b[2]<1||sh<1||b[0]<-sh||b[0]>w+sh) continue;
          const half=sh*.33, row=ridgeBefore(a.forward);
          if(top[1]>Math.max(crestAt(b[0]-half,row),crestAt(b[0],row),crestAt(b[0]+half,row))+1) continue;
          clipped=clipToRidge(b,half);
          const fog=fogAt(a.forward),crownLamp=headlightAt(a.x,a.y+a.size*.67,a.z);
          ctx.fillStyle=litColor(rgb('#856a48'),fog,headlightAt(a.x,a.y+.65,a.z));ctx.fillRect(b[0]-sh*.045,b[1]-.53*sh,.09*sh,.55*sh);
          if(a.kind) {
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
