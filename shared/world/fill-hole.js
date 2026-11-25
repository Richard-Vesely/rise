// Zasypání souvislé vykopané díry až k původnímu povrchu.
import { shrineDist } from './terrain.js';
import { NO_DIG_R, V, columnDug, naturalAt, setVox, topY, vchunkKey, voxEdits } from './voxels.js';

export function fillHole(x, z) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return { error: 'Miř na dno nebo okraj vykopané díry.' };
  const nearby = [[x, z], [x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]];
  const start = nearby.find(([cx, cz]) => columnDug(cx, cz));
  if (!start) return { error: 'Tady není vykopaná díra. Zkus kliknout na její dno nebo okraj.' };
  const columns = [], seen = new Set(), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [cx, cz] = queue[i], key = `${cx},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!columnDug(cx, cz)) continue;
    if (shrineDist(cx + 0.5, cz + 0.5) < NO_DIG_R) return { error: 'U svatyně se terén měnit nedá.' };
    if (columns.length >= 1024) return { error: 'Tahle díra je moc velká (maximum je 1024 sloupců).' };
    columns.push([cx, cz]);
    queue.push([cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]);
  }
  // Nejdřív celý plán: při překročení limitu se nezmění ani jeden blok.
  const edits = [];
  for (const [cx, cz] of columns) {
    const top = topY(cx, cz);
    for (const [key, id] of voxEdits.get(vchunkKey(cx, cz)) || []) {
      if (id !== V.AIR) continue;
      const [ex, y, ez] = key.split(',').map(Number);
      if (ex !== cx || ez !== cz || y > top) continue;
      const material = naturalAt(cx, top, cz, top);
      edits.push([cx, y, cz, material]);
      if (edits.length > 8192) return { error: 'Tahle díra je moc hluboká nebo velká.' };
    }
  }
  for (const edit of edits) setVox(...edit);
  return { columns, filled: edits.length };
}
