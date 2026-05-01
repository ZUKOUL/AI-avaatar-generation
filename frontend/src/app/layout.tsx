import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { LayoutProvider } from "@/lib/layout";

// Two web fonts loaded at build time. The active one is selected
// at runtime by the theme picker via the CSS variable `--font-theme`
// (see /lib/themePresets.ts). Both are exposed through their own
// next/font variables so the picker can reference them by name.
//
// Plus Jakarta Sans = the Horpen default (modern geometric sans with
// rounded terminals, premium feel à la Codec Pro).
// Inter = the closest open match to the fonts used by Linear, Notion,
// Vercel, ChatGPT, Spotify — covers the "I want my SaaS to feel like
// the SaaS I already use" use case.
//
// We keep `--font-manrope` as the legacy CSS-var name pointing to the
// Jakarta family for backwards compat — older components reference it.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
    <html
      lang="en"
      className={`h-full ${jakarta.variable} ${inter.variable}`}
      // Default to the Horpen preset until the ThemeProvider hydrates
      // localStorage. Both `data-theme` and `data-preset` are read by
      // the inline script below so a refresh doesn't flash the wrong
      // skin between SSR and React hydration.
      data-theme="dark"
      data-preset="horpen"
      suppressHydrationWarning
    >
      <head>
        {/* Prevent flash of wrong theme/preset. Reads localStorage
            BEFORE React mounts, sets the right attributes + inline
            CSS variables on <html> so the very first paint matches
            the user's saved choice. */}
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
                  var p = localStorage.getItem('horpen-theme-preset');
                  if (p) {
                    document.documentElement.setAttribute('data-preset', p);
                    // Token bundle mirrors themePresets.ts. Order :
                    // [accent, accentSoft, font, radius (pill+md),
                    //  radiusSm, radiusLg, shadowElev]
                    var SHARP = '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)';
                    var SOFT  = '0 2px 6px rgba(0,0,0,0.08)';
                    var FLAT  = '0 0 0 1px rgba(0,0,0,0.08)';
                    var APPLE_SH = '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)';
                    var STRIPE_SH = '0 6px 20px rgba(99,91,255,0.10), 0 1px 3px rgba(0,0,0,0.08)';
                    var SPOTIFY_SH = '0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)';
                    var DEFAULT_SH = '0 4px 16px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)';
                    var MIN_SH = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';
                    var presets = {
                      horpen:  ['#3b82f6', 'rgba(59,130,246,0.10)', 'var(--font-jakarta)', '10px', '8px',  '14px', DEFAULT_SH],
                      linear:  ['#5e6ad2', 'rgba(94,106,210,0.10)', 'var(--font-inter)',   '6px',  '4px',  '8px',  SHARP],
                      notion:  ['#2383e2', 'rgba(35,131,226,0.10)', 'var(--font-inter)',   '8px',  '6px',  '10px', SOFT],
                      vercel:  ['#000000', 'rgba(0,0,0,0.06)',      'var(--font-inter)',   '6px',  '4px',  '8px',  FLAT],
                      apple:   ['#0066cc', 'rgba(0,102,204,0.10)',  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", '14px', '10px', '20px', APPLE_SH],
                      stripe:  ['#635bff', 'rgba(99,91,255,0.10)',  'var(--font-jakarta)', '8px',  '6px',  '12px', STRIPE_SH],
                      spotify: ['#1db954', 'rgba(29,185,84,0.10)',  'var(--font-inter)',   '999px','999px','16px', SPOTIFY_SH],
                      chatgpt: ['#10a37f', 'rgba(16,163,127,0.10)', 'var(--font-inter)',   '10px', '8px',  '12px', MIN_SH]
                    };
                    var v = presets[p];
                    if (v) {
                      var s = document.documentElement.style;
                      s.setProperty('--accent', v[0]);
                      s.setProperty('--accent-soft', v[1]);
                      s.setProperty('--font-theme', v[2]);
                      s.setProperty('--radius-pill', v[3]);
                      s.setProperty('--radius-md', v[3]);
                      s.setProperty('--radius-sm', v[4]);
                      s.setProperty('--radius-lg', v[5]);
                      s.setProperty('--shadow-elev', v[6]);
                    }
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
          // `--font-theme` is set by the theme picker and falls back
          // to the Jakarta variable (Horpen default) when unset. The
          // chain after it is the universal sans-serif fallback.
          fontFamily:
            "var(--font-theme, var(--font-jakarta)), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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
