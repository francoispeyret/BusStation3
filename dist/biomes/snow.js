(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const needles=['#466a69','#527573','#395f63'];
  biomes.model('snowSpruce',(m,variant)=>{
    m.box(0,0,0,.33,2.9,.33,'#755f53');
    // Each bough has a dark overhang and a small, offset drift on its top.
    for(const [base,radius,rise] of [[1.05,1.66,2.51],[2.37,1.34,2.36],[3.63,.94,2.48]]) {
      const angle=.17+base*.47;
      m.rings(0,base,0,[[radius*.82,0,radius*.85],[radius,.18,radius],[0,rise,0]],7,needles[variant%3],angle);
      m.rings(.015,base+.42,-.025,[[radius*.89,0,radius*.86],[radius*.91,.10,radius*.88],[0,rise-.29,0]],7,'#eef5f1',angle);
    }
  });
  biomes.model('snowChalet',(m,variant)=>{
    const wood=['#905b44','#aa7054','#776458'][variant%3], roof='#637780';
    m.box(0,0,0,5.2,.40,4.8,'#9ca7a6');
    m.box(0,.39,0,5.1,2.72,4.7,wood);
    for(const z of [-2.35,2.35]) m.tri([-2.55,3.09,z],[2.55,3.09,z],[0,5.13,z],wood);
    for(const side of [-1,1]) {
      const eave=side*2.98;
      m.quad([eave,2.97,-2.75],[0,5.19,-2.75],[0,5.19,2.75],[eave,2.97,2.75],roof);
      m.quad([eave,3.15,-2.75],[0,5.37,-2.75],[0,5.37,2.75],[eave,3.15,2.75],'#edf4f2');
      m.quad([eave,2.97,-2.75],[eave,3.15,-2.75],[eave,3.15,2.75],[eave,2.97,2.75],'#b7ccd1');
      m.quad([eave,2.97,-2.75],[0,5.19,-2.75],[0,5.37,-2.75],[eave,3.15,-2.75],'#d4e3e5');
    }
    m.box(1.14,4.01,1.19,.56,1.53,.58,'#9e7b65');
    m.box(1.14,5.53,1.19,.66,.14,.69,'#e5efee');
    m.box(0,.42,-2.38,.89,1.9,.10,'#515954');
    for(const x of [-1.57,1.57]) {
      m.box(x,1.15,-2.40,1.14,1.16,.11,'#525953');
      const start=m.data.length;
      m.box(x,1.23,-2.45,.96,.98,.07,'#f4ca86');
      for(let i=start+3;i<m.data.length;i+=6) m.data[i]+=6;
      m.box(x,1.21,-2.50,.08,1.02,.04,'#856e59');
      m.box(x,1.64,-2.50,.98,.08,.04,'#856e59');
    }
  });
  biomes.model('snowHare',(m,variant)=>{
    const coat=variant%2?'#d5d9d0':'#e5e4d6';
    for(const x of [-.17,.17]) {
      m.box(x,.01,-.23,.20,.15,.49,'#b7bdb6');
      m.box(x,.015,.34,.115,.14,.24,coat);
    }
    m.rings(0,.12,-.08,[[.17,0,.25],[.32,.18,.45],[.28,.40,.37],[.13,.50,.19]],7,coat,.22);
    m.rings(0,.38,.26,[[.16,0,.16],[.19,.16,.22],[.125,.30,.13]],6,coat);
    for(const side of [-1,1]) {
      m.rings(side*.085,.61,.21,[[.042,0,.045],[.071,.21,.085,side*.026],[.043,.39,.050,side*.055]],5,coat);
      m.rings(side*.085+side*.055,1.0,.21,[[.043,0,.050],[.015,.075,.016]],5,'#676c68');
      m.box(side*.161,.55,.37,.026,.040,.04,'#4c5657');
    }
    m.box(0,.43,.47,.085,.06,.05,'#89746c');
    m.rings(0,.27,-.50,[[.09,0,.09],[.12,.1,.12],[.04,.17,.05]],5,'#f3f1e2');
  });

  biomes.model('skier',(m,variant)=>{
    const jacket=['#b74946','#397f87','#d79e49'][variant%3], gear='#334e60';
    for(const side of [-1,1]) {
      const x=side*.17;
      m.box(x,.03,.06,.12,.045,1.63,'#427b80');
      m.quad([x-.06,.075,.86],[x+.06,.075,.86],[x+.04,.16,1.03],[x-.04,.16,1.03],'#427b80');
      m.box(x,.075,.03,.18,.16,.32,gear);
      m.rings(x,.19,.03,[[.079,0,.094],[.089,.34,.10,0,.09],[.105,.57,.11,0,-.02]],4,gear,.78);
      m.rings(side*.21,1.03,.25,[[.06,0,.064],[.074,.17,.081,0,-.12],[.093,.27,.09,0,-.25]],5,jacket);
      m.box(side*.25,1.00,.28,.12,.12,.13,'#384e54');
      const pole=side*.28;
      m.quad([pole-.02,1.22,.37],[pole+.02,1.22,.37],[pole+.02,.02,-.47],[pole-.02,.02,-.47],'#61696a');
      m.quad([pole,1.22,.35],[pole,1.22,.39],[pole,.02,-.45],[pole,.02,-.49],'#576366');
      m.box(pole,.10,-.4,.13,.025,.13,gear);
    }
    m.rings(0,.73,0,[[.17,0,.14],[.245,.43,.17,0,.10],[.185,.61,.14,0,.18]],6,jacket,.5);
    m.box(0,1.32,.19,.23,.25,.24,'#c48e6b');
    m.rings(0,1.45,.16,[[.145,0,.135],[.165,.08,.15],[.095,.17,.09]],7,gear);
    m.box(0,1.42,.31,.23,.079,.046,'#92c4c9');
  });

  biomes.model('snowPole',m=>{
    m.box(0,0,0,.075,1.25,.075,'#d98758');
    m.box(0,.70,0,.084,.25,.084,'#fff2d7');
    m.box(0,1.16,0,.10,.14,.10,'#af533c');
  });
  const glide=(time,phase)=>{
    const track=time*.34+phase;
    return {z:3.8*Math.sin(track),y:.026*Math.abs(Math.sin(time*2.1+phase)),yaw:Math.PI*.5*(1-Math.tanh(6*Math.cos(track))),pitch:.038*Math.sin(time*2.1+phase)};
  };
  const hop=(time,phase)=>{
    const t=time*.73+phase, step=Math.sin(t*3), lift=Math.max(0,step);
    return {z:1.1*Math.sin(t),y:lift*lift*.27,yaw:Math.PI*.5*(1-Math.tanh(5*Math.cos(t))),pitch:lift*.09};
  };
  biomes.register('snow',{
    name:'Neige',grass:'#e0edec',verge:'#f1f1e7',roadColor:'#66737c',shoulder:1.16,
    height(offset,z){
      const t=Math.min(1,Math.max(0,(Math.abs(offset)-7)/23));
      return t*t*(3-2*t)*(2.85+1.45*Math.sin(z*.039+offset*.067)+.46*Math.cos(z*.083));
    },
    populate({index,length,road,random,add}) {
      for(const side of [-1,1]) {
        for(let i=0;i<4;i++) {
          const along=(i+.25+random()*.55)*length/4;
          add('snowSpruce',along,side*(road+6.0+random()*19),{size:.90+random()*.74,variant:Math.floor(random()*3),yaw:random()*1.5});
        }
        for(let i=0;i<2;i++) add('snowPole',i*length/2+7,side*(road+1.49));
      }
      const side=index%2===0?1:-1;
      if(index%3===0) add('snowChalet',length*.65,side*(road+13),{variant:Math.floor(random()*3),yaw:side*.30});
      if(index%2===0) {
        add('skier',length*.28,-side*(road+3.85),{variant:Math.floor(random()*3),motion:glide});
      } else {
        const along=length*.52;
        add('snowHare',along,side*(road+3.8),{size:1.18,motion:hop});
        add('snowHare',along+1.7,side*(road+5.1),{variant:1,size:.92,motion:hop});
      }
    }
  });
})();
