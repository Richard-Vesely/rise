// Post-processing (jen střední a vysoká grafika): scéna se kreslí v HDR do bufferu a pak v jednom průchodu přidá
// mlhu s výškou v barvě oblohy, záři slunce, sluneční paprsky (ze stínové mapy), záři světel (bloom), tónování AgX
// s ochranou odstínů, přizpůsobení oka (noc, jeskyně), barevné ladění (studené stíny, teplá světla, modrá noc) a vinětu.
// Vysoká se samostatnou kartou navíc zastínění koutů (N8AO v polovičním rozlišení), střední vyhlazuje hrany přes FXAA.
// Nízká grafika tohle vůbec nepoužívá (renderer kreslí rovnou).
import { N8AOPostPass } from 'n8ao';
import { BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, FXAAEffect, RenderPass } from 'postprocessing';
import * as THREE from 'three';
import { SHADOW_PARS_GLSL } from './light-glsl.js';
import { FX, LK } from './look.js';
import { FOG, U, camera, renderer, scene } from './renderer.js';

// Stav, který post-processingu nastavuje zbytek hry (den a noc, podzemí, počasí, voda, otevřené menu).
export const post = {
  composer: null, ao: null, bloom: null, scale: 1,
  under: 0,      // jak moc je hráč pod zemí (0–1)
  water: 0,      // kamera pod hladinou (0–1)
  waterLevel: -1e9, // výška té hladiny
  exposure: 1,   // přizpůsobení oka (násobek jasu, render/daylight.js)
  night: 0,      // noc pro barevné ladění (měsíční modř)
  weather: 0,    // déšť / mlha: šedší a hustší vzduch
  menu: false,   // otevřené okno (batoh, počítač…): svět za ním v polovičním rozlišení, bez AO a paprsků
  flash: 0,      // blesk
  mark: 0,       // Markova dimenze: noc se barví do fialova místo do modra
};

