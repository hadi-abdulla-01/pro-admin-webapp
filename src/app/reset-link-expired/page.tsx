export default function ResetLinkExpiredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg text-center">
        <div className="text-5xl mb-4">🔒</div>

        <h1 className="text-2xl font-bold text-gray-900">
          Password Reset Link Expired
        </h1>

        <p className="mt-4 text-gray-600">
          This password reset link has expired or has already been used.
        </p>

        <p className="mt-2 text-gray-600">
          Please request a new password reset email from the Amanah mobile app.
        </p>
      </div>
    </main>
  );
}
