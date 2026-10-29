import { DataNotice } from "@/components/DataNotice";
import { SignupForm } from "@/components/auth/SignupForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Create an account — Folium" };

export default function SignupPage() {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        {/* Before the form, not after: it is the condition of signing up. */}
        <DataNotice />
        <SignupForm />
      </CardContent>
    </Card>
  );
}
