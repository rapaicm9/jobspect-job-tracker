import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted rather than fetched: the Content-Security-Policy allows
// `font-src 'self'` and nothing else, so a font from a CDN would be blocked at
// runtime. One variable file covers every weight the UI uses. Licence in
// ../styles/fonts/OFL.txt.
const geistSans = localFont({
  src: "../styles/fonts/geist-variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jobspect",
  description: "Track every job application through one pipeline.",
};

// Every route, including the marketing page, renders per request. This is what
// a nonce-based CSP costs: Next stamps the nonce during server rendering by
// reading it off the request, and a page generated at build time has no request
// to read - so its scripts ship unnonced and `strict-dynamic` refuses them.
// Declared once here rather than per route, because there is no page in this
// application that could be shared between two users anyway.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
