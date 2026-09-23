import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'plans' }
  | { name: 'plan'; id: string }
  | { name: 'sitter'; id: string }
  | { name: 'setup'; section?: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'plan' && parts[1]) {
    return parts[2] === 'sitter' ? { name: 'sitter', id: parts[1] } : { name: 'plan', id: parts[1] };
  }
  if (parts[0] === 'setup') return { name: 'setup', section: parts[1] };
  return { name: 'plans' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'plans':
      return '#/';
    case 'plan':
      return `#/plan/${r.id}`;
    case 'sitter':
      return `#/plan/${r.id}/sitter`;
    case 'setup':
      return r.section ? `#/setup/${r.section}` : '#/setup';
  }
}

export function navigate(r: Route): void {
  location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
