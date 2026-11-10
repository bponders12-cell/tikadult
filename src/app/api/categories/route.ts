import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultCategories } from "@/lib/categories";

export async function GET() {
  if (process.env.DATABASE_URL) {
    try {
      const categories = await prisma.category.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, name: true, sortOrder: true },
      });
      if (categories.length > 0) {
        return NextResponse.json({ categories });
      }
    } catch {
      // fall through to defaults
    }
  }
  return NextResponse.json({ categories: getDefaultCategories() });
}