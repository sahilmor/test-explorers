import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">School Online Test Manager</CardTitle>
          <CardDescription>
            Phase 0 — project skeleton. Nothing to see here yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            render={<a href="/api/ping">Check database connection</a>}
          />
        </CardContent>
      </Card>
    </main>
  );
}
