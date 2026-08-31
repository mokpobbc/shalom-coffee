"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Step =
  | "name"
  | "menu"
  | "options"
  | "quantity"
  | "confirm"
  | "complete";

type Menu = "americano" | "peach";

export default function Home() {
  const [step, setStep] = useState<Step>("name");

  const [name, setName] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [temperature, setTemperature] = useState<
    "HOT" | "ICE" | null
  >(null);
  const [taste, setTaste] = useState<
    "고소한 맛" | "신맛" | null
  >(null);
  const [quantity, setQuantity] = useState(1);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // ==================================================
  // 이름 다음
  // ==================================================

  const handleNameNext = () => {
    if (!name.trim()) {
      alert("주문자 이름을 입력해주세요.");
      return;
    }

    setStep("menu");
  };

  // ==================================================
  // 메뉴 선택
  // ==================================================

  const selectMenu = (selectedMenu: Menu) => {
    setMenu(selectedMenu);
    setQuantity(1);

    if (selectedMenu === "americano") {
      setTemperature(null);
      setTaste(null);
      setStep("options");
    } else {
      setTemperature(null);
      setTaste(null);
      setStep("quantity");
    }
  };

  // ==================================================
  // 아메리카노 옵션
  // ==================================================

  const handleOptionsNext = () => {
    if (!temperature) {
      alert("HOT 또는 ICE를 선택해주세요.");
      return;
    }

    if (!taste) {
      alert("맛을 선택해주세요.");
      return;
    }

    setStep("quantity");
  };

  // ==================================================
  // 수량
  // ==================================================

  const increaseQuantity = () => {
    setQuantity((current) => current + 1);
  };

  const decreaseQuantity = () => {
    setQuantity((current) =>
      Math.max(1, current - 1)
    );
  };

  // ==================================================
  // 주문 초기화
  // ==================================================

  const resetOrder = () => {
    setStep("name");
    setName("");
    setMenu(null);
    setTemperature(null);
    setTaste(null);
    setQuantity(1);
    setIsSaving(false);
    setErrorMessage("");
  };

  // ==================================================
  // 실제 주문 저장
  // ==================================================

  const saveOrder = async () => {
    // ----------------------------------------------
    // 🔒 중복 실행 방지
    // ----------------------------------------------

    if (isSaving) {
      return;
    }

    // ----------------------------------------------
    // 주문 정보 확인
    // ----------------------------------------------

    if (!name.trim() || !menu) {
      alert("주문 정보를 확인해주세요.");
      return;
    }

    if (
      menu === "americano" &&
      (!temperature || !taste)
    ) {
      alert("아메리카노 옵션을 확인해주세요.");
      return;
    }

    // ----------------------------------------------
    // 저장 시작
    // ----------------------------------------------

    setIsSaving(true);
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from("orders")
        .insert({
          name: name.trim(),
          menu:
            menu === "americano"
              ? "아메리카노"
              : "복숭아 아이스티",
          temperature:
            menu === "americano"
              ? temperature
              : null,
          taste:
            menu === "americano"
              ? taste
              : null,
          quantity,
          status: "pending",
        });

      // --------------------------------------------
      // 저장 실패
      // --------------------------------------------

      if (error) {
        console.error(
          "주문 저장 오류:",
          error
        );

        setErrorMessage(
          "주문 저장에 실패했습니다. 잠시 후 다시 시도해주세요."
        );

        setIsSaving(false);
        return;
      }

      // --------------------------------------------
      // 저장 성공
      // --------------------------------------------

      setStep("complete");

      // 7초 후 첫 화면
      setTimeout(() => {
        resetOrder();
      }, 7000);
    } catch (error) {
      // --------------------------------------------
      // 예상하지 못한 오류
      // --------------------------------------------

      console.error(
        "주문 처리 중 오류:",
        error
      );

      setErrorMessage(
        "주문 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
      );

      setIsSaving(false);
    }
  };

  // ==================================================
  // ① 주문 완료
  // ==================================================

  if (step === "complete") {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6">
        <div className="w-full max-w-4xl text-center">

          <div className="rounded-[2rem] bg-white p-12 shadow-xl">

            <div className="mb-8 text-8xl">
              ☕
            </div>

            <h1 className="text-5xl font-bold text-[#3E2723]">
              주문이 완료되었습니다!
            </h1>

            <p className="mt-8 text-2xl leading-relaxed text-gray-600">
              <strong className="text-[#5D4037]">
                {name}님
              </strong>
              의 주문이 접수되었습니다.
            </p>

            <div className="mt-9 rounded-3xl bg-[#F8F5EF] p-8">

              <p className="text-2xl font-medium text-gray-700">
                음료가 준비되면
              </p>

              <p className="mt-3 text-2xl font-bold text-[#5D4037]">
                교회 본당 TV 화면으로 알려드립니다.
              </p>

            </div>

            <p className="mt-8 text-xl text-gray-500">
              잠시 후 처음 화면으로 돌아갑니다.
            </p>

          </div>

          <p className="mt-8 text-base text-gray-400">
            주님의교회 청년부 · 샬롬커피
          </p>

        </div>
      </main>
    );
  }

  // ==================================================
  // ② 이름 입력
  // ==================================================

  if (step === "name") {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">

        <div className="w-full max-w-4xl text-center">

          <div className="mb-8">

            <div className="mb-4 text-8xl">
              ☕
            </div>

            <h1 className="text-6xl font-bold tracking-tight text-[#3E2723]">
              샬롬커피
            </h1>

            <p className="mt-5 text-2xl text-[#795548]">
              따뜻한 마음을 담은 무료 커피
            </p>

          </div>

          <div className="rounded-[2rem] bg-white p-10 shadow-xl">

            <h2 className="text-3xl font-bold text-gray-800">
              주문자 이름을 입력해주세요
            </h2>

            <p className="mt-4 text-xl text-gray-500">
              음료가 준비되면 교회 본당 TV 화면으로 알려드립니다.
            </p>

            <input
              type="text"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleNameNext();
                }
              }}
              placeholder="이름을 입력해주세요"
              className="mt-8 w-full rounded-3xl border-2 border-gray-200 px-6 py-7 text-center text-3xl text-gray-800 outline-none transition focus:border-[#795548]"
              autoFocus
            />

            <button
              onClick={handleNameNext}
              className="mt-6 w-full rounded-3xl bg-[#5D4037] py-7 text-3xl font-bold text-white transition hover:bg-[#4E342E] active:scale-[0.98]"
            >
              다음 →
            </button>

          </div>

          <p className="mt-7 text-base text-gray-400">
            주님의교회 청년부 · 샬롬커피
          </p>

        </div>

      </main>
    );
  }

  // ==================================================
  // ③ 메뉴 선택
  // ==================================================

  if (step === "menu") {
    return (
      <main className="min-h-screen bg-[#F8F5EF] px-6 py-8">

        <div className="mx-auto max-w-5xl">

          <div className="mb-8 text-center">

            <div className="text-7xl">
              ☕
            </div>

            <h1 className="mt-3 text-5xl font-bold text-[#3E2723]">
              샬롬커피
            </h1>

            <p className="mt-4 text-2xl text-[#795548]">
              {name}님, 무엇을 주문하시겠어요?
            </p>

          </div>

          <div className="grid gap-7 md:grid-cols-2">

            <button
              onClick={() =>
                selectMenu("americano")
              }
              className="min-h-[320px] rounded-[2rem] bg-white p-10 text-center shadow-xl transition hover:scale-[1.02] active:scale-[0.98]"
            >

              <div className="mb-5 text-8xl">
                ☕
              </div>

              <h2 className="text-4xl font-bold text-[#3E2723]">
                아메리카노
              </h2>

              <p className="mt-4 text-2xl text-gray-500">
                HOT / ICE
              </p>

            </button>

            <button
              onClick={() =>
                selectMenu("peach")
              }
              className="min-h-[320px] rounded-[2rem] bg-white p-10 text-center shadow-xl transition hover:scale-[1.02] active:scale-[0.98]"
            >

              <div className="mb-5 text-8xl">
                🍑
              </div>

              <h2 className="text-4xl font-bold text-[#3E2723]">
                복숭아 아이스티
              </h2>

              <p className="mt-4 text-2xl text-gray-500">
                시원하게 즐겨보세요
              </p>

            </button>

          </div>

          <button
            onClick={() => setStep("name")}
            className="mx-auto mt-7 block rounded-2xl px-7 py-4 text-xl text-gray-500 hover:bg-white"
          >
            ← 이름 다시 입력
          </button>

        </div>

      </main>
    );
  }

  // ==================================================
  // ④ 아메리카노 옵션
  // ==================================================

  if (step === "options") {
    return (
      <main className="min-h-screen bg-[#F8F5EF] px-6 py-8">

        <div className="mx-auto max-w-4xl">

          <div className="mb-7 text-center">

            <div className="text-7xl">
              ☕
            </div>

            <h1 className="mt-3 text-5xl font-bold text-[#3E2723]">
              아메리카노
            </h1>

            <p className="mt-4 text-2xl text-[#795548]">
              {name}님, 원하는 옵션을 선택해주세요.
            </p>

          </div>

          <section className="mb-6 rounded-[2rem] bg-white p-8 shadow-xl">

            <h2 className="mb-6 text-3xl font-bold text-gray-800">
              ① 온도를 선택해주세요
            </h2>

            <div className="grid grid-cols-2 gap-5">

              <button
                onClick={() =>
                  setTemperature("HOT")
                }
                className={`min-h-[180px] rounded-3xl border-4 p-7 text-center transition ${
                  temperature === "HOT"
                    ? "border-[#5D4037] bg-[#F3EAE4]"
                    : "border-gray-200 bg-white"
                }`}
              >

                <div className="text-7xl">
                  🔥
                </div>

                <div className="mt-3 text-3xl font-bold text-gray-800">
                  HOT
                </div>

              </button>

              <button
                onClick={() =>
                  setTemperature("ICE")
                }
                className={`min-h-[180px] rounded-3xl border-4 p-7 text-center transition ${
                  temperature === "ICE"
                    ? "border-[#5D4037] bg-[#F3EAE4]"
                    : "border-gray-200 bg-white"
                }`}
              >

                <div className="text-7xl">
                  🧊
                </div>

                <div className="mt-3 text-3xl font-bold text-gray-800">
                  ICE
                </div>

              </button>

            </div>

          </section>

          <section className="rounded-[2rem] bg-white p-8 shadow-xl">

            <h2 className="mb-6 text-3xl font-bold text-gray-800">
              ② 맛을 선택해주세요
            </h2>

            <div className="grid grid-cols-2 gap-5">

              <button
                onClick={() =>
                  setTaste("고소한 맛")
                }
                className={`min-h-[180px] rounded-3xl border-4 p-7 text-center transition ${
                  taste === "고소한 맛"
                    ? "border-[#5D4037] bg-[#F3EAE4]"
                    : "border-gray-200 bg-white"
                }`}
              >

                <div className="text-7xl">
                  🫘
                </div>

                <div className="mt-3 text-2xl font-bold text-gray-800">
                  고소한 맛
                </div>

              </button>

              <button
                onClick={() =>
                  setTaste("신맛")
                }
                className={`min-h-[180px] rounded-3xl border-4 p-7 text-center transition ${
                  taste === "신맛"
                    ? "border-[#5D4037] bg-[#F3EAE4]"
                    : "border-gray-200 bg-white"
                }`}
              >

                <div className="text-7xl">
                  🍋
                </div>

                <div className="mt-3 text-2xl font-bold text-gray-800">
                  신맛
                </div>

              </button>

            </div>

          </section>

          <div className="mt-7 flex gap-5">

            <button
              onClick={() =>
                setStep("menu")
              }
              className="flex-1 rounded-3xl bg-white py-6 text-2xl font-bold text-gray-600 shadow-xl"
            >
              ← 이전
            </button>

            <button
              onClick={handleOptionsNext}
              className="flex-1 rounded-3xl bg-[#5D4037] py-6 text-2xl font-bold text-white shadow-xl"
            >
              다음 →
            </button>

          </div>

        </div>

      </main>
    );
  }

  // ==================================================
  // ⑤ 수량
  // ==================================================

  if (step === "quantity") {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">

        <div className="w-full max-w-4xl">

          <div className="mb-8 text-center">

            <div className="text-8xl">
              {menu === "americano"
                ? "☕"
                : "🍑"}
            </div>

            <h1 className="mt-5 text-5xl font-bold text-[#3E2723]">
              수량을 선택해주세요
            </h1>

            <p className="mt-4 text-2xl text-[#795548]">
              {menu === "americano"
                ? `${temperature} · ${taste}`
                : "복숭아 아이스티"}
            </p>

          </div>

          <div className="rounded-[2rem] bg-white p-12 text-center shadow-xl">

            <div className="flex items-center justify-center gap-12">

              <button
                onClick={decreaseQuantity}
                className="h-24 w-24 rounded-full bg-gray-100 text-5xl font-bold text-gray-700 transition active:scale-90"
              >
                −
              </button>

              <div className="min-w-[120px] text-7xl font-bold text-[#3E2723]">
                {quantity}
              </div>

              <button
                onClick={increaseQuantity}
                className="h-24 w-24 rounded-full bg-[#5D4037] text-5xl font-bold text-white transition active:scale-90"
              >
                +
              </button>

            </div>

            <p className="mt-7 text-2xl text-gray-500">
              잔
            </p>

          </div>

          <div className="mt-7 flex gap-5">

            <button
              onClick={() =>
                setStep(
                  menu === "americano"
                    ? "options"
                    : "menu"
                )
              }
              className="flex-1 rounded-3xl bg-white py-6 text-2xl font-bold text-gray-600 shadow-xl"
            >
              ← 이전
            </button>

            <button
              onClick={() =>
                setStep("confirm")
              }
              className="flex-1 rounded-3xl bg-[#5D4037] py-6 text-2xl font-bold text-white shadow-xl"
            >
              주문 확인 →
            </button>

          </div>

        </div>

      </main>
    );
  }

  // ==================================================
  // ⑥ 주문 확인
  // ==================================================

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6 py-8">

      <div className="w-full max-w-4xl">

        <div className="mb-7 text-center">

          <div className="text-7xl">
            🧾
          </div>

          <h1 className="mt-4 text-5xl font-bold text-[#3E2723]">
            주문을 확인해주세요
          </h1>

        </div>

        <div className="rounded-[2rem] bg-white p-10 shadow-xl">

          <div className="border-b-2 border-gray-200 pb-7 text-center">

            <p className="text-xl text-gray-500">
              주문자
            </p>

            <p className="mt-2 text-4xl font-bold text-[#3E2723]">
              {name}님
            </p>

          </div>

          <div className="py-8">

            <div className="flex items-center justify-between">

              <span className="text-2xl text-gray-500">
                메뉴
              </span>

              <span className="text-2xl font-bold text-gray-800">
                {menu === "americano"
                  ? "☕ 아메리카노"
                  : "🍑 복숭아 아이스티"}
              </span>

            </div>

            {menu === "americano" && (
              <>
                <div className="mt-6 flex items-center justify-between">

                  <span className="text-2xl text-gray-500">
                    온도
                  </span>

                  <span className="text-2xl font-bold text-gray-800">
                    {temperature}
                  </span>

                </div>

                <div className="mt-6 flex items-center justify-between">

                  <span className="text-2xl text-gray-500">
                    맛
                  </span>

                  <span className="text-2xl font-bold text-gray-800">
                    {taste}
                  </span>

                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-between">

              <span className="text-2xl text-gray-500">
                수량
              </span>

              <span className="text-2xl font-bold text-gray-800">
                {quantity}잔
              </span>

            </div>

          </div>

          <div className="rounded-3xl bg-[#F8F5EF] p-7 text-center">

            <p className="text-xl text-gray-600">
              음료가 준비되면 교회 본당 TV 화면으로
              <br />
              알려드립니다.
            </p>

          </div>

          {errorMessage && (
            <div className="mt-6 rounded-2xl bg-red-50 p-5 text-center text-lg text-red-600">
              {errorMessage}
            </div>
          )}

          <div className="mt-7 flex gap-5">

            <button
              onClick={() =>
                setStep("quantity")
              }
              disabled={isSaving}
              className="flex-1 rounded-3xl bg-gray-100 py-6 text-2xl font-bold text-gray-600 disabled:opacity-50"
            >
              ← 수정
            </button>

            <button
              onClick={saveOrder}
              disabled={isSaving}
              className="flex-1 rounded-3xl bg-[#5D4037] py-6 text-2xl font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? "주문 저장 중..."
                : "주문하기"}
            </button>

          </div>

        </div>

        <button
          onClick={resetOrder}
          disabled={isSaving}
          className="mx-auto mt-7 block text-lg text-gray-400 underline disabled:opacity-50"
        >
          처음으로
        </button>

      </div>

    </main>
  );
}