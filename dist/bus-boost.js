/* The arcade lightning pickup, in the same +Z-forward frame as the bus models. */
(() => {
  'use strict';

  const outline=[[-.10,1.73],[-.56,.91],[-.12,.91],[-.31,.38],[.58,1.28],[.13,1.28],[.38,1.73]];
  const streaks=[];
  for(const side of [-1,1]) for(const [x,length] of [[.94,1.5],[1.09,.88]]) {
    streaks.push([[side*(x-.038),0],[side*(x+.038),0],[side*x,-length]]);
  }

  function model() {
    const mesh=new window.BusMesh.Mesh();
    // Two convex faces share the lightning bolt's central diagonal.
    for(const face of [[0,1,2,5,6],[2,3,4,5]]) {
      for(let i=1;i<face.length-1;i++) for(const z of [-.14,.14]) {
        const point=index=>[...outline[index],z];
        mesh.tri(point(face[0]),point(face[i]),point(face[i+1]),'#ffdb50');
      }
    }
    outline.forEach(([x,y],i)=>{
      const [u,v]=outline[(i+1)%outline.length];
      mesh.quad([x,y,-.14],[u,v,-.14],[u,v,.14],[x,y,.14],'#e99932');
    });
    return mesh;
  }

  function trail() {
    const mesh=new window.BusMesh.Mesh();
    for(const triangle of streaks) mesh.tri(...triangle.map(([x,z])=>[x,0,z]),'#ffcc66');
    return mesh;
  }

  function trailPosition(tailZ,time) {
    return tailZ+.36+.16*Math.sin(time*16);
  }

  function hover(time,phase) {
    return {turn:.29*Math.sin(time*2.5+phase*.17), lift:.12*Math.sin(time*3+phase*.06)};
  }

  function halo(progress) {
    const spread=1-(1-progress)**2;
    const smooth=value=>{
      const t=Math.max(0,Math.min(1,value));
      return t*t*(3-2*t);
    };
    const light=(1-smooth((progress-.24)/.76))*(.40+.60*smooth(progress/.12));
    return {width:1.47+1.13*spread,length:2.88+1.23*spread,light};
  }

  window.BusBoost={duration:4.2,speedBonus:39,acceleration:36,deceleration:62,haloDuration:.5,
    outline,streaks,model,trail,trailPosition,hover,halo};
})();
