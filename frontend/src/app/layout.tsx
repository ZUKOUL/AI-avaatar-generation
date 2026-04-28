import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { LayoutProvider } from "@/lib/layout";

// Plus Jakarta Sans — closest free Google Fonts alternative to Codec
// Pro (the Zetafonts geometric sans used by reference designs like
// clickway.fr). Same modern feel: humanist proportions, rounded
// terminals, very assertive at Bold/ExtraBold for landing-page
// headlines. We keep the CSS variable name `--font-manrope` for
// backwards-compat with any existing CSS that already references it
// — only the loaded family changes.
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Horpen — AI Avatar & Ad Generator",
  description: "Create stunning AI avatars, images, and videos for your ads with Horpen.ai",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${display.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Prevent flash: set theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('horpen-theme');
                  if (t === 'light' || t === 'dark') {
                    document.documentElement.setAttribute('data-theme', t);
                  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="min-h-full"
        style={{
          fontFamily: "var(--font-manrope), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          letterSpacing: "-0.011em",
        }}
      >
        <ThemeProvider>
          <LayoutProvider>{children}</LayoutProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
