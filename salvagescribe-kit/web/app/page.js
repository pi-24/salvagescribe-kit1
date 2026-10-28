import { readFile } from "node:fs/promises";
import path from "node:path";
import MarketplaceScript from "../components/MarketplaceScript.jsx";

export const dynamic = "force-dynamic";
export default async function MarketplacePage() {
  const html = await readFile(path.join(process.cwd(), "public/marketglass/index.html"), "utf8");
  const body = html.match(/<body>([\s\S]*?)<script src=/)[1];
  return <><div dangerouslySetInnerHTML={{ __html: body }} /><MarketplaceScript /></>;
}
