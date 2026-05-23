import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import { MusicWSProvider } from "../contexts/MusicWSContext";
import { MediaSessionProvider } from "../contexts/MediaSessionContext";

export const metadata: Metadata = {
  title: "Garret Player | Discord Music Command Center",
  description: "Futuristic, premium glassmorphism dashboard to control your Discord music bot sessions in real time.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <MusicWSProvider>
            <MediaSessionProvider>
              {children}
            </MediaSessionProvider>
          </MusicWSProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
