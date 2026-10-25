/**
 * Builds an internal link under the site's base path (/ModelPlayground/), with the
 * trailing slash GitHub Pages expects. Every internal link goes through here.
 *
 *   url()                          → /ModelPlayground/
 *   url('models/linear-regression') → /ModelPlayground/models/linear-regression/
 *   url('models/x', '#best')        → /ModelPlayground/models/x/#best
 *   url('data/cars.csv')            → /ModelPlayground/data/cars.csv
 */
export function url(path = '', hash = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\/+|\/+$/g, '');
  const isFile = /\.[a-z0-9]+$/i.test(clean);
  let href = clean ? `${base}/${clean}` : base;
  if (!isFile) href += '/';
  return href + hash;
}

export function modelUrl(slug: string, hash = ''): string {
  return url(`models/${slug}`, hash);
}
