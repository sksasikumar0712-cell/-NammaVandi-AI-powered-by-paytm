import { notFound } from "next/navigation";
import App from "@/components/App";
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (
    !["dashboard", "inventory", "orders", "routes", "playground"].includes(page)
  )
    notFound();
  return <App page={page} />;
}
