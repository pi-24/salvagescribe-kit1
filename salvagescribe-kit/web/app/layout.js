import "./globals.css";
import AppShell from "../components/AppShell.jsx";
export const metadata = { title: "SalvageScribe — UAE → UK Parts Intelligence", description: "Evidence-led salvage inventory and listing drafts." };
export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><head><link rel="stylesheet" href="/marketglass/styles.css" /></head><body><AppShell>{children}</AppShell></body></html>;
}
