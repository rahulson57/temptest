import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getCurrentUser } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Quill — read and write',
    template: '%s · Quill',
  },
  description: 'A quiet place to publish long-form writing and find things worth reading.',
};

/**
 * Root layout: chrome, viewer resolution and the skip link.
 *
 * getCurrentUser() runs here (not in SiteHeader) so there is exactly one
 * session read per request and pages can stay presentational.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        {/* Keyboard users land here first: one Tab to jump the nav. */}
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
        >
          Skip to content
        </a>

        <SiteHeader user={user} />

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
