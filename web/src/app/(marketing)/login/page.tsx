import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Log in" };
export default function Login() {
  return <AuthForm mode="login" />;
}
