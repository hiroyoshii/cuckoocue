import { CuckooCueWebApp } from "@/components/cuckoo-cue-web-app";
import Link from "next/link";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const id = params.run_id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || Object.keys(params).some((key) => key !== "run_id")) {
    return <main className="workspace"><h1>リストのリンクが正しくありません</h1><Link href="/">探す</Link></main>;
  }
  return <CuckooCueWebApp importRunId={id} />;
}
