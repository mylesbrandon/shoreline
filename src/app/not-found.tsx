import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold">Swept off the beach</h1>
      <p className="text-mist">That page drifted past the buoys.</p>
      <Link href="/" className="text-teal underline underline-offset-4">
        Back to Tower 4
      </Link>
    </main>
  );
}
