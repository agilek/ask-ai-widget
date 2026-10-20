import type { ReactNode } from "react";
import "ask-ai-widget/style.css"; // zero-FOUC: styles ship with the server HTML

export const metadata = { title: "ask-ai-widget example (Next.js)" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
