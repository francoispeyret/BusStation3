/* Terrain, trees and grazing motion shared by the alpine biomes. */
(() => {
  'use strict';

  function meadowRise(offset, z) {
    const t = Math.min(1, Math.max(0, (Math.abs(offset)-8.5)/32));
    if (!t) return 0;
    const side = Math.sign(offset);
    const ridge = 4.4 + 1.7*Math.sin(z*.030 + side*1.5)
      + 1.1*Math.cos(z*.018 + offset*.040) + .8*Math.sin(z*.048 - offset*.024);
    return t*t*(3-2*t)*ridge;
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

  function graze(time,phase) {
    return {pitch:.055*Math.sin(.8*time+phase),yaw:.11*Math.sin(.48*time+phase)};
  }

  window.BusCountryside={meadowRise,tree,graze};
})();
