/* Rolling meadows, alpine cottages and grazing sheep. */
(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {turn:TAU,beam}=window.BusMesh;
  const {meadowRise,tree,graze}=window.BusCountryside;

  biomes.model('sheep',(m,variant)=>{
    const fleece=['#f5e7ca','#ddd6bd','#eae2cc'][variant%3];
    for(const x of [-.22,.22]) for(const z of [-.36,.39]) m.box(x,0,z,.115,.54,.14,'#625a50');
    m.rings(0,.35,0,[[.22,0,.41],[.40,.18,.64],[.42,.38,.66],[.27,.59,.46]],8,fleece,.23);
    beam(m,[0,.75,.42],[0,.37,.81],.15,.13,'#685f54');
    m.box(0,.22,.82,.28,.22,.28,'#514f48');
    for(const side of [-1,1]) beam(m,[side*.10,.50,.72],[side*.30,.42,.75],.08,.035,'#726b5c');
    m.box(0,.59,-.60,.17,.21,.18,fleece);
  });

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

  function hillsideDetails(m,{index,start,length,road,roadX,contains,visible,random:r}) {
    for (let i=0;i<32;i++) {
      const side=i%2 ? 1 : -1;
      const z=r()*length, gap=i<10 ? 4.8+r()*5 : 11+r()*38;
      const x=roadX(start+z)+side*(road+gap);
      if(!contains(z) || !visible('tree',x,start+z)) continue;
      tree(m,x,z,3+r()*6,(r()<.62?0:1+Math.floor(r()*2)),r);
    }
    for(let i=0;i<36;i++) {
      const z=r()*length, side=r()<.5?1:-1, x=roadX(start+z)+side*(road+.96+r()*27);
      const size=.3+r()*1.6;
      if(!contains(z)) continue;
      m.ellipse(x,-.026,z,size*1.5,size*.8,i%3===0?'#bdbe76':'#a5b466',6);
    }
    for (let i=0;i<31;i++) {
      const z=r()*length, side=r()<.5?1:-1, x=roadX(start+z)+side*(road+1.2+r()*4);
      if(!contains(z)) continue;
      if(i%4===0) {
        m.rings(x,0,z,[[.49,0,.4],[.51,.28,.38],[.23,.48,.24]],6,'#a1afa0',i);
      } else {
        const col=i%5===0?'#ffe5a0':'#8b9e53';
        for(let j=0;j<3;j++) m.tri([x-.12+j*.12,0,z],[x+j*.12,0,z+.06],[x-.08+j*.16,.16+r()*.18,z+.04],col);
      }
    }
    const fenceSide=index%4<2 ? -1:1;
    for(let i=0;i<6;i++) {
      const z=6+i*4, x=roadX(start+z)+fenceSide*(road+2.2);
      if(!contains(z) || !visible('post',x,start+z)) continue;
      const nextX=roadX(start+z+4)+fenceSide*(road+2.2);
      m.box(x,0,z,.19,1.12,.2,'#b88c61');
      if(i<5) for(const y of [.43,.84]) m.quad([x,y,z],[x,y+.14,z],[nextX,y+.14,z+4],[nextX,y,z+4],'#cfab77');
    }
    for (const z of [4,28,52]) for(const side of [-1,1]) {
      const x=roadX(start+z)+side*(road+.99);
      if(!contains(z) || !visible('post',x,start+z)) continue;
      m.box(x,0,z,.14,.84,.14,'#fff2d7');
      m.box(x,.56,z-.08,.13,.17,.035,'#da7352');
    }
    if((index%3+3)%3===1 && contains(40)) {
      house(m,roadX(start+40)-22,40,'#d4825f');
    } else if ((index%3+3)%3===0 && contains(42) && visible('stop',roadX(start+42)+road+3,start+42)) {
      const z=42, x=roadX(start+z)+road+3;
      m.box(x,0,z,.18,2.75,.16,'#799090');
      m.box(x,1.86,z,.92,1,.15,'#305e7a');
      m.box(x,2.08,z-.084,.53,.53,.025,'#fff3ce');
      m.box(x,2.27,z-.103,.4,.17,.02,'#4a8d9c');
      m.box(x+.1,0,z+2.6,1.9,.16,.51,'#b77e53');
      m.box(x+.1,.17,z+2.82,1.9,.43,.11,'#cb9770');
    }
  }

  // The software renderer uses fewer trees and positions them in fixed 8 m rows.
  function hillsideCanvasTrees({start,length,road,roadX,random,heightAt,contains,visible}) {
    const actors=[];
    for(let z=start;z<start+length;z+=8) {
      if(!contains(z)) continue;
      const r=random(z/8+463);
      for(const side of [-1,1]) {
        const x=roadX(z)+side*(road+3.8+r()*12), size=3.5+r()*4;
        const type=r()<.53?'pine':'broadleaf';
        if(visible(type,x,z)) actors.push({type,x,y:heightAt(x,z),z,size});
      }
    }
    return actors;
  }

  biomes.register('hills',{
    name:'Collines',grass:'#afba6d',verge:'#a4af62',height:meadowRise,details:hillsideDetails,
    canvasRoadside:hillsideCanvasTrees,
    populate({index,random,add}) {
      const side=index%2 ? -1 : 1;
      for(let i=0;i<3;i++) add('sheep',14+i*4+random()*3,side*(11+random()*5),
        {yaw:random()*TAU,size:.9+random()*.21,variant:i,motion:graze});
    }
  });
})();
