(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {turn,beam}=window.BusMesh;

  biomes.model('palm',(m,variant)=>{
    const lean=variant%2 ? -.85 : .73;
    m.rings(0,0,0,[[.48,0,.44],[.32,2.4,.31,.12*lean],
      [.25,4.8,.24,.45*lean],[.24,6.9,.23,lean]],7,'#a37b51',.3);
    for(let i=0;i<9;i++) {
      const a=i*turn/9+variant*.85, dx=Math.cos(a), dz=Math.sin(a);
      const length=3.4+i%3*.34, rise=i%2*.55;
      const leaf=(r,h,w=0)=>[lean+dx*r-dz*w,h,dz*r+dx*w];
      const stem=leaf(0,6.84), mid=leaf(length*.43,7.85+rise);
      const left=leaf(length*.52,7.48+rise,.54), right=leaf(length*.52,7.48+rise,-.54);
      const tip=leaf(length,5.45+rise);
      const col=i%3===0?'#7aaf59':'#4b9463';
      m.tri(stem,left,mid,col); m.tri(stem,mid,right,col,.77);
      m.tri(left,tip,mid,col,.92); m.tri(mid,tip,right,col,.69);
    }
  });

  biomes.model('walker',(m,variant,jacket=['#bd5948','#447c87','#d3a348'][variant%3])=>{
    const skin=['#b97d5a','#d8a381','#885d48'][variant%3];
    for(const side of [-1,1]) {
      const x=side*.105, stride=side*.19;
      beam(m,[x,.85,0],[x,.44,stride*.68],.095,.08,'#405366');
      beam(m,[x,.44,stride*.68],[x,.10,stride],.08,.065,'#405366');
      m.box(x,0,stride+.045,.16,.12,.26,'#46434a');
      beam(m,[side*.23,1.40,0],[side*.28,1.10,-stride*.70],.09,.065,jacket);
      beam(m,[side*.28,1.10,-stride*.70],[side*.29,.95,-stride],.07,.053,skin);
    }
    m.rings(0,.78,0,[[.20,0,.14],[.25,.53,.17],[.19,.66,.13]],6,jacket,.5);
    m.box(0,1.39,0,.13,.13,.14,skin);
    m.rings(0,1.48,0,[[.13,0,.12],[.17,.17,.15],[.14,.30,.13]],6,skin,.5);
    m.box(0,1.70,-.02,.33,.12,.26,'#534742');
    if(variant%3===2) m.box(0,1.70,.10,.35,.044,.18,'#38656a');
  });

  biomes.model('seaFoam',m=>{
    // Two loose, tapered strokes follow a small breaking wave.
    m.quad([-.20,.07,-2.55],[.32,.07,-.41],[.37,.07,.18],[.03,.07,-.33],'#d3f1df');
    m.quad([.03,.07,-.33],[.37,.07,.18],[-.18,.07,2.4],[-.20,.07,1.44],'#e7f4df');
    m.tri([.77,.08,.54],[1,.08,1.31],[.82,.08,2.12],'#c5e6d6');
  });
})();
