/* Dense stands of firs and deer on the wooded banks. */
(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {turn:TAU,beam}=window.BusMesh;
  const {meadowRise,graze}=window.BusCountryside;

  biomes.model('deer',(m,variant)=>{
    const coat=['#b17b50','#a76a44','#986846'][variant%3], horn='#6a5141';
    for(const side of [-1,1]) for(const end of [-1,1]) {
      const z=end*.53, x=side*.20, toe=z+side*.10;
      beam(m,[x,.94,z],[x,.43,toe-.10],.082,.045,coat);
      beam(m,[x,.45,toe-.10],[x,.05,toe],.047,.038,'#765d4d');
      m.box(x,0,toe+.024,.11,.085,.14,'#4a4540');
    }
    m.rings(0,.73,0,[[.17,0,.5],[.33,.16,.75],[.29,.40,.72],[.15,.51,.50]],7,coat,.24);
    beam(m,[0,1.02,.46],[0,1.61,.70],.19,.12,coat);
    m.box(0,1.52,.81,.28,.24,.43,coat);
    m.box(0,1.49,1.05,.18,.12,.14,'#5f5043');
    m.box(0,1.04,-.71,.15,.17,.13,'#f0d8ad');
    for(const side of [-1,1]) {
      beam(m,[side*.10,1.70,.72],[side*.29,1.86,.66],.075,.016,coat);
      if(variant%3===1) continue;
      beam(m,[side*.086,1.72,.72],[side*.18,2.02,.56],.043,.031,horn);
      beam(m,[side*.18,2.02,.56],[side*.33,2.23,.47],.033,.012,horn);
      beam(m,[side*.16,1.97,.58],[side*.22,2.16,.74],.03,.01,horn);
    }
  });

  // Keep the forest lightweight enough to draw several deep rows on each bank.
  const firNeedles = ['#376750','#477657','#527b61'];
  const firTiers = [[.17,.64,.21],[.38,.84,.17],[.60,1,.115]];
  function forestFir(m,x,y,z,height,variant) {
    m.box(x,y,z,height*.052,height*.32,height*.053,'#715b44');
    for(const [base,tip,spread] of firTiers) {
      const angle=variant*.8+base*3, rim=[];
      for(let i=0;i<7;i++) {
        const a=angle+i*TAU/7, radius=height*spread*(1+.07*Math.cos(3*a));
        rim.push([x+radius*Math.cos(a),y+height*(base+.025*(i%2)),z+radius*Math.sin(a)]);
      }
      const peak=[x,y+height*tip,z], underside=[x,y+height*(base+.04),z];
      for(let i=0;i<7;i++) {
        const next=rim[(i+1)%7], tone=.92-.13*Math.cos(angle+(i+.5)*TAU/7);
        m.tri(rim[i],next,peak,firNeedles[variant],tone);
        m.tri(next,rim[i],underside,firNeedles[variant],.67);
      }
    }
  }

  biomes.register('forest',{
    name:'Forêt',grass:'#637b55',verge:'#a49370',height:meadowRise,
    canvasFir:{needles:firNeedles,tiers:firTiers},
    roadside({length,random:r,place}) {
      for(const side of [-1,1]) for(let row=0;row<4;row++) for(let i=0;i<8;i++) {
        const along=(i+.15+.7*r())*length/8;
        place('pine',side,along,5+row*8+r()*5,12+r()*7.5);
      }
    },
    drawRoadside(m,a,localZ) {forestFir(m,a.x,a.y,localZ,a.size,a.variant);},
    populate({index,random,add}) {
      const side=index%2 ? 1 : -1;
      add('deer',19+random()*25,side*(9+random()*2),{yaw:side*.8,motion:graze});
      if(index%3===0) add('deer',43,side*12,{size:.72,variant:1,yaw:side*1.1,motion:graze});
    }
  });
})();
