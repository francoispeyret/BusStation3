/* Three.js VSM lights and the vertex-colour material for the curved course. */
(() => {
  'use strict';

  const vertexShader = `
    #ifndef BACKDROP
      #include <shadowmap_pars_vertex>
    #endif
    uniform vec2 viewForward;
    uniform vec2 curvature;
    uniform mat4 worldToCoach;
    varying vec3 paint;
    varying float marker;
    varying vec3 coachPoint;
    varying float haze;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.);
      #if !defined(BACKDROP) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vDirectionalShadowCoord[0] = directionalShadowMatrix[0] * world;
      #endif
      #if !defined(BACKDROP) && NUM_SPOT_LIGHT_COORDS == 2
        vSpotLightCoord[0] = spotLightMatrix[0] * world;
        vSpotLightCoord[1] = spotLightMatrix[1] * world;
      #endif

      coachPoint = (worldToCoach * world).xyz;
      marker = floor((color.r + .1) / 2.);
      paint = color - vec3(marker * 2., 0., 0.);

      // Shadow maps describe the actual course. Bend only its camera projection.
      float forward = dot(world.xz - cameraPosition.xz, viewForward);
      float beyond = max(0., forward - curvature.x);
      world.y -= curvature.y * beyond * beyond;
      gl_Position = projectionMatrix * viewMatrix * world;
      haze = .48 * smoothstep(55., 255., forward);
    }`;

  const fragmentShader = `
    #include <common>
    #include <packing>
    #ifndef BACKDROP
      #include <shadowmap_pars_fragment>
    #endif
    uniform vec3 ambientTint;
    uniform vec3 fogTint;
    uniform vec3 headlamp;
    uniform vec3 taillamp;
    uniform vec3 rocketLight;
    uniform float headlampPower;
    uniform float daylight;
    uniform float detail;
    uniform float opacity;
    varying vec3 paint;
    varying float marker;
    varying vec3 coachPoint;
    varying float haze;

    #ifndef BACKDROP
    float sunlight() {
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow sun = directionalLightShadows[0];
        float visibility = getShadow(directionalShadowMap[0], sun.shadowMapSize, sun.shadowIntensity,
          sun.shadowBias, sun.shadowRadius, vDirectionalShadowCoord[0]);
        // Fade the last filter footprint near the edge of the moving shadow camera.
        vec2 uv = abs(vDirectionalShadowCoord[0].xy / vDirectionalShadowCoord[0].w - .5);
        return mix(visibility, 1., smoothstep(.41, .49, max(uv.x, uv.y)));
      #else
        return 1.;
      #endif
    }

    float headlightBeam(vec3 p) {
      if (p.z <= 0. || p.z >= 56.) return 0.;
      float width = .26 + .18 * p.z;
      float axis = headlamp.x + .055 * p.z;
      vec2 across = (p.x + vec2(axis, -axis)) / width;
      float vertical = (p.y + .070 * p.z) / (.20 + .18 * p.z);
      vec2 beam = 1. - smoothstep(vec2(.04), vec2(1.35), across * across + vertical * vertical);
      #if defined(USE_SHADOWMAP) && NUM_SPOT_LIGHT_SHADOWS == 2
        SpotLightShadow left = spotLightShadows[0];
        SpotLightShadow right = spotLightShadows[1];
        beam.x *= getShadow(spotShadowMap[0], left.shadowMapSize, left.shadowIntensity,
          left.shadowBias, left.shadowRadius, vSpotLightCoord[0]);
        beam.y *= getShadow(spotShadowMap[1], right.shadowMapSize, right.shadowIntensity,
          right.shadowBias, right.shadowRadius, vSpotLightCoord[1]);
      #endif
      float cutoff = 1. - smoothstep(.04 + .012 * p.z, .45 + .055 * p.z, p.y);
      return (beam.x + beam.y - beam.x * beam.y) * cutoff * (1. - smoothstep(16., 56., p.z));
    }

    #endif

    void main() {
      vec3 lit = paint * ambientTint;
      #ifndef BACKDROP
        float visibility = sunlight();
        float shade = 1. - visibility * visibility;
        lit *= mix(vec3(1.), vec3(.50, .56, .65), shade);
        lit += detail * daylight * paint * mix(vec3(.105,.065,.025), vec3(.008,.022,.068), shade);
        if (headlampPower > 0.) {
          vec3 front = coachPoint - vec3(0., headlamp.yz);
          float beam = headlightBeam(front);
          lit += headlampPower * beam * (paint * vec3(.93,.78,.50) + vec3(.065,.045,.012));
          vec3 lens = vec3(abs(front.x) - headlamp.x, front.y, 2. * front.z);
          lit += headlampPower * (1. - smoothstep(.09,.36,length(lens))) * vec3(.34,.22,.08);
          vec3 tail = vec3(abs(coachPoint.x), coachPoint.yz) - taillamp;
          lit += headlampPower * (1. - smoothstep(.045,.22,length(tail * vec3(1.,1.,2.)))) * vec3(.27,.018,.009);
          if (marker > .5 && marker < 3.5) {
            vec3 glow = marker > 1.5 && marker < 2.5 ? vec3(1.42,.46,.30) : vec3(1.16,1.09,1.03);
            lit = mix(lit, min(vec3(1.), paint * glow), headlampPower * (marker > 2.5 ? .5 : 1.));
          }
          vec3 rear = tail / vec3(1.25,2.5,3.5);
          float spill = max(0., 1. - dot(rear,rear));
          lit += detail * headlampPower * (spill * spill * vec3(.36,.025,.011) + beam * vec3(.105,.092,.065));
        }
        if (rocketLight.z > 0.) {
          vec3 delta = (coachPoint - vec3(0., rocketLight.xy)) / vec3(2.8,10.,3.8);
          float spill = max(0., 1. - dot(delta,delta));
          lit += rocketLight.z * spill * spill * (.53 + .45 * paint) * vec3(1.,.37,.055);
        }
        if (marker > 3.5) lit = paint;
      #endif
      gl_FragColor = vec4(mix(lit, fogTint, haze), opacity);
    }`;

  function create(THREE, scene, renderer, {BEND_START, BEND_RATE}) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;

    function addLight(light, name, bias) {
      light.name = name;
      light.castShadow = true;
      light.shadow.radius = 25;
      light.shadow.blurSamples = 25;
      light.shadow.bias = bias;
      scene.add(light, light.target);
      return light;
    }

    const sun = addLight(new THREE.DirectionalLight(), 'Soleil / lune', -.0012);
    const shadowCam = sun.shadow.camera;
    shadowCam.near = .5;
    shadowCam.far = 300;
    const headlights = ['Phare gauche', 'Phare droit'].map(name => {
      const light = addLight(new THREE.SpotLight(0xffe3a8, 1, 58, .42, .9), name, -.00065);
      light.shadow.camera.near = .55;
      return light;
    });

    const common = {
      viewForward: {value:new THREE.Vector2()},
      worldToCoach: {value:new THREE.Matrix4()},
      ambientTint: {value:new THREE.Vector3()},
      fogTint: {value:new THREE.Vector3()},
      headlamp: {value:new THREE.Vector3()},
      taillamp: {value:new THREE.Vector3()},
      rocketLight: {value:new THREE.Vector3()},
      headlampPower: {value:0}, daylight: {value:1}, detail: {value:0}
    };

    function createMaterial({transparent = false, backdrop = false} = {}) {
      const material = new THREE.ShaderMaterial({
        name: backdrop ? 'Fond du paysage' : 'Peinture et feux',
        vertexShader, fragmentShader,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), ...common,
          curvature:{value:new THREE.Vector2(BEND_START, BEND_RATE * (backdrop ? .64 : 1))},
          opacity:{get value() { return material.opacity; }}
        },
        defines:backdrop ? {BACKDROP:1} : {}, lights:!backdrop, vertexColors:true,
        side:THREE.DoubleSide, transparent, depthTest:!backdrop, depthWrite:!transparent && !backdrop
      });
      material.forceSinglePass = true;
      return material;
    }
    const material = createMaterial(), backdropMaterial = createMaterial({backdrop:true});

    const coachMatrix = new THREE.Matrix4();
    const rotation = new THREE.Euler(0,0,0,'YZX');
    const reflectZ = new THREE.Matrix4().makeScale(1,1,-1);

    function aimHeadlamp(point, x, y, z) {
      point.set(x,y,z).applyMatrix4(coachMatrix);
      point.z *= -1;
    }

    function setMapSize(shadow, width, height = width) {
      width = Math.min(width, renderer.capabilities.maxTextureSize);
      height = Math.min(height, renderer.capabilities.maxTextureSize);
      if (shadow.mapSize.x === width && shadow.mapSize.y === height) return;
      shadow.mapSize.set(width,height);
      shadow.map?.setSize(width,height);
      shadow.mapPass?.setSize(width,height);
    }

    function update({light, cam, bus, pose, rocket, busOpacity, level}) {
      const {direction} = light;
      const forward = common.viewForward.value.set(Math.sin(cam.a), -Math.cos(cam.a));
      sun.target.position.set(pose.x + 9*forward.x, 2, 9*forward.y);
      sun.position.set(direction.x, direction.y, -direction.z).multiplyScalar(145).add(sun.target.position);
      sun.shadow.intensity = light.shadow;
      // Fit the near road footprint as the angle of the sun changes between laps.
      // Keep a street-scale penumbra when a detail preset changes the texel size.
      // Larger maps cover more of the surrounding landscape at the same softness.
      const width = Math.min(33, level.shadowWidth * .025);
      const height = width * (.26 + direction.y * .95) * 4/3;
      shadowCam.left = -width;
      shadowCam.right = width;
      shadowCam.top = height;
      shadowCam.bottom = -height;
      shadowCam.updateProjectionMatrix();
      setMapSize(sun.shadow, level.shadowWidth, Math.round(level.shadowWidth * 4/3));

      common.ambientTint.value.fromArray(light.tint);
      common.fogTint.value.fromArray(light.fog);
      common.headlamp.value.fromArray(bus.headlamp);
      common.taillamp.value.fromArray(bus.taillamp);
      common.headlampPower.value = light.night * busOpacity;
      common.daylight.value = 1-light.night;
      common.detail.value = level.lighting;
      common.rocketLight.value.set(rocket?.mountY ?? 0, rocket?.lightZ ?? 0, rocket?.power ?? 0);

      coachMatrix.makeRotationFromEuler(rotation.set(pose.pitch, pose.yaw, pose.roll));
      coachMatrix.setPosition(pose.x, pose.y, 0);
      common.worldToCoach.value.copy(coachMatrix).invert().multiply(reflectZ);
      const [x,y,z] = bus.headlamp;
      for (let i=0; i<headlights.length; i++) {
        const lamp = headlights[i], side = i===0 ? -1 : 1;
        lamp.visible = common.headlampPower.value > .001;
        if (!lamp.visible) continue;
        aimHeadlamp(lamp.position, side*x, y, z+.07);
        aimHeadlamp(lamp.target.position, side*(x+.055*20), y-.07*20, z+20);
        setMapSize(lamp.shadow, Math.min(512, level.shadowWidth/2));
      }
    }

    function dispose() {
      material.dispose();
      backdropMaterial.dispose();
      for (const light of [sun, ...headlights]) {
        scene.remove(light, light.target);
        light.dispose();
      }
    }

    return {update, dispose, material, backdropMaterial, createMaterial};
  }

  window.BusThreeLighting = {create};
})();
