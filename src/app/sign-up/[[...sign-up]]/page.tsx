import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <SignUp signInUrl="/sign-in" forceRedirectUrl="/chat" />
    </div>
  );
}
