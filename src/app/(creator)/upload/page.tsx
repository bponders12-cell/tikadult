import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDefaultCategories } from "@/lib/categories";
import UploadForm from "@/components/creator/UploadForm";
import "@/components/creator/creator.css";

export const instant = false;

export default async function UploadPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login?next=/upload");

  return (
    <main className="creator-shell">
      <div className="creator-inner">
        <nav className="creator-nav">
          <Link href="/">Browse</Link>
          <Link href="/studio">My studio</Link>
        </nav>
        <h1>Upload</h1>
        <p className="creator-sub">
          Videos up to 5 minutes. Uploads go live only after automated checks pass.
        </p>
        <UploadForm categories={getDefaultCategories()} />
      </div>
    </main>
  );
}
