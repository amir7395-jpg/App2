import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign up" };
export default function Signup() {
  return <AuthForm mode="signup" />;
}
