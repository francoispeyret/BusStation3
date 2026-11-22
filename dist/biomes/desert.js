(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {mod,clamp01,basin}=window.BusMesh;

  biomes.model('pyramid',m=>{
    const base=16.3, height=20.4, peak=[0,height,0];
    const corner=(i,h)=>{
      const radius=base*(1-h/height);
      return [i===0||i===3?-radius:radius,h,i<2?-radius:radius];
    };
    const tiers=[-.32,3.4,3.67,7.6,7.87,11.6,11.87,16.0,16.24,18.4];
    for(let i=0;i<4;i++) {
      const j=(i+1)%4, shade=[1,.81,.69,.9][i];
      for(let t=1;t<tiers.length;t++){
        const a=tiers[t-1],b=tiers[t],color=t%2?'#e4bd7d':'#d2a765';
        m.quad(corner(i,a),corner(j,a),corner(j,b),corner(i,b),color,shade);
      }
      m.tri(corner(i,18.4),corner(j,18.4),peak,'#ffe2a1',shade);
    }
    // At the foot of the sunward face a stone lintel frames the dark entrance.
    m.box(0,0,-16.12,2.26,1.98,.43,'#bc985e');
    m.quad([-.73,0,-16.36],[.73,0,-16.36],[.73,1.51,-16.36],[-.73,1.51,-16.36],'#70593f');
  });

  biomes.model('dromedary',m=>{
    const coat='#bd8855',shadow='#a57a53';
    for(const x of [-.32,.32]) for(const z of [-.81,.67]) {
      m.box(x,.12,z,.20,1.56,.21,shadow);
      m.box(x,.02,z+.06,.25,.17,.39,'#846249');
    }
    m.rings(0,1.3,0,[[.32,0,.86],[.51,.31,1.19],[.44,.73,1.13],[.28,.83,.75]],7,coat);
    m.rings(0,1.94,-.24,[[.44,0,.75],[.36,.40,.56],[.13,.72,.23]],7,'#c5915d');
    m.rings(0,1.67,.80,[[.28,0,.38],[.23,.43,.31,0,.31],
      [.16,1.00,.23,0,.52],[.17,1.32,.24,0,.61]],6,coat);
    m.box(0,2.85,1.56,.40,.38,.73,coat);
    m.box(0,2.85,1.95,.34,.22,.30,'#a77950');
    for(const x of [-.13,.13]) m.box(x,3.19,1.41,.095,.19,.12,shadow);
    m.tri([0,1.96,-1],[.13,1.92,-1.04],[.12,1.08,-1.31],shadow);
  });

  const oasis=(x,z)=>basin(x,z,432,180,26,14,29);
  const wind=(x,z)=>Math.sin(x*.139+z*.034+1.55*Math.sin(z*.016));
  const walk=(time,phase)=>({
    z:1.65*Math.sin(time*.30+phase),y:.055*Math.abs(Math.sin(time*3.7+phase)),
    pitch:.027*Math.sin(time*3.7+phase)
  });

  biomes.register('desert',{
    name:'Désert',grass:'#e7c78d',verge:'#ead09e',skyline:false,
    height(x,z) {
      const value=wind(x,z),slope=clamp01((Math.abs(x)-7.4)/22);
      const dune=slope*slope*(1+value)*(3.5+1.6*Math.sin(z*.018-x*.042));
      return -.60+(dune+.60)*clamp01((oasis(x,z)-.92)*2.2);
    },
    surface(x,z) {
      const b=oasis(x,z);
      if(b<.70) return '#50aaa3';
      if(b<1.05) return '#83c8b7';
      if(b<1.31) return '#a7b575';
      return wind(x,z)>.62?'#f1d79d':'#e7c78d';
    },
    populate({index,length,random:r,add}) {
      if(mod(index,6)===2) {
        const side=mod(Math.floor(index/6),2)?-1:1;
        for(const [along,gap] of [[.24,14],[.48,11.6],[.78,16],[.80,37],[.30,39]]) {
          add('palm',along*length,side*gap,{size:.83+r()*.34,variant:Math.floor(r()*3)});
        }
      }
      if(mod(index,10)===5) {
        const side=mod(Math.floor(index/10),2)?1:-1;
        add('pyramid',length*.55,side*33,{size:1.06,anchor:'road'});
      }
      if(mod(index,3)===0) {
        const side=mod(index,2)?1:-1;
        add('dromedary',length*.40,side*13.4,{yaw:side*.83,motion:walk});
        add('dromedary',length*.51,side*15.2,{yaw:side*.73,size:.77,motion:walk});
      }
    }
  });
})();
