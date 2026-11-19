// 3D ikony bloků a strojů: vykreslí skutečný model se stejnými materiály jako ve světě (kov se leskne, svítící
// proužky strojů) do malého obrázku 64×64 a nahradí jím plochou ikonu. Ikony předmětů zůstávají pixelové.
// Kreslí se po startu na pozadí: shadery se překládají bez zastavení hry (compileAsync), všechny ikony do jedné
// velké textury a ta se přečte najednou. Jen funkce (volá je render/blocks.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ICONS, iconCanvas } from './icons.js';
import { renderer } from './renderer.js';

const S = 64, SS = S * 2; // velikost ikony; kreslí se 2× větší a zmenší (hladké hrany)
// Pohled jako u ikon v Minecraftu: shora, 30° nad vodorovnou rovinou, 45° bokem.
const DIR = new THREE.Vector3(1, Math.tan(Math.PI / 6) * Math.SQRT2, 1).normalize();

/**
 * Vykreslí ikony. items = [[id, (group) => naplní group modelem, střed y, pevná velikost záběru (0 = podle modelu)]].
 * Po skončení pošle událost 'rise-icons' (inventář se překreslí). Vrací Promise s počtem nových ikon.
 */
export async function renderIcons(items) {
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xe4ecff, 0x4a443a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2e2, 1.75);
  sun.position.set(-1.2, 3, 2.2); // světlo zleva shora: vrch nejsvětlejší, levý bok střední, pravý tmavší
  scene.add(sun);
  // modely vedle sebe (každý na svém místě, kamera se zaměří na jeden)
  const shots = [], box = new THREE.Box3(), v = new THREE.Vector3();
  for (const [id, build, cy = 0, fixed = 0] of items) {
    const g = new THREE.Group();
    try { build(g); } catch { continue; } // model, který se nepovede postavit, si nechá starou ikonu
    g.position.x = shots.length * 4;
    scene.add(g);
    g.updateMatrixWorld(true);
    box.setFromObject(g, true);
    shots.push({ id, g, cy: fixed ? cy : (box.min.y + box.max.y) / 2, fixed, box: box.clone() });
  }
  if (!shots.length) return 0;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const aim = (s) => {
    const target = new THREE.Vector3(s.g.position.x, s.cy, 0);
    cam.position.copy(target).addScaledVector(DIR, 10);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let half = s.fixed;
    if (!half) { // velikost záběru podle obrysu modelu
      half = 0.62;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? s.box.max.x : s.box.min.x, i & 2 ? s.box.max.y : s.box.min.y, i & 4 ? s.box.max.z : s.box.min.z).applyMatrix4(cam.matrixWorldInverse);
        half = Math.max(half, Math.abs(v.x) * 1.06, Math.abs(v.y) * 1.06);
      }
    }
    cam.left = cam.bottom = -half; cam.right = cam.top = half;
    cam.updateProjectionMatrix();
  };
  aim(shots[0]);
  // paralelní překlad shaderů (hra se nezastaví); bez něj se přeloží až při kreslení
  if (renderer.extensions.has('KHR_parallel_shader_compile')) try { await renderer.compileAsync(scene, cam); } catch { /* nevadí */ }
  // všechny ikony do jedné textury (mřížka), pak jedno čtení zpět
  const cols = Math.ceil(Math.sqrt(shots.length)), rows = Math.ceil(shots.length / cols);
  const rt = new THREE.WebGLRenderTarget(cols * SS, rows * SS, { type: THREE.UnsignedByteType });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.scissorTest = true;
  const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const s of shots) s.g.visible = false;
  shots.forEach((s, i) => {
    s.g.visible = true;
    aim(s);
    rt.viewport.set((i % cols) * SS, Math.floor(i / cols) * SS, SS, SS);
    rt.scissor.copy(rt.viewport);
    renderer.setRenderTarget(rt); // použije nový výřez
    renderer.clear();
    renderer.render(scene, cam);
    s.g.visible = false;
  });
  const px = new Uint8Array(cols * SS * rows * SS * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, cols * SS, rows * SS, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose(); envRT.dispose(); pmrem.dispose();
  // rozstříhat na ikony (řádky z WebGL jsou odspodu)
  const big = iconCanvas();
  big.width = big.height = SS;
  const bctx = big.getContext('2d'), img = bctx.createImageData(SS, SS), W = cols * SS;
  shots.forEach((s, i) => {
    const ox = (i % cols) * SS, oy = Math.floor(i / cols) * SS;
    for (let y = 0; y < SS; y++) { const src = ((oy + SS - 1 - y) * W + ox) * 4; img.data.set(px.subarray(src, src + SS * 4), y * SS * 4); }
    bctx.putImageData(img, 0, 0);
    const c = iconCanvas();
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.shadowColor = 'rgba(0,0,0,0.45)'; // jemný stín pod modelem, aby ikona „seděla“ i na tmavém políčku
    x.shadowBlur = 3;
    x.shadowOffsetY = 1.5;
    x.drawImage(big, 0, 0, S, S);
    ICONS[s.id] = { canvas: c, url: c.toDataURL(), smooth: true };
    s.g.traverse((o) => o.geometry?.dispose());
  });
  dispatchEvent(new Event('rise-icons'));
  return shots.length;
}
