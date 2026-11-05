// Kousky shaderů pro světlo vlastních materiálů (terén, tráva, post-processing): stín slunce z mapy stínů a okolní světlo.
// Uniformy dodává shaderUniforms() v renderer.js (uShadowMap, uShadowMatrix, uShadowP, uShadowStrength, uSkyAmb, uGroundAmb).

// Hloubka z mapy stínů three.js (RGBA balení, stejné jako unpackRGBAToDepth).
export const SHADOW_PARS_GLSL = /* glsl */`
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform vec4 uShadowP; // x = zapnuto, y = 1 / rozlišení, z = posun podél normály (m), w = měkkost (texely)
  uniform float uShadowStrength;
  float unpackShadowDepth(vec4 v) { return dot(v, vec4(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0)); }
  float shadowTap(vec2 uv, float z) { return step(z, unpackShadowDepth(texture2D(uShadowMap, uv))); }
  // Jak moc na bod svítí slunce (1 = plně, 0 = ve stínu). Okraj oblasti stínů plynule přechází do „bez stínu“.
  float sunShadow(vec3 wp, vec3 n, float dither) {
    if (uShadowP.x < 0.5) return 1.0;
    vec4 sc = uShadowMatrix * vec4(wp + n * uShadowP.z, 1.0);
    vec3 c = sc.xyz / sc.w;
    vec2 e = min(c.xy, 1.0 - c.xy);
    float edge = smoothstep(0.0, 0.1, min(e.x, e.y));
    if (edge <= 0.0 || c.z >= 1.0) return 1.0;
    c.z -= 0.0004;
    float r = uShadowP.y * uShadowP.w;
    float a = dither * 6.2832;
    mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
    float s = shadowTap(c.xy, c.z);
    s += shadowTap(c.xy + rot * vec2(-0.94, -0.40) * r, c.z);
    s += shadowTap(c.xy + rot * vec2(0.95, -0.77) * r, c.z);
    s += shadowTap(c.xy + rot * vec2(-0.09, -0.93) * r, c.z);
    s += shadowTap(c.xy + rot * vec2(0.34, 0.29) * r, c.z);
    s += shadowTap(c.xy + rot * vec2(-0.82, 0.54) * r, c.z);
    s += shadowTap(c.xy + rot * vec2(0.54, 0.84) * r, c.z);
    s /= 7.0;
    return mix(1.0, mix(1.0, s, uShadowStrength), edge);
  }
  // Šum pro rozptyl vzorků (bez textury)
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// Okolní světlo: obloha shora, odražené světlo zespodu (barva podle vzhledu)
export const AMBIENT_GLSL = /* glsl */`
  uniform vec3 uSkyAmb, uGroundAmb;
  uniform float uFoliage;
  vec3 foliage(vec3 c) { return max(mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, uFoliage), 0.0); } // sytost trávy a listí podle vzhledu
  vec3 hemiLight(vec3 n, vec3 amb) { return amb * mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5); }
`;

// Světla pochodní, táboráků a lamp (stejný útlum jako PointLight v three.js: dosah 16 m, decay 1,7).
export const POINT_GLSL = /* glsl */`
  uniform vec4 uPL[6];
  uniform vec3 uPLC[6];
  vec3 pointLights(vec3 wp, vec3 n, float wrap) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      if (uPL[i].w <= 0.0) continue;
      vec3 L = uPL[i].xyz - wp;
      float d = length(L);
      float cut = clamp(1.0 - pow(d / 16.0, 4.0), 0.0, 1.0);
      float att = cut * cut / max(pow(d, 1.7), 0.01);
      float nl = clamp((dot(n, L / max(d, 1e-3)) + wrap) / (1.0 + wrap), 0.0, 1.0);
      sum += uPLC[i] * uPL[i].w * att * nl * 0.3183;
    }
    return sum;
  }
  // Světlo ohně a lamp na trávě a zemi: odmocninová křivka – střed u ohně se nepřepálí do neonově žlutozelené,
  // slabé světlo dál od ohně se naopak trochu zesílí (světlo dosáhne dál, jako skutečný oheň). Trochu méně syté:
  // tráva pod ohněm zůstane přirozeně zelená, jen teplejší.
  vec3 softLight(vec3 p) {
    float l = dot(p, vec3(0.3, 0.59, 0.11));
    p *= 1.2 * inversesqrt(l + 0.06);
    return mix(p, vec3(dot(p, vec3(0.3, 0.59, 0.11))), 0.3);
  }
`;