// ------------------------------------------------------------ mlha v barvě oblohy, záře slunce v mlze, paprsky
const ATMOS_GLSL = /* glsl */`
  uniform mat4 uInvProj, uCamWorld;
  uniform vec3 uCamPos, uFogColor, uSunDir, uSunCol, uWaterCol;
  uniform float uDensity, uFalloff, uScatter, uSkyHaze, uUnder, uShafts, uNight, uEnvOn, uEnvGain, uSkyFog, uWater, uFlash, uWaterLevel;
  uniform sampler2D uEnv;
  // konstanty pro odlesky oblohy (PMREM 256 px → výška 1024; v textu shaderu, protože postprocessing přejmenovává defines efektů)
  #define ENVMAP_TYPE_CUBE_UV
  ${cubeUVDefines(1024)}
  #include <cube_uv_reflection_fragment>
  ${SHADOW_PARS_GLSL}
  vec3 viewPos(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    bool sky = depth >= 0.999999;
    // vzdálené hory na obzoru (render/clouds.js, 2,6–3,2 km) se zahalí jako obloha, ne jako terén
    if (!sky && length(viewPos(uv, depth)) > 2500.0) sky = true;
    vec3 vp = viewPos(uv, sky ? 0.5 : depth);
    vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
    vec3 rd = normalize(wp - uCamPos);
    float dist = sky ? 3.0 / max(uDensity, 1e-4) : length(wp - uCamPos);
    // pod vodou: krátký modrozelený dohled
    if (uWater > 0.0) {
      // hloubka v bufferu průhlednou hladinu nezná: paprsek vzhůru končí na hladině (ta se kreslí zespodu jako strop)
      if (rd.y > 1e-3) dist = min(dist, (uWaterLevel - uCamPos.y) / rd.y);
      float wf = 1.0 - exp(-dist * 0.22);
      vec3 col = mix(inputColor.rgb * vec3(0.55, 0.85, 0.9), uWaterCol, wf);
      outputColor = vec4(mix(inputColor.rgb, col, uWater), inputColor.a);
      return;
    }
    // hustota mlhy klesá s výškou (údolí a rybníky mají opar, kopce jsou čisté); v jeskyni je mlha všude stejná
    float dy = rd.y * dist * uFalloff;
    float hf = exp(-uFalloff * (uCamPos.y - 1.0)) * (abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0);
    hf = mix(clamp(hf, 0.25, 3.0), 1.0, uUnder);
    float tau = uDensity * dist;
    float fog = 1.0 - exp(-tau * tau * hf);
    if (sky) fog *= uSkyHaze * (1.0 - smoothstep(0.0, 0.35, rd.y));
    // barva mlhy = barva oblohy u obzoru v tom směru (k slunci teplejší, od slunce modřejší), z odlesků oblohy
    vec3 fogCol = uFogColor;
    if (uEnvOn > 0.5) {
      vec3 hd = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.6 + 0.075, rd.z)); // kousek nad obzorem: modřejší než bělavý pruh u země
      vec3 skyCol = textureCubeUV(uEnv, hd, 0.55).rgb * uEnvGain;
      fogCol = mix(fogCol, skyCol, uSkyFog * (1.0 - uUnder));
    }
    // záře slunce v mlze: úzká kolem slunce a široká do strany
    float mu = max(dot(rd, uSunDir), 0.0);
    fogCol += uSunCol * (pow(mu, 12.0) * 0.4 + pow(mu, 3.0) * 0.08) * uScatter * (1.0 - uUnder);
    vec3 col = mix(inputColor.rgb, fogCol, fog);
    #if SHAFTS
    // paprsky: kousky paprsku ke kameře, které nejsou ve stínu, rozptýlí sluneční světlo (16 kroků, rozptyl šumem).
    // Počítá se jen při pohledu zhruba ke slunci; jinde je to neviditelné, tak se šetří.
    float toward = smoothstep(0.35, 0.75, mu);
    if (uShadowP.x > 0.5 && uShafts > 0.0 && toward > 0.0) {
      float L = min(dist, 55.0), lit = 0.0, j = ign(gl_FragCoord.xy);
      for (int i = 0; i < 16; i++) {
        vec3 p = uCamPos + rd * L * ((float(i) + j) / 16.0);
        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        vec2 e = min(sc.xy, 1.0 - sc.xy);
        lit += (e.x < 0.0 || e.y < 0.0) ? 1.0 : shadowTap(sc.xy, sc.z - 0.001);
      }
      lit /= 16.0;
      // paprsky jsou vidět jen tam, kde něco slunce částečně zakrývá: rozdíl proti plně osvětlenému vzduchu
      float g = 0.76, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(rd, uSunDir), 1.5) * 0.03;
      col += uSunCol * lit * (1.0 - lit * 0.55) * ph * uShafts * toward * (1.0 - exp(-L * 0.02)) * (1.0 - uUnder);
    }
    #endif
    col += uFlash * vec3(0.75, 0.82, 1.0) * (0.35 + 0.65 * fog); // blesk ozáří vzduch
    outputColor = vec4(col, inputColor.a);
  }
`;
class AtmosphereEffect extends Effect {
  constructor() {
    const u = (v) => new THREE.Uniform(v);
    super('AtmosphereEffect', ATMOS_GLSL, {
      attributes: EffectAttribute.DEPTH,
      defines: new Map([['SHAFTS', FX.shafts ? '1' : '0']]),
      uniforms: new Map([
        ['uInvProj', u(new THREE.Matrix4())], ['uCamWorld', u(new THREE.Matrix4())], ['uCamPos', u(new THREE.Vector3())],
        ['uFogColor', u(new THREE.Vector3())], ['uSunDir', U.sunDir], ['uSunCol', u(new THREE.Vector3())], ['uWaterCol', u(new THREE.Vector3(0.02, 0.09, 0.1))],
        ['uDensity', u(0)], ['uFalloff', u(LK.fog.falloff)], ['uScatter', u(LK.fog.scatter)], ['uSkyHaze', u(LK.fog.skyHaze)],
        ['uUnder', u(0)], ['uShafts', u(LK.shafts)], ['uNight', U.night], ['uEnv', u(null)], ['uEnvOn', u(0)], ['uEnvGain', u(1)], ['uSkyFog', u(0.85)],
        ['uWater', u(0)], ['uFlash', u(0)], ['uWaterLevel', u(0)],
        ['uShadowMap', U.shadowMap], ['uShadowMatrix', U.shadowMatrix], ['uShadowP', U.shadowP], ['uShadowStrength', U.shadowStrength],
      ]),
    });
  }
  update() {
    const g = (k) => this.uniforms.get(k);
    g('uInvProj').value.copy(camera.projectionMatrixInverse);
    g('uCamWorld').value.copy(camera.matrixWorld);
    g('uCamPos').value.setFromMatrixPosition(camera.matrixWorld);
    const t = LK.fog.tint, c = FOG.color;
    g('uFogColor').value.set(c.r * t[0], c.g * t[1], c.b * t[2]);
    g('uSunCol').value.copy(U.sunColor.value);
    g('uDensity').value = FOG.density * LK.fog.density;
    g('uUnder').value = post.under;
    g('uWater').value = post.water;
    g('uWaterLevel').value = post.waterLevel;
    g('uFlash').value = post.flash;
    // vzhled se dá ladit za běhu (game.LK v konzoli)
    g('uFalloff').value = LK.fog.falloff * (1 - 0.6 * post.weather);
    g('uScatter').value = LK.fog.scatter * (1 - 0.7 * post.weather);
    g('uSkyHaze').value = LK.fog.skyHaze + 0.5 * post.weather;
    g('uShafts').value = post.menu ? 0 : LK.shafts * (1 - post.weather);
    // za deště je vzduch šedý (barva mlhy), za jasna má barvu oblohy
    g('uSkyFog').value = 0.85 * (1 - 0.75 * post.weather);
    g('uEnvGain').value = 1 - 0.45 * post.night; // noční opar u obzoru tmavší (jinak svítí jako bílý pás)
    const env = scene.environment;
    if (env && env.image?.height) {
      g('uEnv').value = env;
      g('uEnvOn').value = env.image.height === 1024 ? 1 : 0; // jiná velikost by potřebovala jiné konstanty
    }
  }
}
// Konstanty pro čtení odlesků oblohy (PMREM) – stejné jako počítá three.js pro materiály (WebGLPrograms).
export function cubeUVDefines(h) {
  const maxMip = Math.log2(h) - 2;
  return `#define CUBEUV_TEXEL_WIDTH ${(1 / (3 * Math.max(2 ** maxMip, 7 * 16))).toFixed(8)}
  #define CUBEUV_TEXEL_HEIGHT ${(1 / h).toFixed(8)}
  #define CUBEUV_MAX_MIP ${maxMip.toFixed(1)}`;
}

