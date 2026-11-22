/* Village streets, public buildings, storefronts and pedestrians. */
(() => {
  'use strict';
  const {register}=window.BusBiomes;
  const {lettering,turn:TAU}=window.BusMesh;
  const {tree}=window.BusCountryside;

  // The long façade follows the street. Signs on the near gable can be read
  // from the bus before the roadside entrance comes into view.
  const villagePlans = {
    home:  {depth:2.75, width:3.45, eaves:3.45, ridge:5.45},
    shop:  {depth:3, width:4.25, eaves:4.05, ridge:5.55},
    mairie:{depth:3.5, width:5.45, eaves:5.15, ridge:7.25},
    ecole: {depth:3.5, width:6.25, eaves:4.15, ridge:6.35}
  };
  function villageBuilding(m,kind,x,y,z,side,variant=0,lowDetail=false) {
    const {depth,width,eaves,ridge}=villagePlans[kind];
    const style=variant%3, front=x-side*depth, end=z-width;
    const walls=kind==='ecole'?'#c68a65':kind==='mairie'?'#f2dba7':
      ['#f4deb1','#e8b995','#f2ddbf'][style];
    const tiles=kind==='mairie'?'#647981':kind==='home'&&style===2?'#718187':'#bb6550';
    const cream='#fff1d2', glass='#527f86';
    const trim=kind==='shop'?(style===1?'#44877b':'#b95746'):['#60877c','#537d91','#a26d50'][style];
    const step=front-side*3.05, pathWidth=kind==='home' ? .75 : 2.3;
    m.quad([front,y,z-pathWidth],[step,y,z-pathWidth],[step,y,z+pathWidth],[front,y,z+pathWidth],'#c8b99f');
    m.box(x,y,z,depth*2,eaves,width*2,walls);
    const left=x-depth-.27, right=x+depth+.27, near=end-.24, far=z+width+.24;
    const roofY=y+eaves, top=y+ridge;
    for(const gable of [end,z+width]) {
      m.tri([x-depth,roofY,gable],[x+depth,roofY,gable],[x,top,gable],walls,.94);
    }
    m.quad([left,roofY,near],[x,top,near],[x,top,far],[left,roofY,far],tiles);
    m.quad([x,top,near],[right,roofY,near],[right,roofY,far],[x,top,far],tiles,.82);

    // Isolated Canvas meshes use the same outward-facing trim layers as the bus.
    function mark(layer,wallSide=0,wallEnd=0) {
      if(m.layers) m.layers.push({offset:m.data.length,layer,side:wallSide,end:wallEnd});
    }
    function facade(u,base,w,h,color,offset=.04) {
      const face=front-side*offset, u0=z+u-w/2, u1=u0+w, b=y+base;
      mark(1,-side);
      m.quad([face,b,u0],[face,b,u1],[face,b+h,u1],[face,b+h,u0],color);
      mark(0);
    }
    function gablePanel(u,base,w,h,color,offset=.04) {
      const face=end-offset, u0=x+u-w/2, u1=u0+w, b=y+base;
      mark(1,0,-1);
      m.quad([u0,b,face],[u1,b,face],[u1,b+h,face],[u0,b+h,face],color);
      mark(0);
    }
    function windowAt(panel,u,base,w,h) {
      if(!lowDetail) panel(u,base-.10,w+.20,h+.20,cream,.055);
      panel(u,base,w,h,glass,.08);
    }
    function sign(word,base,pixel) {
      gablePanel(0,base,(word.length*4+1)*pixel,7.5*pixel,trim,.1);
      if(!lowDetail) {
        mark(1,0,-1);
        lettering(m,word,x,y+base+6*pixel,end-.13,pixel,cream);
        mark(0);
      }
    }
    const door=kind==='mairie'?'#545e65':trim;
    facade(0,.04,kind==='home'?1.15:1.7,2.3,door);

    if(kind==='home') {
      for(const u of [-2.05,2.05]) {
        if(!lowDetail) facade(u,1.22,1.76,1.2,trim);
        windowAt(facade,u,1.23,.93,1.17);
      }
      for(const u of [-1.35,1.35]) windowAt(gablePanel,u,1.18,1,1.25);
      m.box(x+.86,y+4.4,z+1.7,.56,1.4,.59,'#b58567');
    } else if(kind==='shop') {
      const awning=front-side*1.3;
      for(const u of [-2.42,2.42]) windowAt(facade,u,.53,2.5,1.9);
      for(let i=0;i<9;i++) {
        const u=end+.20+i*.90, color=i%2?cream:trim;
        m.quad([front,y+3.27,u],[front,y+3.27,u+.9],
          [awning,y+2.78,u+.9],[awning,y+2.78,u],color);
        m.quad([awning,y+2.78,u],[awning,y+2.78,u+.9],
          [awning,y+2.55,u+.9],[awning,y+2.55,u],color,.88);
      }
      windowAt(gablePanel,0,.63,4.52,1.72);
      sign(style===1?'CAFÉ':'PAIN',2.7,.21);
    } else if(kind==='mairie') {
      // Pale stone portico, slate roof and a French flag above the ridge.
      const porch=front-side*1.16;
      m.box(front-side*.48,y,z,1.55,.22,4.05,'#dac9a7');
      for(const u of [-1.59,1.59]) m.box(porch,y+.20,z+u,.28,2.88,.32,cream);
      m.box(front-side*.55,y+3.06,z,1.45,.34,3.98,cream);
      m.tri([porch-side*.11,y+3.39,z-2],[porch-side*.11,y+3.39,z+2],
        [porch-side*.11,y+4.42,z],'#efcc95');
      for(const u of [-3.72,3.72]) {
        windowAt(facade,u,.94,1.4,1.55);
        windowAt(facade,u,3.24,1.4,1.26);
      }
      for(const u of [-1.55,1.55]) windowAt(gablePanel,u,1,1.35,1.75);
      sign('MAIRIE',3.25,.23);
      m.box(x-.4,top-.5,z-1.8,.10,2.9,.10,'#8f775b');
      const flag=['#48689c','#fff4d9','#d76652'];
      for(let i=0;i<3;i++) {
        const x0=x-.35+i*.53, x1=x0+.53, z0=z-1.8+.12*i;
        m.quad([x0,top+2.26,z0],[x1,top+2.22,z0+.12],
          [x1,top+1.36,z0+.12],[x0,top+1.4,z0],flag[i]);
      }
    } else {
      // A long brick schoolhouse with banks of classroom windows and a clock.
      for(const u of [-4.63,-2.32,2.32,4.63]) windowAt(facade,u,1.03,1.60,1.65);
      for(const u of [-1.68,1.68]) windowAt(gablePanel,u,.95,1.58,1.55);
      sign('ÉCOLE',2.69,.24);
      const clockY=y+5.35, face=end-.09;
      mark(1,0,-1);
      for(let i=0;i<10;i++) {
        const a=i*TAU/10, b=(i+1)*TAU/10;
        m.tri([x,clockY,face],[x+.66*Math.cos(a),clockY+.66*Math.sin(a),face],
          [x+.66*Math.cos(b),clockY+.66*Math.sin(b),face],cream);
      }
      gablePanel(0,5.32,.09,.50,'#4b6469',.12);
      gablePanel(.14,5.30,.36,.09,'#4b6469',.12);
    }
  }

  function villageLots({index,random:r,place}) {
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      const lot=((index*3+i)%12+12)%12;
      const along=i*24+(side<0 ? 8 : 16)+r()*2;
      let kind='home';
      if(side===-1 && lot===2) kind='mairie';
      else if(side===1 && lot===7) kind='ecole';
      else if((lot+(side===1 ? 2 : 0))%4===0) kind='shop';
      place(kind,side,along,villagePlans[kind].depth+5.15,1);
      if(lot%3===1) place('broadleaf',side,along+(side<0 ? 11 : -11),4.3+r(),4+r()*2.5);
      if(lot%2===0) place('home',side,i*24+3+r()*17,22+r()*8,1);
    }
  }

  function stroll(time,phase) {
    const t=.32*time+phase;
    return {z:2.1*Math.sin(t),yaw:Math.atan2(.12,Math.cos(t)),y:.045*Math.abs(Math.sin(3*time+phase))};
  }

  register('village',{
    name:'Village',grass:'#a6b577',verge:'#d4c4ab',shoulder:2.35,curb:true,roadside:villageLots,
    canvasBuilding:villageBuilding,
    drawRoadside(m,a,localZ,r) {
      if(a.type==='broadleaf') tree(m,a.x,localZ,a.size,1+a.variant%2,r);
      else villageBuilding(m,a.type,a.x,a.y,localZ,a.side,a.variant);
    },
    populate({road,random,add}) {
      for(const side of [-1,1]) {
        add('walker',12+random()*40,side*(road+1.35),{variant:Math.floor(random()*3),motion:stroll});
      }
    }
  });
})();
