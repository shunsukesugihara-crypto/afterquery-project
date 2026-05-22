import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfterQuery · RLHF Annotation",
  description: "High-fidelity RLHF model evaluation interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
