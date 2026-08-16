import Link from 'next/link';
import { Container } from './Container';

const LINKS = [
  { href: '/explore', label: 'Explore' },
  { href: '/about', label: 'About' },
  { href: '/help', label: 'Help' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border py-10">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-ink-subtle sm:flex-row">
          <p>© {new Date().getFullYear()} Quill</p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}

export default SiteFooter;
