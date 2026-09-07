import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const kcy2kBanger = localFont({
  src: "../public/fonts/KCY2KBanger-Bold.otf",
  variable: "--font-banger",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Robin Wattier — Creative Portfolio",
  description:
    "Robin Wattier — Designing human experiences in code. Portfolio créatif explorant l'IA, l'Audio et les expériences visuelles.",
  keywords: [
    "Robin Wattier",
    "portfolio",
    "creative developer",
    "design",
    "code",
    "AI",
    "audio",
    "visual",
  ],
  authors: [{ name: "Robin Wattier" }],
  openGraph: {
    title: "Robin Wattier — Creative Portfolio",
    description: "Designing human experiences in code.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@700&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Antic&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`font-(--font-body) ${kcy2kBanger.variable}`}>{children}</body>
    </html>
  );
}
