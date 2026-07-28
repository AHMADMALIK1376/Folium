import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Reset your password — Folium" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