// ------------------------------------------------------------ tónování a barevné ladění
// AgX s „lookem“ (jako Blender AgX Punchy): power = kontrast v logaritmickém prostoru, agxSat = sytost.
const AGX_GLSL = /* glsl */`
  uniform float uAgxPower, uAgxSat, uExposure;
  vec3 agxLook(vec3 color) {
    const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
    const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
    color = inset * (LINEAR_SRGB_TO_LINEAR_REC2020 * color);
    color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
    color = agxDefaultContrastApprox(color);
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = pow(max(color, 0.0), vec3(uAgxPower));
    color = l + uAgxSat * (color - l);
    color = outset * color;
    color = pow(max(vec3(0.0), color), vec3(2.2));
    return clamp(LINEAR_REC2020_TO_LINEAR_SRGB * color, 0.0, 1.0);
  }
`;
const LOOK_GLSL = /* glsl */`
  #include <tonemapping_pars_fragment>
  ${AGX_GLSL}
  uniform float uSat, uContrast, uVignette, uGrain, uHue, uNightK, uUnderK, uLift;
  uniform vec3 uCool, uWarm, uNightTint;
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 hdr = max(inputColor.rgb, 0.0) * uExposure;
    vec3 c = agxLook(hdr);
    // Ochrana odstínu: AgX s „punchem“ posouvá oranžovou k červené a zelenou ke žluté. Ve středních tónech vrátí
    // původní odstín scény (poměr barev), jas nechá z AgX. Světla nad ~0,7 se dál přirozeně odbarví do bílé (oheň, neon).
    float mx = max(max(c.r, c.g), c.b);
    if (mx > 1e-4) {
      vec3 ratioIn = hdr / max(max(max(hdr.r, hdr.g), hdr.b), 1e-6);
      float keep = uHue * (1.0 - smoothstep(0.55, 0.95, mx));
      c = mix(c, ratioIn * mx, keep);
    }
    float l = luma(c);
    c = mix(vec3(l), c, uSat);
    c = max((c - 0.18) * uContrast + 0.18, 0.0);
    // ve dne studené stíny a teplá světla
    c *= mix(uCool, uWarm, smoothstep(0.08, 0.6, l));
    // v noci se vše osvětlené měsícem barví do modra; oheň a neon (jasné a syté) zůstávají barevné
    if (uNightK > 0.0) {
      float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
      float k = uNightK * (1.0 - smoothstep(0.12, 0.4, chroma * 0.6 + l * 0.8));
      c = mix(c, vec3(luma(c)) * uNightTint * 1.9, k * 0.8);
    }
    vec2 d = uv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.2, 0.75, dot(d, d) * 2.0);
    // nic není úplně černé: nejtmavší místa se zvednou do tmavé modrošedé (v jeskyni a v noci víc), světla se nezmění
    c += uLift * (1.0 - smoothstep(0.0, 0.25, luma(c))) * mix(vec3(0.85, 0.92, 1.1), vec3(0.75, 0.88, 1.25), uNightK);
    if (uGrain > 0.0) c += (fract(sin(dot(uv * 913.7 + fract(time * 7.3), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }
`;
class LookEffect extends Effect {
  constructor() {
    const G = LK.grade, u = (v) => new THREE.Uniform(v);
    super('LookEffect', LOOK_GLSL, {
      uniforms: new Map([
        ['uSat', u(G.sat)], ['uContrast', u(G.contrast)], ['uVignette', u(G.vignette)], ['uGrain', u(LK.grain)], ['uHue', u(G.hue)],
        ['uCool', u(new THREE.Vector3(...G.cool))], ['uWarm', u(new THREE.Vector3(...G.warm))], ['uNightTint', u(new THREE.Vector3(...G.nightTint))],
        ['uNightK', u(0)], ['uUnderK', u(0)], ['uLift', u(0)], ['uAgxPower', u(G.power)], ['uAgxSat', u(G.agxSat)], ['uExposure', u(1)],
      ]),
    });
  }
  update() {
    const G = LK.grade, u = (k) => this.uniforms.get(k);
    u('uSat').value = G.sat * (1 - 0.25 * post.weather); u('uContrast').value = G.contrast; u('uVignette').value = G.vignette; u('uHue').value = G.hue;
    // v jeskyni ani pod vodou bez barevného nádechu dne
    const neutral = Math.max(post.under, post.night);
    u('uCool').value.set(...G.cool).lerp(ONE, neutral); u('uWarm').value.set(...G.warm).lerp(ONE, neutral);
    u('uNightTint').value.set(...G.nightTint).lerp(MARK_NIGHT, post.mark);
    u('uNightK').value = post.night * (1 - post.under);
    u('uGrain').value = LK.grain; u('uAgxPower').value = G.power; u('uAgxSat').value = G.agxSat;
    u('uExposure').value = LK.exposure * post.exposure;
    u('uLift').value = G.lift[0] + (G.lift[1] - G.lift[0]) * Math.max(post.night, post.under);
    const B = LK.bloom, b = post.bloom;
    b.intensity = B.intensity; b.luminanceMaterial.threshold = B.threshold; b.luminanceMaterial.smoothing = B.smoothing; b.mipmapBlurPass.radius = B.radius;
  }
}
const ONE = new THREE.Vector3(1, 1, 1), MARK_NIGHT = new THREE.Vector3(0.62, 0.42, 0.85);

