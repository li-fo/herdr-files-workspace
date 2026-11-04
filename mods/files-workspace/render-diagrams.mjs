// Runs locally in Node, outside Herdr's UI thread. No network or browser needed.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { render } from './vendor/pele.mjs';

export function nativeSvg(svg, colors = {}) {
  const vars = { ...colors };
  const resolve = value => {
    for (let i = 0; i < 12 && value.includes('var('); i++) {
      value = value.replace(/var\((--[\w-]+)(?:,([^()]*))?\)/g, (_m, name, fallback) => vars[name] ?? fallback ?? 'inherit');
    }
    return value;
  };
  // resvg does not evaluate CSS custom properties. Resolve Pele's aliases first.
  for (const match of svg.matchAll(/(--[\w-]+):([^;"<>]+);/g)) vars[match[1]] = resolve(match[2]);
  return resolve(svg).replace(/--[\w-]+:[^;"<>]+;/g, '');
}

if (process.argv[2]) {
  const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const results = [];
  for (let i = 0; i < request.diagrams.length; i++) {
    try {
      const result = render(request.diagrams[i], { responsive: false, autoDirection: false,
        fontFamily: 'Malgun Gothic, Segoe UI, sans-serif', links: false, images: false,
        limit: 50000, maxEdges: 2000, outputLimit: 2000000, idPrefix: 'diagram-' + i });
      const file = join(dirname(process.argv[2]), `diagram-${i}.svg`);
      await writeFile(file, nativeSvg(result.svg, request.colors), 'utf8');
      results.push({ file, width: result.width, height: result.height });
    } catch (error) { results.push({ error: String(error.message || error) }); }
  }
  process.stdout.write(JSON.stringify(results));
}
