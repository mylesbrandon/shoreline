import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold">Lost at sea</h1>
      <p className="text-mist">That page drifted off the chart.</p>
      <Link href="/" className="text-teal underline underline-offset-4">
        Back to port
      </Link>
    </main>
  );
}
