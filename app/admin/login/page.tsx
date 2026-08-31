"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        router.replace("/admin");
        return;
      }

      setLoading(false);
    };

    checkSession();
  }, [router]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();

    if (loggingIn) return;

    if (!email.trim() || !password) {
      setErrorMessage("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoggingIn(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("관리자 로그인 오류:", error);
      setErrorMessage(
        "이메일 또는 비밀번호가 올바르지 않습니다."
      );
      setLoggingIn(false);
      return;
    }

    router.replace("/admin");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6">
        <div className="rounded-3xl bg-white p-10 text-center shadow-xl">
          <div className="text-6xl">☕</div>
          <p className="mt-4 text-xl font-bold text-gray-600">
            확인 중...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="text-7xl">🔐</div>

          <h1 className="mt-4 text-4xl font-bold text-[#3E2723]">
            샬롬커피 관리자
          </h1>

          <p className="mt-3 text-lg text-gray-500">
            정산 페이지에 로그인해주세요.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-[2rem] bg-white p-8 shadow-xl"
        >
          <label className="block text-sm font-bold text-gray-600">
            이메일
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="관리자 이메일"
            autoComplete="email"
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-lg text-gray-800 outline-none focus:border-[#795548]"
          />

          <label className="mt-5 block text-sm font-bold text-gray-600">
            비밀번호
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-lg text-gray-800 outline-none focus:border-[#795548]"
          />

          {errorMessage && (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 text-center text-sm font-medium text-red-600">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="mt-6 w-full rounded-2xl bg-[#5D4037] py-5 text-xl font-bold text-white transition hover:bg-[#4E342E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loggingIn ? "로그인 중..." : "관리자 로그인"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          샬롬커피 관리자 전용
        </p>
      </div>
    </main>
  );
}
