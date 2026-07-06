import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Your Application | Direct Finance",
  description:
    "Your finance manager has reviewed your application. Complete a few details to get your personalized vehicle options.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
