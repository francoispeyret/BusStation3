(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const lane=biomes.LANE_WIDTH;
  const {turn,mod}=window.BusMesh;

  const waterY=-4.4;

  function hull(m,color) {
    const shape=[[0,3.30],[.96,1.58],[1.10,-1.57],[.84,-2.53],[-.84,-2.53],[-1.1,-1.57],[-.96,1.58]];
    const rings=[[.69,-.43],[.93,.12],[1,.53],[1.02,.65]]
      .map(([r,y])=>shape.map(([x,z])=>[x*r,y,z*r]));
    for(let k=1;k<rings.length;k++) for(let i=0;i<shape.length;i++) {
      const j=(i+1)%shape.length;
      m.quad(rings[k-1][i],rings[k-1][j],rings[k][j],rings[k][i],
        k===3?'#ffebca':color,.89+.09*Math.cos(i*turn/shape.length));
    }
    for(let i=1;i<shape.length-1;i++) m.tri(rings[3][0],rings[3][i],rings[3][i+1],'#cfad80');
  }
  biomes.model('sailboat',(m,variant)=>{
    hull(m,variant%2?'#527f89':'#b86452');
    const sail=variant%2?'#e5ab65':'#edc783';
    m.box(0,.65,-.63,1.20,.37,1.68,'#eee1bb');
    m.box(0,.68,.30,.10,5.85,.10,'#907354');
    const high=[0,6.48,.31], tack=[0,1.37,.28], clew=[.61,1.58,-2.30], belly=[.56,3.52,-.77];
    m.tri(tack,high,belly,'#fff0c9'); m.tri(tack,belly,clew,sail); m.tri(belly,high,clew,'#f4dbac');
    m.tri([-.05,5.29,.43],[-.33,1.27,2.64],[-.20,1.42,.58],'#fdf0cb');
    m.tri([0,6.48,.3],[0,6.12,.3],[.08,6.32,-.38],'#c46e52');
  });
  biomes.model('fishingBoat',m=>{
    hull(m,'#456775');
    m.box(0,.65,-.66,1.56,1.05,1.74,'#e7d9b2');
    m.box(0,1.55,-.66,1.75,.18,1.99,'#b76d56');
    m.box(0,1.10,-.66,1.58,.39,1.76,'#688e93');
    m.box(.40,1.71,-.91,.28,.62,.27,'#817466');
    m.box(-.08,.65,.68,.11,2.75,.11,'#8f7961');
    m.tri([-.08,3.36,.68],[-.08,2.91,.68],[.1,3.21,.02],'#d68b64');
    m.box(0,.66,1.50,.91,.34,.63,'#ba925f');
  });

  biomes.model('humpback',m=>{
    // Sections along the spine form the broad head and narrow tail stock.
    const sections=[[-4.15,.23,.29,.25],[-2.82,.46,.52,.22],[-1.16,1.02,.86,.22],
      [.62,1.24,1.02,.24],[2.12,1.07,.80,.22],[3.07,.64,.47,.20],[3.43,.22,.20,.21]];
    const rings=sections.map(([z,w,h,center])=>Array.from({length:8},(_,i)=>{
      const a=turn*i/8;
      return [w*Math.cos(a),center+h*Math.sin(a),z];
    }));
    for(let k=1;k<rings.length;k++) for(let i=0;i<8;i++) {
      const j=(i+1)%8;
      m.quad(rings[k-1][i],rings[k-1][j],rings[k][j],rings[k][i],
        i>3?'#96ada9':'#506b79',.88+.10*Math.sin(i*turn/8));
    }
    for(let i=1;i<7;i++) m.tri(rings[6][0],rings[6][i],rings[6][i+1],'#5d7781');
    m.tri([0,.98,-1.72],[0,1.71,-1.83],[0,1.06,-.81],'#4b6271');
    for(const s of [-1,1]) {
      m.tri([0,.53,-3.80],[s*2.17,.79,-4.67],[s*.69,.40,-5.12],'#506b76');
      m.tri([0,.53,-3.80],[s*.69,.40,-5.12],[0,.46,-4.81],'#607d85');
      m.tri([s*.87,.2,1.1],[s*2.43,-.18,-.35],[s*.92,-.23,-.24],'#879fa1');
    }
  });

  biomes.model('bridgePost',m=>{
    m.box(0,-.26,0,.37,.39,.46,'#6f8586');
    m.box(0,.05,0,.21,1.26,.24,'#57777e');
    m.box(0,1.26,0,.27,.11,.30,'#d8ded0');
  });
  biomes.model('bridgePortal',m=>{
    const steel='#58777b', bright='#92ab9f';
    for(const side of [-1,1]) {
      const x=side*(6.62+lane);
      m.box(x,waterY-.2,0,1.55,-waterY+.9,2.24,'#9b9f8d');
      m.box(x,.65,0,.83,10.2,1.04,steel);
      m.box(x-.49*side,6.5,0,.18,4.43,1.12,bright);
      m.box(x,10.81,0,1.08,.44,1.24,bright);
      for(const z of [-.48,.48]) {
        m.quad([x,7.27,z],[x,8.26,z],[side*(4.18+lane),10.50,z],[side*(3.23+lane),10.50,z],steel);
      }
    }
    m.box(0,10.39,0,13.23+2*lane,.63,1.05,steel);
    m.box(0,10.95,0,13.27+2*lane,.17,1.11,bright);
  });

  const sail=(t,p)=>({x:1.60*Math.sin(t*.17+p),z:4.2*Math.sin(t*.23+p),
    y:.09*Math.sin(t*.97+p),roll:.060*Math.sin(t*.81+p),pitch:.025*Math.sin(t*1.13+p)});
  const swim=(t,p)=>({x:1.6*Math.sin(t*.26+p),z:3.5*Math.sin(t*.23+p),
    y:-.06+.66*Math.sin(t*.78+p),pitch:.19*Math.sin(t*.78+p+.9),roll:.08*Math.cos(t*.78+p)});

  const rails=[];
  for(const side of [-1,1]) for(const [inner,outer,y,color] of [
    [5.46,6.65,.045,'#b5baae'],[6.20,6.48,.08,'#92a7a3'],
    [6.24,6.44,.64,'#809a99'],[6.20,6.48,1.30,'#b9cbbe']
  ]) {
    rails.push({left:(side<0?-outer:inner)+side*lane,right:(side<0?-inner:outer)+side*lane,y,color});
  }
  biomes.register('bridge',{
    name:'Pont',grass:'#579ca9',verge:'#aab7ad',roadColor:'#66737a',shoulder:lane+.68,roadDetails:rails,skyline:false,signPlatform:true,
    height:()=>waterY,
    surface(x,z) {
      return Math.sin(x*.125+z*.037)+Math.sin(x*.034-z*.071)>.96?'#68aab3':'#579ca9';
    },
    populate({index,length,random:r,add}) {
      for(const side of [-1,1]) for(let i=0;i<8;i++) {
        add('bridgePost',(i+.5)*length/8,side*(6.34+lane),{anchor:'road',keepNearSign:true});
      }
      if(mod(index,2)===0) add('bridgePortal',length*.52,0,{anchor:'road',keepNearSign:true});
      const side=mod(index,2)?-1:1;
      const boat=mod(index,3)===0?'fishingBoat':'sailboat';
      add(boat,length*(.26+r()*.20),side*(18+r()*9),
        {variant:mod(index,3),size:.96+r()*.27,yaw:side*(.53+r()*.51),motion:sail});
      if(mod(index,3)!==2) add('humpback',length*(.53+r()*.16),-side*(17+r()*7),{
        size:1.09+r()*.22,yaw:-side*(.81+r()*.38),motion:swim});
      for(const bank of [-1,1]) for(let i=0;i<3;i++)
        add('seaFoam',length*(i+.20+r()*.48)/3,bank*(15+r()*23),{yaw:.8,size:.9+r()*.67});
    }
  });
})();
