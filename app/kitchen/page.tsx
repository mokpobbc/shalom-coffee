"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: number;
  name: string;
  menu: string;
  temperature: string | null;
  taste: string | null;
  quantity: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  call_count: number;
};

// ==================================================
// 🔊 새 주문 MP3 알림음
// ==================================================

const playNewOrderSound = () => {
  try {
    const audio = new Audio("/sounds/new-order.mp3");

    audio.volume = 1.0;
    audio.currentTime = 0;

    audio.play().catch((error) => {
      console.error("새 주문 알림음 재생 오류:", error);
    });
  } catch (error) {
    console.error("새 주문 알림음 오류:", error);
  }
};

// ==================================================
// ⏰ 주문 시간 표시
// ==================================================

const getOrderTime = (createdAt: string) => {
  const date = new Date(createdAt);

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getElapsedTime = (createdAt: string) => {
  const diff = Date.now() - new Date(createdAt).getTime();

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}분 전`;
  }

  return `${seconds}초 전`;
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [makingOrders, setMakingOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [recallingId, setRecallingId] = useState<number | null>(null);
  const [pickupId, setPickupId] = useState<number | null>(null);

  // 시간 표시를 갱신하기 위한 상태
  const [, setCurrentTime] = useState(Date.now());

  // ==================================================
  // 초기 데이터
  // ==================================================

  const fetchInitialData = async () => {
    const tenMinutesAgo = new Date(
      Date.now() - 10 * 60 * 1000
    ).toISOString();

    const [pendingResult, makingResult, completedResult] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("status", "pending")
        .order("created_at", {
          ascending: true,
        }),

      supabase
        .from("orders")
        .select("*")
        .eq("status", "making")
        .order("created_at", { ascending: true }),

      supabase
        .from("orders")
        .select("*")
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .gte("completed_at", tenMinutesAgo)
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (pendingResult.error) {
      console.error(
        "주문 불러오기 오류:",
        pendingResult.error
      );
    } else {
      setOrders(pendingResult.data ?? []);
    }

    if (makingResult.error) {
      console.error("제조 중 주문 불러오기 오류:", makingResult.error);
    } else {
      setMakingOrders(makingResult.data ?? []);
    }

    if (completedResult.error) {
      console.error(
        "완료 주문 불러오기 오류:",
        completedResult.error
      );
    } else {
      setCompletedOrders(
        completedResult.data ?? []
      );
    }

    setLoading(false);
  };

  // ==================================================
  // 완료 주문 10분 만료 정리
  // ==================================================

  const removeExpiredCompletedOrders = () => {
    const tenMinutesAgo =
      Date.now() - 10 * 60 * 1000;

    setCompletedOrders(
      (currentOrders) =>
        currentOrders.filter(
          (order) =>
            order.completed_at &&
            new Date(
              order.completed_at
            ).getTime() > tenMinutesAgo
        )
    );
  };

  // ==================================================
  // Realtime
  // ==================================================

  useEffect(() => {
    fetchInitialData();

    // ----------------------------------------------
    // ⏰ 주문 시간 실시간 갱신
    // ----------------------------------------------

    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    // ----------------------------------------------
    // Supabase Realtime
    // ----------------------------------------------

    const channel = supabase
      .channel("kitchen-orders")

      // ==============================================
      // 새 주문
      // ==============================================

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const newOrder =
            payload.new as Order;

          if (
            newOrder.status === "pending"
          ) {
            // 🔊 새 주문 MP3
            playNewOrderSound();

            setOrders(
              (currentOrders) => {
                // 중복 방지
                if (
                  currentOrders.some(
                    (order) =>
                      order.id ===
                      newOrder.id
                  )
                ) {
                  return currentOrders;
                }

                return [
                  ...currentOrders,
                  newOrder,
                ].sort(
                  (a, b) =>
                    new Date(
                      a.created_at
                    ).getTime() -
                    new Date(
                      b.created_at
                    ).getTime()
                );
              }
            );
          }
        }
      )

      // ==============================================
      // 주문 업데이트
      // ==============================================

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const updatedOrder =
            payload.new as Order;

          // ==========================================
          // pending → making (주문 확인)
          // ==========================================

          if (updatedOrder.status === "making") {
            setOrders((currentOrders) =>
              currentOrders.filter(
                (order) => order.id !== updatedOrder.id
              )
            );

            setMakingOrders((currentOrders) => {
              const exists = currentOrders.some(
                (order) => order.id === updatedOrder.id
              );

              if (exists) {
                return currentOrders.map((order) =>
                  order.id === updatedOrder.id
                    ? updatedOrder
                    : order
                );
              }

              return [...currentOrders, updatedOrder].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              );
            });

            return;
          }

          // ==========================================
          // making → completed (음료 완성)
          // ==========================================

          if (
            updatedOrder.status ===
            "completed"
          ) {
            // 제조 대기에서 즉시 제거
            setOrders(
              (currentOrders) =>
                currentOrders.filter(
                  (order) =>
                    order.id !==
                    updatedOrder.id
                )
            );

            setMakingOrders((currentOrders) =>
              currentOrders.filter(
                (order) => order.id !== updatedOrder.id
              )
            );

            // 완료 목록에 추가
            setCompletedOrders(
              (currentOrders) => {
                const exists =
                  currentOrders.some(
                    (order) =>
                      order.id ===
                      updatedOrder.id
                  );

                if (exists) {
                  return currentOrders.map(
                    (order) =>
                      order.id ===
                      updatedOrder.id
                        ? updatedOrder
                        : order
                  );
                }

                return [
                  updatedOrder,
                  ...currentOrders,
                ];
              }
            );

            return;
          }

          // ==========================================
          // completed → 다른 상태
          // ==========================================

          setCompletedOrders(
            (currentOrders) =>
              currentOrders.filter(
                (order) =>
                  order.id !==
                  updatedOrder.id
              )
          );

          // ==========================================
          // pending 주문 변경
          // ==========================================

          if (
            updatedOrder.status ===
            "pending"
          ) {
            setOrders(
              (currentOrders) =>
                currentOrders.map(
                  (order) =>
                    order.id ===
                    updatedOrder.id
                      ? updatedOrder
                      : order
                )
            );
          }
        }
      )

      // ==============================================
      // 주문 삭제
      // ==============================================

      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const deletedId =
            Number(payload.old.id);

          setOrders(
            (currentOrders) =>
              currentOrders.filter(
                (order) =>
                  order.id !==
                  deletedId
              )
          );

          setMakingOrders(
            (currentOrders) =>
              currentOrders.filter(
                (order) =>
                  order.id !==
                  deletedId
              )
          );

          setCompletedOrders(
            (currentOrders) =>
              currentOrders.filter(
                (order) =>
                  order.id !==
                  deletedId
              )
          );
        }
      )

      .subscribe((status) => {
        console.log(
          "주문 Realtime 상태:",
          status
        );
      });

    // 30초마다 10분 지난 완료 주문 제거
    const expiryInterval =
      setInterval(() => {
        removeExpiredCompletedOrders();
      }, 30000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(expiryInterval);
      supabase.removeChannel(
        channel
      );
    };
  }, []);

  // ==================================================
  // 👀 주문 확인 / 제조 시작
  // pending → making
  // ==================================================

  const startMakingOrder = async (id: number) => {
    setUpdatingId(id);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "making",
      })
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      console.error("주문 확인 처리 오류:", error);
      alert("주문 확인 처리에 실패했습니다.");
      setUpdatingId(null);
      return;
    }

    setOrders((currentOrders) =>
      currentOrders.filter((order) => order.id !== id)
    );

    const confirmedOrder = orders.find((order) => order.id === id);

    if (confirmedOrder) {
      setMakingOrders((currentOrders) => [
        ...currentOrders,
        {
          ...confirmedOrder,
          status: "making",
        },
      ]);
    }

    setUpdatingId(null);
  };

  // ==================================================
  // 음료 완성
  // ==================================================

  const completeOrder = async (
    id: number
  ) => {
    setUpdatingId(id);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        call_count: 0,
      })
      .eq("id", id);

    if (error) {
      console.error(
        "주문 완료 처리 오류:",
        error
      );

      alert(
        "주문 완료 처리에 실패했습니다."
      );

      setUpdatingId(null);
      return;
    }

    // 화면에서 즉시 제거
    setOrders(
      (currentOrders) =>
        currentOrders.filter(
          (order) =>
            order.id !== id
        )
    );

    setUpdatingId(null);
  };

  // ==================================================
  // ☕ 수령 완료
  // ==================================================

  const pickupOrder = async (id: number) => {
    setPickupId(id);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "picked_up",
      })
      .eq("id", id)
      .eq("status", "completed");

    if (error) {
      console.error(
        "수령 완료 처리 오류:",
        error
      );

      alert(
        "수령 완료 처리에 실패했습니다."
      );

      setPickupId(null);
      return;
    }

    setCompletedOrders(
      (currentOrders) =>
        currentOrders.filter(
          (order) => order.id !== id
        )
    );

    setPickupId(null);
  };

  // ==================================================
  // 📢 다시 호출
  // ==================================================

  const recallOrder = async (
    order: Order
  ) => {
    setRecallingId(order.id);

    const newCallCount =
      (order.call_count ?? 0) + 1;

    const { error } = await supabase
      .from("orders")
      .update({
        call_count: newCallCount,
      })
      .eq("id", order.id)
      .eq("status", "completed");

    if (error) {
      console.error(
        "재호출 오류:",
        error
      );

      alert(
        "재호출에 실패했습니다."
      );

      setRecallingId(null);
      return;
    }

    // 화면 즉시 반영
    setCompletedOrders(
      (currentOrders) =>
        currentOrders.map(
          (currentOrder) =>
            currentOrder.id ===
            order.id
              ? {
                  ...currentOrder,
                  call_count:
                    newCallCount,
                }
              : currentOrder
        )
    );

    setRecallingId(null);
  };

  // ==================================================
  // 화면
  // ==================================================

  return (
    <main className="min-h-screen bg-[#F8F5EF] px-6 py-8">
      <div className="mx-auto max-w-7xl">

        {/* =========================
            상단
        ========================= */}

        <header className="mb-8">
          <div className="flex items-center justify-between">

            <div>
              <div className="flex items-center gap-3">

                <span className="text-5xl">
                  ☕
                </span>

                <h1 className="text-4xl font-bold text-[#3E2723]">
                  샬롬커피
                </h1>

              </div>

              <p className="mt-3 text-xl text-gray-500">
                제조자 주문 확인
              </p>
            </div>

            <div className="rounded-2xl bg-white px-6 py-4 shadow">

              <p className="text-sm text-gray-500">
                현재 주문
              </p>

              <p className="mt-1 text-3xl font-bold text-[#5D4037]">
                {orders.length}건
              </p>

            </div>

          </div>
        </header>

        {/* =========================
            제조 대기
        ========================= */}

        <section>

          <div className="mb-5 flex items-center justify-between">

            <h2 className="text-2xl font-bold text-[#3E2723]">
              👨‍🍳 제조 대기
            </h2>

            <span className="text-gray-500">
              {orders.length}건
            </span>

          </div>

          {loading ? (

            <div className="rounded-3xl bg-white p-12 text-center shadow-xl">

              <div className="text-5xl">
                ☕
              </div>

              <p className="mt-5 text-2xl font-bold text-gray-700">
                주문을 불러오는 중...
              </p>

            </div>

          ) : orders.length === 0 ? (

            <div className="rounded-3xl bg-white p-12 text-center shadow-xl">

              <div className="text-6xl">
                ☕
              </div>

              <h2 className="mt-5 text-2xl font-bold text-gray-700">
                현재 들어온 주문이 없습니다.
              </h2>

              <p className="mt-2 text-lg text-gray-400">
                새로운 주문이 들어오면 자동으로 표시됩니다.
              </p>

            </div>

          ) : (

            <div className="grid gap-6 md:grid-cols-2">

              {orders.map((order) => (

                <div
                  key={order.id}
                  className="rounded-[2rem] bg-white p-8 shadow-xl"
                >

                  {/* 주문자 */}

                  <div className="flex items-center justify-between border-b-2 border-gray-100 pb-5">

                    <div>

                      <p className="text-sm font-medium text-gray-400">
                        주문자
                      </p>

                      <h2 className="mt-1 text-3xl font-bold text-[#3E2723]">
                        {order.name}님
                      </h2>

                    </div>

                    <div className="rounded-full bg-[#F3EAE4] px-4 py-2 text-sm font-bold text-[#5D4037]">
                      제조 대기
                    </div>

                  </div>

                  {/* 주문 시간 */}

                  <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#FFF8F3] px-5 py-4">

                    <div>
                      <p className="text-sm text-gray-400">
                        주문 시간
                      </p>

                      <p className="mt-1 text-xl font-bold text-[#5D4037]">
                        {getOrderTime(
                          order.completed_at ?? order.created_at
                        )}
                      </p>
                    </div>

                    <div className="rounded-full bg-[#F3EAE4] px-4 py-2 text-base font-bold text-[#795548]">
                      {getElapsedTime(
                        order.created_at
                      )}
                    </div>

                  </div>

                  {/* 메뉴 */}

                  <div className="py-7">

                    <div className="flex items-center gap-4">

                      <span className="text-6xl">
                        {order.menu ===
                        "아메리카노"
                          ? "☕"
                          : "🍑"}
                      </span>

                      <div>

                        <h3 className="text-3xl font-bold text-gray-800">
                          {order.menu}
                        </h3>

                        <p className="mt-2 text-xl text-gray-500">

                          {order.menu ===
                          "아메리카노"
                            ? `${order.temperature} · ${order.taste}`
                            : "복숭아 아이스티"}

                        </p>

                      </div>

                    </div>

                    {/* 수량 */}

                    <div className="mt-7 flex items-center justify-between rounded-2xl bg-[#F8F5EF] px-6 py-5">

                      <span className="text-xl text-gray-500">
                        수량
                      </span>

                      <span className="text-3xl font-bold text-[#3E2723]">
                        {order.quantity}잔
                      </span>

                    </div>

                  </div>

                  {/* 완성 버튼 */}

                  <button
                    onClick={() =>
                      startMakingOrder(order.id)
                    }
                    disabled={updatingId === order.id}
                    className="w-full rounded-2xl bg-[#5D4037] py-6 text-2xl font-bold text-white transition hover:bg-[#4E342E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingId === order.id
                      ? "확인 중..."
                      : "👀 주문 확인"}
                  </button>

                </div>

              ))}

            </div>

          )}

        </section>

        {/* =========================
            제조 중
        ========================= */}
        {makingOrders.length > 0 && (
          <section className="mt-12">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[#3E2723]">
                  👨‍🍳 제조 중
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  주문 확인 후 제조 중인 음료입니다.
                </p>
              </div>

              <span className="text-gray-500">
                {makingOrders.length}건
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {makingOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[2rem] bg-white p-7 shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">제조 중</p>
                      <h3 className="mt-1 text-3xl font-bold text-[#3E2723]">
                        {order.name}님
                      </h3>
                    </div>
                    <span className="rounded-full bg-[#F3EAE4] px-4 py-2 text-sm font-bold text-[#5D4037]">
                      제조 중
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl bg-[#F8F5EF] p-5">
                    <div className="flex items-center gap-4">
                      <span className="text-5xl">
                        {order.menu === "아메리카노" ? "☕" : "🍑"}
                      </span>
                      <div>
                        <p className="text-2xl font-bold text-gray-800">
                          {order.menu}
                        </p>
                        <p className="mt-1 text-gray-500">
                          {order.menu === "아메리카노"
                            ? `${order.temperature} · ${order.taste}`
                            : "복숭아 아이스티"}
                        </p>
                        <p className="mt-2 text-lg font-bold text-gray-700">
                          {order.quantity}잔
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => completeOrder(order.id)}
                    disabled={updatingId === order.id}
                    className="mt-5 w-full rounded-2xl bg-[#5D4037] py-5 text-xl font-bold text-white transition hover:bg-[#4E342E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingId === order.id
                      ? "처리 중..."
                      : "✅ 음료 완성"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =========================
            최근 완료
        ========================= */}

        <section className="mt-12">

          <div className="mb-5 flex items-center justify-between">

            <div>

              <h2 className="text-2xl font-bold text-[#3E2723]">
                📢 음료 나옴
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                완료 후 10분 동안 재호출할 수 있습니다.
              </p>

            </div>

            <span className="text-gray-500">
              {completedOrders.length}건
            </span>

          </div>

          {completedOrders.length === 0 ? (

            <div className="rounded-3xl bg-white p-10 text-center shadow">

              <p className="text-lg text-gray-400">
                최근 완성된 음료가 없습니다.
              </p>

            </div>

          ) : (

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

              {completedOrders.map(
                (order) => (

                  <div
                    key={order.id}
                    className="rounded-[2rem] bg-white p-7 shadow-lg"
                  >

                    <div className="flex items-center justify-between">

                      <div>

                        <p className="text-sm text-gray-400">
                          음료 완성
                        </p>

                        <h3 className="mt-1 text-3xl font-bold text-[#3E2723]">
                          {order.name}님
                        </h3>

                      </div>

                      <span className="text-5xl">
                        {order.menu ===
                        "아메리카노"
                          ? "☕"
                          : "🍑"}
                      </span>

                    </div>

                    {/* 완료 시간 */}

                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FFF8F3] px-4 py-3">

                      <span className="text-sm text-gray-400">
                        완료 시간
                      </span>

                      <span className="font-bold text-[#795548]">
                        {getOrderTime(
                          order.completed_at ?? order.created_at
                        )}
                      </span>

                    </div>

                    <div className="mt-5 rounded-2xl bg-[#F8F5EF] p-5">

                      <p className="text-xl font-bold text-[#5D4037]">
                        {order.menu}
                      </p>

                      {order.menu ===
                        "아메리카노" && (
                        <p className="mt-1 text-gray-500">
                          {order.temperature} ·{" "}
                          {order.taste}
                        </p>
                      )}

                      <p className="mt-2 text-lg font-bold text-gray-700">
                        {order.quantity}잔
                      </p>

                    </div>

                    {/* 재호출 */}

                    <button
                      onClick={() =>
                        recallOrder(
                          order
                        )
                      }
                      disabled={
                        recallingId ===
                        order.id
                      }
                      className="mt-5 w-full rounded-2xl border-2 border-[#5D4037] bg-white py-5 text-xl font-bold text-[#5D4037] transition hover:bg-[#F3EAE4] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >

                      {recallingId ===
                      order.id
                        ? "호출 중..."
                        : "📢 다시 호출"}

                    </button>

                    {order.call_count >
                      0 && (
                      <p className="mt-3 text-center text-sm text-gray-400">
                        다시 호출{" "}
                        {order.call_count}
                        회
                      </p>
                    )}

                    {/* 수령 완료 */}

                    <button
                      onClick={() =>
                        pickupOrder(order.id)
                      }
                      disabled={
                        pickupId === order.id
                      }
                      className="mt-3 w-full rounded-2xl bg-[#6D4C41] py-5 text-xl font-bold text-white transition hover:bg-[#5D4037] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pickupId === order.id
                        ? "처리 중..."
                        : "☕ 수령 완료"}
                    </button>

                  </div>

                )
              )}

            </div>

          )}

        </section>

        <p className="mt-10 text-center text-sm text-gray-400">
          ⚡ 주문 변경사항은 실시간으로 반영됩니다.
        </p>

      </div>
    </main>
  );
}