// app/parts/[id]/page.js — server shell; the workspace is client-side
import Workspace from "../../../components/Workspace.jsx";

export default async function PartPage({ params }) {
  const { id } = await params;
  return <Workspace partId={id.toUpperCase()} />;
}
