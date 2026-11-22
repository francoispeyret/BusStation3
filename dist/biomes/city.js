(() => {
  'use strict';
  const biomes=window.BusBiomes;
  const {beam,mod}=window.BusMesh;

  const glass=['#6898a3','#7799a1','#598897'], stone=['#c8b59c','#bf8c71','#9aa8a5'];
  function windows(m,halfX,halfZ,base,stories,variant) {
    const facade=(u,h,axis,sign)=> axis==='x' ? [sign*(halfX+.04),h,u] : [u,h,sign*(halfZ+.04)];
    for(const axis of ['x','z']) for(const sign of [-1,1]) {
      const half=axis==='x'?halfZ:halfX;
      if(m.layers) m.layers.push({offset:m.data.length,layer:1,side:axis==='x'?sign:0,end:axis==='z'?sign:0});
      for(let floor=0;floor<stories;floor++) {
        const y=base+floor*2.35, sill=y+.95;
        for(let bay=0;bay<3;bay++) {
          const left=-half+.48+bay*(2*half-.48)/3, right=left+(2*half-.48)/3-.48;
          const warm=(floor*5+bay+variant+(sign<0?1:0))%6===0, start=m.data.length;
          m.quad(facade(left,y,axis,sign),facade(right,y,axis,sign),facade(right,sill,axis,sign),facade(left,sill,axis,sign),warm?'#f0ca88':glass[(floor+bay+variant)%3]);
          if(warm) for(let i=start+3;i<m.data.length;i+=6) m.data[i]+=6;
        }
      }
    }
    if(m.layers) m.layers.push({offset:m.data.length,layer:0,side:0,end:0});
  }
  biomes.model('cityTower',(m,variant)=>{
    const style=variant%3, halfX=[4.3,4.7,4.5][style], halfZ=[5,4.4,6][style];
    const stories=[8,7,5][style], top=stories*2.35+3;
    m.box(0,0,0,2*halfX,top,2*halfZ,['#536d78','#a77f68','#73848a'][style]);
    m.box(0,2.83,0,2*halfX+.5,.39,2*halfZ+.5,stone[style]);
    m.box(0,top,0,2*halfX+.28,.4,2*halfZ+.28,stone[style]);
    if(style===0) {
      m.box(0,top+.35,0,6.5,2.15,6.5,'#5c7882');
      m.box(.9,top+2.46,.5,.15,3.3,.15,'#657679');
    } else if(style===1) {
      m.box(0,top+.35,0,6.9,2.3,6.5,'#b39779');
      m.box(0,top+2.6,0,4.4,1.25,4.2,'#ba9d7e');
      m.rings(0,top+3.8,0,[[1.85,0,1.75],[.32,2.25,.34]],4,'#597e79',Math.PI/4);
    } else {
      m.box(1,top+.4,-1.6,3.2,1.2,3,'#839493');
      m.rings(-2.1,top+.35,2.1,[[1.02,0,1.02],[.98,1.75,.98],[.34,2.1,.34]],7,'#b49170');
    }
    windows(m,halfX,halfZ,3.65,stories,style);
    for(const side of [-1,1]) {
      m.box(side*(halfX+.07),.15,0,.12,2.23,4.8,'#385a63');
      m.box(side*(halfX+.55),2.51,0,1.25,.19,5.45,['#b97d54','#4c7779','#ad755b'][style]);
    }
  });

  biomes.model('cityLamp',m=>{
    m.box(0,0,0,.36,.26,.36,'#627174');
    m.box(0,.24,0,.16,4.36,.16,'#52656a');
    beam(m,[0,4.16,0],[-.9,4.70,0],.065,.055,'#52656a');
    m.box(-1.05,4.58,0,.58,.16,.28,'#425960');
    const first=m.data.length;
    m.box(-1.05,4.52,0,.48,.09,.23,'#ffe9b1');
    for(let i=first+3;i<m.data.length;i+=6) m.data[i]+=6;
  });
  biomes.model('cityBench',m=>{
    for(const z of [-.71,.71]) m.box(0,0,z,.44,.47,.12,'#556668');
    m.box(0,.45,0,.63,.12,1.98,'#ba8d61');
    m.box(.24,.67,0,.10,.27,1.98,'#b6875d');
  });
  biomes.model('metroEntrance',m=>{
    m.box(0,0,0,1.4,.14,2.85,'#778a89');
    for(const x of [-.67,.67]) {
      for(const z of [-1.21,1.21]) m.box(x,.12,z,.10,.96,.10,'#577b74');
      m.box(x,1.02,0,.11,.11,2.53,'#60887b');
    }
    for(const x of [-.67,.67]) m.box(x,.13,.94,.105,2.53,.105,'#56766e');
    m.box(0,2.34,.94,1.75,.54,.16,'#448073');
    // A station symbol on both sides of the raised entrance sign.
    for(const z of [.84,1.04]) {
      for(const x of [-.34,.34]) m.box(x,2.44,z,.08,.32,.035,'#ffedcb');
      beam(m,[-.30,2.73,z],[0,2.49,z],.044,.044,'#ffedcb');
      beam(m,[0,2.49,z],[.30,2.73,z],.044,.044,'#ffedcb');
    }
  });
  const crosswalk=[];
  for(let i=0;i<10;i++) {const left=-4.94+i*1.03;crosswalk.push({left,right:left+.62,y:.026,length:3.45,color:'#eee9d8'});}
  const walk=(time,phase)=>{
    const travel=.48*time+phase;
    return {z:2.15*Math.sin(travel),y:.025*Math.abs(Math.sin(5.6*time+phase)),yaw:Math.PI*.5*(1-Math.tanh(5*Math.cos(travel)))};
  };
  biomes.register('city',{
    name:'Grande ville',grass:'#9a9fa0',verge:'#c5c4b9',roadColor:'#50545e',shoulder:biomes.LANE_WIDTH+3.25,curb:true,skyline:false,
    height:()=>0,
    roadPaint(z){return mod(Math.floor(z),72)===28 ? crosswalk : [];},
    populate({index,length,road,random,add}) {
      for(const side of [-1,1]) {
        const yaw=side<0?Math.PI:0;
        for(let i=0;i<2;i++) {
          const z=(.19+i*.5)*length+random()*4;
          add('cityTower',z,side*(road+9.8+random()*1.6),{variant:Math.floor(random()*3),size:.94+random()*.14});
        }
        add('cityTower',(.36+random()*.28)*length,side*(road+23+random()*5),{variant:Math.floor(random()*3),size:1.08+random()*.18});
        add('cityLamp',side<0?25:51,side*(road+.95),{yaw});
        add('walker',side<0?29:45,side*(road+1.7),{variant:Math.floor(random()*3),motion:walk});
      }
      const side=index%2===0?1:-1;
      add('cityBench',14,side*(road+2.45),{yaw:side<0?Math.PI:0});
      add('metroEntrance',49,-side*(road+2.16));
    }
  });
})();
