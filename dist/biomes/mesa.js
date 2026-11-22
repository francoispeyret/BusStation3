(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {turn,mod,clamp01,basin}=window.BusMesh;

  biomes.model('sandstoneButte',(m,variant)=>{
    const lobes=[1.07,.92,1.14,.93,1.06,.96,1.10,.89], count=lobes.length;
    const cap=1+variant*.09;
    const strata=[
      [1.16,-3],[.91,3.1],[.75,4.15],[.77,4.70],
      [.68,8.8],[.71,9.44],[.64,12.2],[.67,12.70],[.61,13.05]
    ];
    const colors=['#b5694e','#cb8060','#e9a573','#be7150','#df9567','#a75c45','#d68a5f','#edb483'];
    const rim=([r,h])=>lobes.map((v,i)=>{
      const angle=(i+variant*.21)*turn/count;
      return [Math.cos(angle)*v*r*10+h*.043,h*cap,Math.sin(angle)*v*r*6.5];
    });
    let lower=rim(strata[0]);
    for(let j=1;j<strata.length;j++) {
      const upper=rim(strata[j]);
      for(let i=0;i<count;i++) {
        const k=(i+1)%count, shade=.86+.12*Math.sin((i+.5)*turn/count);
        m.quad(lower[i],lower[k],upper[k],upper[i],colors[j-1],shade);
      }
      lower=upper;
    }
    for(let i=1;i<count-1;i++) m.tri(lower[0],lower[i],lower[i+1],'#e4a77c');
  });

  biomes.model('cactus',(m,variant)=>{
    const dark=variant%2?'#579079':'#70956b';
    m.rings(0,0,0,[[.37,0,.31],[.33,2.65,.3],[.21,3.13,.2],[.04,3.24,.04]],6,dark);
    for(const side of [-1,1]) {
      const y=side<0?.83:1.38;
      m.rings(side*.23,y,0,[[.22,0,.20],[.32,.38,.24,.32*side],
        [.19,.69,.19,.59*side],[.16,1.38,.16,.59*side],[.04,1.48,.04,.59*side]],5,dark);
    }
  });

  biomes.model('condor',m=>{
    m.rings(0,0,0,[[.11,0,.55],[.22,.19,.64],[.10,.31,.44]],5,'#5a4440');
    for(const side of [-1,1]) {
      const shoulder=[side*.10,.22,.25], elbow=[side*1.40,.56,.40];
      const tip=[side*2.63,.41,.26], trailing=[side*1.15,.42,-.50];
      m.quad(shoulder,elbow,tip,trailing,'#674d44');
      m.tri(shoulder,trailing,[side*.12,.13,-.46],'#4f4141');
      for(let i=0;i<3;i++) {
        m.tri(elbow,[side*(2.57-i*.23),.34,.08-i*.18],trailing,'#cfb693',.91-i*.08);
      }
    }
    m.tri([-.19,.12,-.38],[.19,.12,-.38],[0,.09,-.94],'#57413a');
    m.box(0,.14,.47,.20,.20,.31,'#c58067');
  });

  const lake=(x,z)=>basin(x,z,288,108,29,16,38);
  const soar=(time,phase)=>({
    x:2.3*Math.sin(time*.43+phase),y:.62*Math.sin(time*.72+phase),
    z:5.0*Math.sin(time*.28+phase),roll:.21*Math.sin(time*.46+phase)
  });

  biomes.register('mesa',{
    name:'Mésa',grass:'#c98e68',verge:'#daaa79',skyline:false,
    height(x,z) {
      const slope=clamp01((Math.abs(x)-7)/26);
      const rise=slope*slope*(3.8+2.4*Math.sin(x*.083+z*.025));
      return -.70+(rise+.70)*clamp01((lake(x,z)-.93)*2.8);
    },
    surface(x,z) {
      const b=lake(x,z);
      if(b<.68) return '#51a9a5';
      if(b<1.02) return '#77c6b5';
      if(b<1.28) return '#dfb987';
      return Math.sin(x*.15+z*.046)>.65?'#d49a70':'#c98e68';
    },
    populate({index,length,random:r,add}) {
      for(const side of [-1,1]) {
        const along=length*(.27+r()*.44),offset=side*(31+r()*9);
        if(lake(offset,index*length+along)>2.6) {
          add('sandstoneButte',along,offset,{size:.69+r()*.39,variant:mod(index+(side>0?1:0),3)});
        }
        add('sandstoneButte',length*(.15+r()*.7),side*(63+r()*21),
          {size:1.12+r()*.48,variant:Math.floor(r()*3)});
        for(let i=0;i<2;i++) {
          const pos=length*(.07+.43*i+r()*.29),gap=side*(10+r()*9);
          if(lake(gap,index*length+pos)>1.35) add('cactus',pos,gap,{size:.58+r()*.55,variant:i});
        }
      }
      const side=mod(index,2)?-1:1;
      add('condor',length*.58,side*(13+r()*6),{lift:7+r()*3,yaw:side*.81,motion:soar,size:1.1});
    }
  });
})();