// ------------------------------------------------------------ složení průchodů
function build() {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: FX.msaa, stencilBuffer: false });
  composer.addPass(new RenderPass(scene, camera));
  if (FX.ao) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const ao = new N8AOPostPass(scene, camera, size.x, size.y);
    ao.setQualityMode('Performance');
    // N8AO by jinak průhledné věci (voda, déšť, lístky) kreslilo ještě dvakrát navíc a čtyřikrát za snímek procházelo scénu
    ao.autoDetectTransparency = false;
    Object.assign(ao.configuration, { aoRadius: LK.ao.radius, distanceFalloff: 0.6, intensity: LK.ao.intensity, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, transparencyAware: false, color: new THREE.Color(0, 0, 0) });
    composer.addPass(ao);
    post.ao = ao;
  }
  const B = LK.bloom;
  post.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: B.threshold, luminanceSmoothing: B.smoothing, intensity: B.intensity, radius: B.radius, resolutionScale: 0.5 });
  composer.addPass(new EffectPass(camera, new AtmosphereEffect(), post.bloom, new LookEffect()));
  if (FX.fxaa) composer.addPass(new EffectPass(camera, new FXAAEffect()));
  post.composer = composer;
  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
}
// Dynamické rozlišení: když snímek trvá déle než ~18 ms (pod 55 fps), kreslí se v menším rozlišení (až FX.minScale),
// když je rezerva, zase se vrátí. Hra tak na slabším notebooku zůstane plynulá i s vysokou grafikou.
// S otevřeným oknem (batoh, počítač) se svět za ním kreslí v polovičním rozlišení a bez AO – stejně je skrytý.
const dyn = { t: 0, sum: 0, n: 0, wait: 3, base: 1, applied: 1 };
function dynamicResolution(dt) {
  dyn.sum += dt; dyn.n++;
  if ((dyn.t += dt) >= 1.5) {
    const avg = dyn.sum / dyn.n;
    dyn.t = dyn.sum = dyn.n = 0;
    if ((dyn.wait -= 1.5) <= 0 && !post.menu) { // první vteřiny se hra teprve rozjíždí
      post.scale = avg > 0.0185 ? Math.max(FX.minScale, post.scale - 0.1) : avg < 0.0135 ? Math.min(1, post.scale + 0.05) : post.scale;
    }
  }
  const want = post.menu ? 0.5 : post.scale;
  if (post.ao) post.ao.enabled = !post.menu;
  if (Math.abs(want - dyn.applied) < 1e-3) return;
  dyn.applied = want;
  renderer.setPixelRatio(dyn.base * want);
  post.composer.setSize(innerWidth, innerHeight);
}
/** Nakreslí snímek: s post-processingem přes composer, jinak rovnou. */
export function renderFrame(dt) {
  if (!FX.post) { renderer.render(scene, camera); return; }
  if (!post.composer) { dyn.base = renderer.getPixelRatio(); build(); }
  post.composer.render(dt);
  dynamicResolution(dt);
}
