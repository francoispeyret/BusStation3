/* Shared low-poly geometry, colours and lettering for both renderers. */
(() => {
  'use strict';
  const TAU = 2*Math.PI;
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

  function appendTriangle(data, a, b, c, red, green, blue) {
    data.push(a[0],a[1],a[2],red,green,blue, b[0],b[1],b[2],red,green,blue,
      c[0],c[1],c[2],red,green,blue);
  }

  class Mesh {
    constructor() { this.data = []; }
    instance(source,x,y,z,yaw,size) {
      const c=Math.cos(yaw), s=Math.sin(yaw), d=source.data;
      for(let i=0;i<d.length;i+=6) {
        this.data.push(x+size*(c*d[i]+s*d[i+2]), y+size*d[i+1],
          z+size*(c*d[i+2]-s*d[i]), d[i+3],d[i+4],d[i+5]);
      }
    }
    tri(a, b, c, color, light = 1) {
      const v = rgb(color);
      appendTriangle(this.data, a, b, c, v[0]*light, v[1]*light, v[2]*light);
    }
    quad(a,b,c,d,color,light=1) {
      const v = rgb(color), r=v[0]*light, g=v[1]*light, blue=v[2]*light;
      appendTriangle(this.data, a, b, c, r, g, blue);
      appendTriangle(this.data, a, c, d, r, g, blue);
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

  // Most surfaces are emitted as A,B,C,A,C,D. Reuse those corners after all
  // terrain and lighting edits, comparing the exact position and colour bits
  // that the GPU receives. Keep triangle order for depth, blending and shadows.
  function gpuGeometry(model) {
    const vertices = new Float32Array(model.data);
    const count = vertices.length / 6;
    if (count < 6 || count > 65535) return {vertices, indices:null};
    const words = new Uint32Array(vertices.buffer);
    function sameVertex(a,b) {
      return words[a]===words[b] && words[a+1]===words[b+1] && words[a+2]===words[b+2]
        && words[a+3]===words[b+3] && words[a+4]===words[b+4] && words[a+5]===words[b+5];
    }
    const indices = new Uint16Array(count);
    let packed = 0;
    for (let i=0; i<count;) {
      const src = i*6, dst = packed*6;
      const quad = i+6<=count && sameVertex(src,src+18) && sameVertex(src+12,src+24);
      if (src!==dst) words.copyWithin(dst,src,src+18);
      indices[i] = packed;
      indices[i+1] = packed+1;
      indices[i+2] = packed+2;
      if (quad) {
        words.copyWithin(dst+18, src+30, src+36);
        indices[i+3] = packed;
        indices[i+4] = packed+2;
        indices[i+5] = packed+3;
        i += 6;
        packed += 4;
      } else {
        i += 3;
        packed += 3;
      }
    }
    if (packed===count) return {vertices, indices:null};
    if (packed*24 + indices.byteLength >= vertices.byteLength) {
      return {vertices:new Float32Array(model.data), indices:null};
    }
    return {vertices:vertices.subarray(0,packed*6), indices};
  }

  const glyphs = {
    A:['010','101','111','101','101'], B:['110','101','110','101','110'],
    C:['111','100','100','100','111'], E:['111','100','110','100','111'],
    D:['110','101','101','101','110'], H:['101','101','111','101','101'],
    J:['001','001','001','101','111'], K:['101','101','110','101','101'],
    Q:['110','101','101','111','001'], W:['101','101','111','111','101'],
    X:['101','101','010','101','101'], Y:['101','101','010','010','010'],
    Z:['111','001','010','100','111'],
    F:['111','100','110','100','100'], G:['111','100','101','101','111'],
    I:['111','010','010','010','111'],
    L:['100','100','100','100','111'], M:['101','111','111','101','101'],
    N:['101','111','111','111','101'], O:['010','101','101','101','010'],
    P:['110','101','110','100','100'], R:['110','101','110','101','101'],
    S:['111','100','111','001','111'], T:['111','010','010','010','010'],
    U:['101','101','101','101','111'], V:['101','101','101','101','010'],
    '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
    '2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
    '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
    '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
    '8':['111','101','111','101','111'], '9':['111','101','111','001','111']
  };
  function lettering(m,str,cx,cy,z,pixel,col,direction=1) {
    const width=(str.length*4-1)*pixel;
    Array.from(str).forEach((ch,c) => {
      if(ch===' ') return;
      if(ch==='É') {
        const l=cx+direction*((c*4+1)*pixel-width/2), r=l+direction*pixel;
        m.quad([l,cy,z],[r,cy,z],[r+direction*pixel,cy+pixel,z],[r,cy+pixel,z],col);
      } else if(ch==='Ê') {
        const l=cx+direction*(c*4*pixel-width/2), step=direction*pixel;
        const tip=[l+1.5*step,cy+1.45*pixel,z], notch=[l+1.5*step,cy+.8*pixel,z];
        m.quad([l,cy+.3*pixel,z],[l+.8*step,cy+.3*pixel,z],notch,tip,col);
        m.quad(tip,notch,[l+2.2*step,cy+.3*pixel,z],[l+3*step,cy+.3*pixel,z],col);
      }
      glyphs[ch==='É'||ch==='Ê'?'E':ch].forEach((row,y) => {
        for(const run of row.matchAll(/1+/g)) {
          const left=cx+direction*((c*4+run.index)*pixel-width/2);
          const right=left+direction*run[0].length*pixel;
          m.quad([left,cy-y*pixel,z],[right,cy-y*pixel,z],[right,cy-(y+1)*pixel,z],[left,cy-(y+1)*pixel,z],col);
        }
      });
    });
  }

  const mod=(n,d)=>((n%d)+d)%d;
  const clamp01=t=>Math.max(0,Math.min(1,t));

  // Basins follow the road in world coordinates so their banks join across sections.
  function basin(offset,z,period,centerZ,shore,rx,rz) {
    const cycle=Math.floor((z-centerZ)/period+.5);
    const dx=(offset-(mod(cycle,2)?-shore:shore))/rx;
    const dz=(z-cycle*period-centerZ)/rz;
    return dx*dx+dz*dz;
  }

  // A tapered four-sided beam can lean in any direction (limbs, poles and antlers).
  function beam(m, a, b, foot, tip, color) {
    const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
    const len=Math.hypot(dx,dy,dz), horiz=Math.hypot(dx,dz);
    const u=horiz ? [dz/horiz,0,-dx/horiz] : [1,0,0];
    const v=[-dy*u[2]/len,(dx*u[2]-dz*u[0])/len,dy*u[0]/len];
    function ring(p,r) {
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>p.map((n,k)=>n+r*(i*u[k]+j*v[k])));
    }
    const low=ring(a,foot), high=ring(b,tip);
    for(let i=0;i<4;i++) m.quad(low[i],low[(i+1)%4],high[(i+1)%4],high[i],color,.86+i*.035);
    m.quad(...high,color);
  }

  function threeGeometry(THREE,model) {
    const {vertices,indices}=gpuGeometry(model);
    const buffer=new THREE.InterleavedBuffer(vertices,6);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
    geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(buffer,3,3));
    if(indices) geometry.setIndex(new THREE.BufferAttribute(indices,1));
    geometry.computeBoundingSphere();
    return geometry;
  }

  window.BusMesh = {Mesh,rgb,random,gpuGeometry,threeGeometry,lettering,turn:TAU,mod,clamp01,basin,beam};
})();
