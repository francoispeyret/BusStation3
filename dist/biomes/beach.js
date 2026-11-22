(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {turn,mod,clamp01}=window.BusMesh;

  const tide=z=>20+.95*Math.sin(z*.065)+.75*Math.cos(z*.024);

  biomes.model('seaCliff',(m,variant)=>{
    const outline=[[-4.2,-2.1],[-1.2,-4.8],[3.6,-3.9],[5,-.6],[3.8,3.3],[.6,4.9],[-4.5,2.8]];
    const tints=[['#8e7770','#b39a85'],['#7f8582','#aab0a3'],['#a17b65','#c6a587']][variant%3];
    const widths=[1.08,.93,.7,.47], heights=[-2.2,2.8,5.5,7.1];
    const rims=widths.map((width,k)=>outline.map(([x,z],i)=>[
      x*width-.45*k,heights[k]+Math.sin(i*1.92+variant)*(.4+k*.19),z*width+.27*k
    ]));
    for(let k=1;k<rims.length;k++) for(let i=0;i<outline.length;i++) {
      const j=(i+1)%outline.length, tone=.81+.17*Math.cos(i*turn/outline.length);
      m.tri(rims[k-1][i],rims[k-1][j],rims[k][j],tints[0],tone);
      m.tri(rims[k-1][i],rims[k][j],rims[k][i],k===3?tints[1]:tints[0],tone+.06);
    }
    for(let i=1;i<outline.length-1;i++) m.tri(rims[3][0],rims[3][i],rims[3][i+1],tints[1]);
  });

  biomes.model('gull',m=>{
    m.rings(0,0,0,[[.09,0,.42],[.17,.17,.49],[.09,.29,.32]],6,'#fff2d4');
    m.tri([-.10,.23,.33],[.10,.23,.33],[0,.19,.62],'#e6ad66');
    for(const side of [-1,1]) {
      const root=[side*.11,.20,.10], elbow=[side*.82,.46,.20];
      const back=[side*.72,.34,-.29], tip=[side*1.53,.23,-.20];
      m.quad(root,elbow,back,[side*.13,.15,-.28],'#fff6dd');
      m.tri(elbow,tip,back,'#899ba0');
      m.tri(elbow,tip,[side*1.26,.29,-.08],'#516973');
    }
  });

  biomes.model('seaTurtle',m=>{
    for(const side of [-1,1]) {
      for(const z of [-.76,.54]) {
        const tip=[side*(z>0?1.40:1.05),.07,z-.24];
        m.tri([side*.47,.21,z-.3],[side*.37,.23,z+.38],tip,'#739077');
        m.tri([side*.47,.21,z-.3],tip,[side*.85,.08,z-.52],'#809774');
      }
    }
    m.rings(0,.10,0,[[.53,0,.89],[.73,.18,1.03],[.55,.45,.79],[.23,.57,.38]],8,'#78875e',.24);
    m.rings(0,.56,0,[[.36,0,.61],[.24,.12,.41]],6,'#a5a16e',.3);
    m.rings(0,.19,1.04,[[.20,0,.25],[.27,.15,.32],[.18,.26,.23]],6,'#91a07a');
  });

  const glide=(t,p)=>({x:1.9*Math.sin(t*.43+p),z:2.35*Math.sin(t*.37+p),
    y:.46*Math.sin(t*.73+p),roll:.20*Math.sin(t*.62+p)});
  const crawl=(t,p)=>({x:.55*Math.sin(t*.23+p),z:.84*Math.sin(t*.31+p),
    roll:.035*Math.sin(t*2+p)});

  biomes.register('beach',{
    name:'Plage',grass:'#e6d19e',verge:'#e6c895',skyline:false,
    height(x,z) {
      if(x<0) {
        const shelf=clamp01((-x-7)/23);
        return shelf*shelf*(6.5+2.8*Math.sin(z*.073+x*.127)+1.95*Math.cos(z*.033));
      }
      return -1.8*clamp01((x-7.5)/(tide(z)-8.4));
    },
    surface(x,z) {
      if(x<-18) return Math.sin(x*.16+z*.12)>.35?'#a49a84':'#ad947d';
      const depth=x-tide(z);
      if(depth<-.9) return '#e6d19e';
      if(depth<1.15) return '#d0e2ca';
      if(depth<8) return '#8bcfc1';
      if(depth<22) return '#65b6b4';
      return '#559aa7';
    },
    populate({index,length,random:r,add}) {
      for(let i=0;i<4;i++) {
        const along=length*(i+.25+r()*.42)/4;
        add('seaCliff',along,-(14.7+r()*9),{size:.75+r()*.54,variant:mod(i+index,3),yaw:r()*2});
        if(i%2===0) add('seaCliff',along,-(33+r()*11),{size:1.45+r()*.47,variant:mod(i+index+1,3)});
        add('seaFoam',along,21.9+r()*4,{size:.7+r()*.6,yaw:.20});
      }
      for(let i=0;i<2;i++) add('palm',length*(i*.50+.16+r()*.19),10.8+r()*3.4,{
        size:.84+r()*.28,variant:mod(index+i,3)});
      add('seaTurtle',length*.63,16.2+r(),{size:.92+r()*.33,yaw:1.18,motion:crawl});
      for(let i=0;i<2;i++) add('gull',length*(.29+.067*i),13+i*2.2,
        {lift:3.7+i*.9,yaw:-.52,motion:glide,size:1+i*.08});
    }
  });
})();
