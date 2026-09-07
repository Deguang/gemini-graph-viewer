/* Screencast frames arrive only when the page repaints, so they are variable
   rate. The timestamps say when each frame was actually on screen — feeding
   them to ffmpeg as per-frame durations and resampling to a constant 30fps
   preserves the real pacing; treating them as a fixed-rate sequence would
   speed up the still stretches and slow down the animated ones. */
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'frames.json'), 'utf8'));

const lines = ['ffconcat version 1.0'];
for (let i = 0; i < meta.length; i++) {
  const dur = i < meta.length - 1 ? meta[i + 1].t - meta[i].t : 0.2;
  lines.push(`file 'frames/${meta[i].f}'`);
  lines.push(`duration ${Math.max(dur, 0.001).toFixed(4)}`);
}
// concat honours the final duration only if the last entry is repeated.
lines.push(`file 'frames/${meta[meta.length - 1].f}'`);
fs.writeFileSync(path.join(DIR, 'list.txt'), lines.join('\n'));
console.log(`  清单: ${meta.length} 帧, 总时长 ${(meta[meta.length-1].t - meta[0].t).toFixed(1)}s`);
