// Časování vodních zvuků bez závislosti na kameře, vykreslování nebo WebAudio.
// Plavecké záběry mají vlastní rytmus: houpání při chůzi se v hluboké vodě nehýbe.
export class WaterSounds {
  wet = null;
  position = null;
  stroke = 0;

  update(dt, { x, y, z, wet, deep, swimming, moving = 0, fallSpeed = 0, flying = false }) {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const events = [];
    const moved = this.position ? Math.hypot(x - this.position.x, y - this.position.y, z - this.position.z) : 0;
    // Načtení světa a teleport nejsou skok do vody ani vystoupení na břeh.
    if (this.wet !== null && moved < 8 && !flying) {
      if (wet && !this.wet) events.push({ type: 'splash', size: Math.min(1.4, 0.35 + Math.max(fallSpeed, moving) / 16) });
      if (!wet && this.wet) events.push({ type: 'exit' });
    }
    if (this.wet === null || moved >= 8 || flying || !deep || !swimming) {
      this.stroke = 0;
    } else {
      const period = 0.8 / (1 + Math.min(6, Math.max(0, moving)) * 0.07);
      this.stroke += Math.min(dt, 0.1);
      if (this.stroke >= period) {
        this.stroke %= period;
        events.push({ type: 'swim' });
      }
    }
    this.wet = wet;
    this.position = { x, y, z };
    return events;
  }
}
