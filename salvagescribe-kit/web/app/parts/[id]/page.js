import { redirect } from "next/navigation";
export default async function PartPage({ params }) {
  const { id } = await params;
  redirect(`/?part=${encodeURIComponent(id.toUpperCase())}`);
}
