/* Arcade sky, day/night palettes and graphics presets shared by both driving worlds. */
(() => {
  'use strict';

  const graphicsLevels = {
    low:     {shadowWidth:512,  lighting:0,   shadowLayers:.5},
    medium:  {shadowWidth:768,  lighting:0,   shadowLayers:1},
    high:    {shadowWidth:1024, lighting:.55, shadowLayers:1.5},
    extreme: {shadowWidth:1536, lighting:1,   shadowLayers:2}
  };

  // Start and end angles are in degrees. The fourth lap is lit by the moon.
  const lapSkies=[
    {elevation:[12.5,16.5],azimuth:[6,13],horizon:[1,.72,.49],zenith:[.53,.64,.82],
      tint:[1.03,.91,.79],fog:[.91,.72,.59],shadow:.97,night:0},
    {elevation:[49,55],azimuth:[30,-22],horizon:[.83,.91,.95],zenith:[.31,.63,.89],
      tint:[1,1,1],fog:[.82,.86,.85],shadow:1,night:0},
    {elevation:[17,12],azimuth:[-13,-9],horizon:[1,.55,.31],zenith:[.46,.36,.61],
      tint:[1.04,.73,.63],fog:[.82,.54,.51],shadow:.93,night:0},
    {elevation:[14,16.5],azimuth:[-5,6],horizon:[.20,.26,.41],zenith:[.045,.065,.16],
      tint:[.23,.31,.55],fog:[.18,.24,.37],shadow:.35,night:1}
  ];
  function lightDirection(elevation,azimuth) {
    elevation*=Math.PI/180;azimuth*=Math.PI/180;
    const horizontal=Math.cos(elevation);
    return {x:horizontal*Math.sin(azimuth),y:Math.sin(elevation),z:horizontal*Math.cos(azimuth)};
  }

  function lighting(period, progress, fade) {
    const p=Math.min(1,Math.max(0,progress));
    const current=lapSkies[period%lapSkies.length], next=lapSkies[(period+1)%lapSkies.length];
    const end=Math.min(1,Math.max(0,(p-(1-fade))/fade)), blend=end*end*(3-2*end);
    const mix=(a,b,t=blend)=>a+(b-a)*t;
    const palette=key=>blend ? current[key].map((value,i)=>mix(value,next[key][i])) : current[key];
    const elevation=mix(current.elevation[0],current.elevation[1],p);
    const azimuth=mix(current.azimuth[0],current.azimuth[1],p);
    const direction=lightDirection(mix(elevation,next.elevation[0]),mix(azimuth,next.azimuth[0]));
    let sun=direction, moon=direction;
    if(current.night!==next.night && blend>0) {
      const departing=lightDirection(elevation,azimuth);
      const arriving=lightDirection(next.elevation[0],next.azimuth[0]);
      sun=current.night ? arriving : departing;
      moon=current.night ? departing : arriving;
    }
    return {direction,sun,moon,night:mix(current.night,next.night),shadow:mix(current.shadow,next.shadow),
      horizon:palette('horizon'),zenith:palette('zenith'),tint:palette('tint'),fog:palette('fog')};
  }

  function projectDisc(body,cam,backdrop) {
    // Place each disc on the curved backdrop beyond the ridge so low sun
    // and moon sit inside the narrow strip of sky above the mountains.
    const ca=Math.cos(cam.a), sa=Math.sin(cam.a), cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
    const scale=backdrop ? backdrop.distance/Math.hypot(body.x,body.z) : 1;
    const forward=scale*(body.x*sa+body.z*ca);
    const dy=body.y*scale+(backdrop ? backdrop.offset(forward,cam) : 0);
    const depth=forward*cp-dy*sp;
    if(forward<=0 || depth<=0) return null;
    return [cam.f*scale*(body.x*ca-body.z*sa)/(cam.aspect*depth),cam.f*(dy*cp+forward*sp)/depth];
  }

  function backdrop() {
    const {Mesh,random,turn:TAU}=window.BusMesh;
    const m=new Mesh(),r=random(83);
    // Broken snow lines and broad shaded ridges give the road an alpine skyline.
    for(let i=-9;i<=9;i++) {
      const x=i*44+r()*16, z=247+r()*12, h=31+r()*39;
      const n=8, base=[], ridge=[], snow=[], peak=[x+6*r()-3,h,z+3];
      for(let j=0;j<n;j++) {
        const u=TAU*j/n, rx=38+r()*13, rz=17+r()*9;
        base.push([x+rx*Math.cos(u),-4,z+rz*Math.sin(u)]);
        ridge.push([x+rx*.54*Math.cos(u),h*(.37+r()*.08),z+rz*.52*Math.sin(u)]);
        snow.push([x+rx*.24*Math.cos(u),h*(.65+r()*.15),z+rz*.25*Math.sin(u)]);
      }
      for(let j=0;j<n;j++) {
        const k=(j+1)%n,shade=.80+.20*Math.max(0,Math.cos(TAU*(j+.5)/n));
        m.quad(base[j],base[k],ridge[k],ridge[j],'#95869d',shade);
        m.tri(ridge[j],ridge[k],snow[j],'#b39ba6',shade);
        m.tri(ridge[k],snow[k],snow[j],'#a493a2',shade);
        m.tri(snow[j],snow[k],peak,'#ffe3cc',shade);
      }
    }
    for(let i=-12;i<=12;i++) {
      const x=i*25+r()*15, h=9+r()*17;
      m.rings(x,-4,188+r()*17,[[34,0,19],[27,h*.41,14],[17,h*.74,7],[4,h,3]],8,'#8e977a',r());
    }
    for(const [x,y,z,s,k] of [[-68,35,148,1.30,.9],[44,37,151,1.02,.59],[105,44,164,1.36,.8],[-139,55,168,1.55,.72],[3,51,176,.77,.7]]) {
      for(const [dx,dy,w,h] of [[-10,0,8,2.6],[-3,1,9,4.6],[4,2.5,8,6],[11,0,8,3]]) {
        m.rings(x+dx*s,y+dy*s*k,z,[[w*s*.8,0,3*s],[w*s,h*s*.45*k,3.6*s],[.6*w*s,h*s*k,2*s]],9,'#ffdfb3');
      }
    }
    return m;
  }

  const skyVertex=`varying mediump vec2 screenPoint;
    void main(){screenPoint=position.xy;gl_Position=vec4(position.xy,1.,1.);}`;
  const skyFragment=`precision mediump float;
    varying mediump vec2 screenPoint;
    uniform vec4 discs;
    uniform vec3 horizonColor, zenithColor;
    uniform float aspect, horizonY, night;
    void main(){
      vec3 col=mix(horizonColor,zenithColor,smoothstep(-.08,.46,screenPoint.y-horizonY));
      vec2 scale=vec2(aspect,1.);
      float r=length((screenPoint-discs.xy)*scale);
      col=mix(col,vec3(1.,.76,.45),.46*(1.-night)*(1.-smoothstep(.048,.36,r)));
      col=mix(col,vec3(1.,.93,.72),(1.-night)*(1.-smoothstep(.048,.052,r)));
      vec2 moon=(screenPoint-discs.zw)*scale;
      float m=length(moon);
      col=mix(col,vec3(.57,.69,.91),.24*night*(1.-smoothstep(.045,.24,m)));
      float maria=1.-smoothstep(.007,.014,length(moon-vec2(-.014,.012)));
      maria+=1.-smoothstep(.005,.011,length(moon-vec2(.009,-.019)));
      vec3 moonColor=vec3(.89,.92,1.)-maria*vec3(.11,.10,.07);
      col=mix(col,moonColor,night*(1.-smoothstep(.045,.048,m)));
      gl_FragColor=vec4(col,1.);
    }`;

  function createSky(THREE,scene,backdrop) {
    const uniforms={
      discs:{value:new THREE.Vector4()}, aspect:{value:1}, horizonY:{value:0}, night:{value:0},
      horizonColor:{value:new THREE.Vector3()}, zenithColor:{value:new THREE.Vector3()}
    };
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    const material=new THREE.ShaderMaterial({
      vertexShader:skyVertex,fragmentShader:skyFragment,uniforms,depthTest:false,depthWrite:false
    });
    const sky=new THREE.Mesh(geometry,material);
    sky.frustumCulled=false;
    sky.renderOrder=-1000;
    scene.add(sky);
    return {
      update(cam,light) {
        const sun=light.night<1 && projectDisc(light.sun,cam,backdrop);
        const moon=light.night>0 && projectDisc(light.moon,cam,backdrop);
        uniforms.discs.value.set(sun?sun[0]:0,sun?sun[1]:-10,moon?moon[0]:0,moon?moon[1]:-10);
        uniforms.aspect.value=cam.aspect;
        uniforms.horizonY.value=cam.f*Math.tan(cam.pitch);
        uniforms.night.value=light.night;
        uniforms.horizonColor.value.fromArray(light.horizon);
        uniforms.zenithColor.value.fromArray(light.zenith);
      },
      dispose() { scene.remove(sky); geometry.dispose(); material.dispose(); }
    };
  }

  window.BusSky={graphicsLevels,lighting,createSky,projectDisc,backdrop};
})();
