import { neonAuth } from "@neondatabase/auth/next/server";

export const dynamic = "force-dynamic";

export default async function ServerRenderedPage() {
  const { session, user } = await neonAuth();

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Server Rendered Page</h1>

      <p className="text-gray-400">
        Authenticated:{" "}
        <span className={session ? "text-green-500" : "text-red-500"}>
          {session ? "Yes" : "No"}
        </span>
      </p>

      {user && <p className="text-gray-400">User ID: {user.id}</p>}

      <p className="font-medium text-gray-700 dark:text-gray-200">
        Session and User Data:
      </p>

      <pre className="overflow-x-auto rounded bg-gray-100 p-4 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
        {JSON.stringify({ session, user }, null, 2)}
      </pre>
    </div>
  );
}
