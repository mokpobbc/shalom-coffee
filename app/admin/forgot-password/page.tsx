"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const sendRecoveryEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const redirectTo = `${window.location.origin}/admin/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      console.error("비밀번호 재설정 이메일 전송 오류:", error);
      setErrorMessage("재설정 이메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
    } else {
      setMessage("계정이 등록되어 있다면 비밀번호 재설정 안내 메일이 발송됩니다. 이메일을 확인해주세요.");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="text-7xl">🔐</div>
          <h1 className="mt-4 text-4xl font-bold text-[#3E2723]">비밀번호 재설정</h1>
          <p className="mt-3 text-lg text-gray-500">관리자 계정 이메일을 입력해주세요.</p>
        </div>

        <form onSubmit={sendRecoveryEmail} className="rounded-[2rem] bg-white p-8 shadow-xl">
          <label htmlFor="recovery-email" className="block text-sm font-bold text-gray-600">이메일</label>
          <input
            id="recovery-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="관리자 이메일"
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-lg text-gray-800 outline-none focus:border-[#795548]"
          />

          {message && <p role="status" className="mt-5 rounded-2xl bg-green-50 p-4 text-center text-sm text-green-700">{message}</p>}
          {errorMessage && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-center text-sm text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-[#5D4037] py-5 text-xl font-bold text-white disabled:opacity-50"
          >
            {loading ? "전송 중..." : "재설정 이메일 보내기"}
          </button>
          <Link href="/admin/login" className="mt-5 block text-center text-sm font-medium text-[#795548] underline">
            관리자 로그인으로 돌아가기
          </Link>
        </form>
      </div>
    </main>
  );
}
