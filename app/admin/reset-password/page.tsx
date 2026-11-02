"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setRecoveryReady(true);
      }
    };

    void checkRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || session) && session) {
        setRecoveryReady(true);
      } else if (event === "SIGNED_OUT") {
        setRecoveryReady(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!recoveryReady) {
      setErrorMessage("유효한 재설정 링크로 이 페이지를 열어주세요.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("비밀번호는 8자 이상 입력해주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("비밀번호가 서로 다릅니다.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("비밀번호 변경 오류:", error);
      setErrorMessage("비밀번호를 변경하지 못했습니다. 재설정 링크가 만료됐을 수 있습니다.");
      setSaving(false);
      return;
    }

    setMessage("비밀번호가 변경되었습니다. 관리자 페이지로 이동합니다.");
    await supabase.auth.signOut({ scope: "global" });
    window.setTimeout(() => {
      window.location.assign("/admin/login");
    }, 1200);
  };

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="text-7xl">🔑</div>
          <h1 className="mt-4 text-4xl font-bold text-[#3E2723]">새 비밀번호 설정</h1>
          <p className="mt-3 text-lg text-gray-500">새 비밀번호를 입력해주세요.</p>
        </div>

        <form onSubmit={updatePassword} className="rounded-[2rem] bg-white p-8 shadow-xl">
          {!recoveryReady && (
            <p className="mb-5 rounded-2xl bg-amber-50 p-4 text-center text-sm text-amber-800">
              이메일로 받은 재설정 링크를 통해 이 페이지를 열어주세요.
            </p>
          )}
          <label htmlFor="new-password" className="block text-sm font-bold text-gray-600">새 비밀번호</label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-lg text-gray-800 outline-none focus:border-[#795548]"
          />

          <label htmlFor="confirm-password" className="mt-5 block text-sm font-bold text-gray-600">새 비밀번호 확인</label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-lg text-gray-800 outline-none focus:border-[#795548]"
          />

          {message && <p role="status" className="mt-5 rounded-2xl bg-green-50 p-4 text-center text-sm text-green-700">{message}</p>}
          {errorMessage && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-center text-sm text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={saving || !recoveryReady}
            className="mt-6 w-full rounded-2xl bg-[#5D4037] py-5 text-xl font-bold text-white disabled:opacity-50"
          >
            {saving ? "변경 중..." : "비밀번호 변경"}
          </button>
          <Link href="/admin/login" className="mt-5 block text-center text-sm font-medium text-[#795548] underline">
            관리자 로그인으로 돌아가기
          </Link>
        </form>
      </div>
    </main>
  );
}
