"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: number;
  name: string;
  menu: string;
  quantity: number;
  status: string;
  created_at: string;
  call_count: number;
};

const CALL_SCREEN_TIME = 10000; // 10초
const DISPLAY_TIME = 10 * 60 * 1000; // 10분

// ==================================================
// 🔔 본당 TV 음료 완성 / 재호출 전용 알림음
// ==================================================
const playDrinkReadySound = () => {
  try {
    const audio = new Audio("/sounds/drink-ready.mp3");
    audio.volume = 1.0;
    audio.currentTime = 0;

    void audio.play().catch((error) => {
      console.error("drink-ready.mp3 재생 오류:", error);
    });
  } catch (error) {
    console.error("drink-ready.mp3 재생 오류:", error);
  }
};

export default function DisplayPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingOrder, setCallingOrder] =
    useState<Order | null>(null);

  // 현재 TV에서 확인한 호출 횟수
  const knownCallCounts = useRef<
    Map<number, number>
  >(new Map());

  // 처음 데이터를 불러오는 중인지
  const firstLoad = useRef(true);

  // 호출 화면 타이머
  const callTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ==================================================
  // 초기 데이터
  // ==================================================

  const fetchInitialOrders = async () => {
    const tenMinutesAgo = new Date(
      Date.now() - DISPLAY_TIME
    ).toISOString();

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, name, menu, quantity, status, created_at, call_count"
      )
      .eq("status", "completed")
      .gte("created_at", tenMinutesAgo)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "완료 주문 불러오기 오류:",
        error
      );

      setLoading(false);
      return;
    }

    const initialOrders =
      (data ?? []) as Order[];

    // 기존 주문은 호출하지 않도록
    // 현재 call_count만 기억
    initialOrders.forEach((order) => {
      knownCallCounts.current.set(
        order.id,
        order.call_count ?? 0
      );
    });

    setOrders(initialOrders);
    setLoading(false);
    firstLoad.current = false;
  };

  // ==================================================
  // 10분 지난 주문 제거
  // ==================================================

  const removeExpiredOrders = () => {
    const cutoff =
      Date.now() - DISPLAY_TIME;

    setOrders((currentOrders) =>
      currentOrders.filter(
        (order) =>
          new Date(
            order.created_at
          ).getTime() > cutoff
      )
    );
  };

  // ==================================================
  // 🔔 호출 화면
  // ==================================================

  const showCallScreen = (order: Order) => {
    // 알림음
    playDrinkReadySound();

    // 기존 타이머 제거
    if (callTimer.current) {
      clearTimeout(callTimer.current);
    }

    setCallingOrder(order);

    // 10초 후 원래 화면
    callTimer.current = setTimeout(() => {
      setCallingOrder(null);
    }, CALL_SCREEN_TIME);
  };

  // ==================================================
  // Realtime
  // ==================================================

  useEffect(() => {
    fetchInitialOrders();

    const channel = supabase
      .channel("display-orders")

      // ==============================================
      // 새 주문 INSERT
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

          // 새 주문이 바로 completed인 경우
          if (
            newOrder.status ===
            "completed"
          ) {
            knownCallCounts.current.set(
              newOrder.id,
              newOrder.call_count ?? 0
            );

            setOrders((currentOrders) => {
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
                newOrder,
                ...currentOrders,
              ];
            });

            // 초기 로딩 이후 들어온 주문이면 호출
            if (!firstLoad.current) {
              showCallScreen(newOrder);
            }
          }
        }
      )

      // ==============================================
      // 주문 UPDATE
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
          // pending → completed
          // 음료 완성
          // ==========================================

          if (
            updatedOrder.status ===
            "completed"
          ) {
            const previousCallCount =
              knownCallCounts.current.get(
                updatedOrder.id
              );

            const currentCallCount =
              updatedOrder.call_count ?? 0;

            // 완료 주문 목록에 추가
            setOrders((currentOrders) => {
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
            });

            // 새롭게 완료된 주문
            if (
              previousCallCount ===
              undefined
            ) {
              knownCallCounts.current.set(
                updatedOrder.id,
                currentCallCount
              );

              if (!firstLoad.current) {
                showCallScreen(
                  updatedOrder
                );
              }

              return;
            }

            // ========================================
            // 📢 다시 호출
            // ========================================

            if (
              currentCallCount >
              previousCallCount
            ) {
              knownCallCounts.current.set(
                updatedOrder.id,
                currentCallCount
              );

              showCallScreen(
                updatedOrder
              );

              return;
            }

            // 호출 횟수 외 변경
            knownCallCounts.current.set(
              updatedOrder.id,
              currentCallCount
            );

            return;
          }

          // ==========================================
          // completed → 다른 상태
          // ==========================================

          setOrders((currentOrders) =>
            currentOrders.filter(
              (order) =>
                order.id !==
                updatedOrder.id
            )
          );

          knownCallCounts.current.delete(
            updatedOrder.id
          );
        }
      )

      // ==============================================
      // DELETE
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

          setOrders((currentOrders) =>
            currentOrders.filter(
              (order) =>
                order.id !== deletedId
            )
          );

          knownCallCounts.current.delete(
            deletedId
          );
        }
      )

      .subscribe((status) => {
        console.log(
          "본당 TV Realtime 상태:",
          status
        );
      });

    // 30초마다 10분 지난 주문 정리
    const expiryInterval =
      setInterval(() => {
        removeExpiredOrders();
      }, 30000);

    return () => {
      clearInterval(expiryInterval);

      if (callTimer.current) {
        clearTimeout(
          callTimer.current
        );
      }

      supabase.removeChannel(
        channel
      );
    };
  }, []);

  // ==================================================
  // 🔔 전체 화면 호출
  // ==================================================

  if (callingOrder) {
    return (
      <main className="min-h-screen bg-[#5D4037] text-white flex items-center justify-center px-10">
        <div className="w-full max-w-[1600px] text-center">

          <div className="text-[10rem] leading-none">
            🔔
          </div>

          <p className="mt-8 text-5xl font-bold">
            음료가 나왔습니다!
          </p>

          <h1 className="mt-8 text-[9rem] font-black leading-none">
            {callingOrder.name}님
          </h1>

          <div className="mt-10 text-5xl font-bold">
            {callingOrder.menu}
          </div>

          <div className="mt-4 text-3xl font-medium opacity-90">
            {callingOrder.quantity}잔
          </div>

          <p className="mt-14 text-4xl font-bold">
            음료를 가져가 주세요 😊
          </p>

          <p className="mt-16 text-xl opacity-70">
            샬롬커피 · 주님의교회 청년청소년부
          </p>

        </div>
      </main>
    );
  }

  // ==================================================
  // 로딩
  // ==================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center">
        <div className="text-center">

          <div className="text-8xl">
            ☕
          </div>

          <h1 className="mt-8 text-6xl font-black text-[#3E2723]">
            샬롬커피
          </h1>

          <p className="mt-5 text-3xl text-gray-500">
            준비 중입니다...
          </p>

        </div>
      </main>
    );
  }

  // ==================================================
  // 일반 화면
  // ==================================================

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex flex-col">

      <header className="px-8 pt-8 text-center">

        <div className="text-6xl">
          ☕
        </div>

        <h1 className="mt-2 text-5xl font-black text-[#3E2723]">
          샬롬커피
        </h1>

        <p className="mt-3 text-2xl font-semibold text-[#795548]">
          주님의교회 청년청소년부
        </p>

      </header>

      <div className="flex flex-1 items-center justify-center px-8 py-8">

        {orders.length === 0 ? (

          <div className="w-full max-w-[1400px] rounded-[3rem] bg-white p-16 text-center shadow-xl">

            <div className="text-9xl">
              ☕
            </div>

            <h2 className="mt-8 text-6xl font-black text-[#3E2723]">
              음료를 준비하고 있습니다
            </h2>

            <p className="mt-6 text-3xl text-gray-500">
              음료가 준비되면 이 화면에 알려드립니다.
            </p>

          </div>

        ) : (

          <div className="w-full max-w-[1500px]">

            <div className="mb-8 text-center">

              <h2 className="text-4xl font-black text-[#3E2723]">
                음료가 준비되었습니다
              </h2>

              <p className="mt-3 text-2xl text-gray-500">
                아래 이름을 확인해주세요
              </p>

            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

              {orders.map((order) => (

                <div
                  key={order.id}
                  className="rounded-[2.5rem] bg-white p-8 text-center shadow-xl"
                >

                  <div className="text-6xl">
                    {order.menu ===
                    "아메리카노"
                      ? "☕"
                      : "🍑"}
                  </div>

                  <h3 className="mt-5 text-5xl font-black text-[#3E2723]">
                    {order.name}님
                  </h3>

                  <div className="mt-6 rounded-3xl bg-[#F8F5EF] px-6 py-5">

                    <p className="text-3xl font-black text-[#5D4037]">
                      {order.menu}
                    </p>

                    <p className="mt-2 text-2xl font-bold text-gray-500">
                      {order.quantity}잔
                    </p>

                  </div>

                  <p className="mt-5 text-2xl font-black text-[#795548]">
                    음료 나왔습니다!
                  </p>

                </div>

              ))}

            </div>

          </div>

        )}

      </div>

      <footer className="pb-6 text-center">

        <p className="text-lg text-gray-400">
          음료가 준비된 후 10분 동안 표시됩니다.
        </p>

      </footer>

    </main>
  );
}