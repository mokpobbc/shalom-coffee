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

const CALL_SCREEN_TIME = 10000;
const DISPLAY_TIME = 10 * 60 * 1000;

const playDrinkReadySound = () => {
  try {
    const audio = new Audio("/sounds/drink-ready.mp3");
    audio.volume = 1.0;
    audio.currentTime = 0;
    void audio.play().catch((error) => {
      console.error("음료 호출 알림음 재생 오류:", error);
    });
  } catch (error) {
    console.error("음료 호출 알림음 오류:", error);
  }
};

export default function DisplayPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingOrders, setCallingOrders] = useState<Order[] | null>(null);
  const pendingCalls = useRef<Order[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownCallCounts = useRef(new Map<number, number>());
  const firstLoad = useRef(true);

  const fetchInitialOrders = async () => {
    const cutoff = new Date(Date.now() - DISPLAY_TIME).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select("id, name, menu, quantity, status, created_at, call_count")
      .eq("status", "completed")
      .gte("completed_at", cutoff)
      .order("completed_at", { ascending: false });

    if (error) {
      console.error("완료 주문 불러오기 오류:", error);
      setLoading(false);
      return;
    }

    const initialOrders = (data ?? []) as Order[];
    initialOrders.forEach((order) => knownCallCounts.current.set(order.id, order.call_count ?? 0));
    setOrders(initialOrders);
    setLoading(false);
    firstLoad.current = false;
  };

  const showCallScreen = (batch: Order[]) => {
    if (batch.length === 0) return;
    if (callTimer.current) clearTimeout(callTimer.current);
    playDrinkReadySound();
    setCallingOrders(batch);
    callTimer.current = setTimeout(() => setCallingOrders(null), CALL_SCREEN_TIME);
  };

  const queueCall = (order: Order) => {
    if (pendingCalls.current.some((item) => item.id === order.id)) return;
    pendingCalls.current.push(order);
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => {
      const batch = [...pendingCalls.current];
      pendingCalls.current = [];
      batchTimer.current = null;
      showCallScreen(batch);
    }, 700);
  };

  useEffect(() => {
    fetchInitialOrders();

    const channel = supabase
      .channel("display-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as Order;
          if (newOrder.status !== "completed") return;
          knownCallCounts.current.set(newOrder.id, newOrder.call_count ?? 0);
          setOrders((current) => {
            if (current.some((order) => order.id === newOrder.id)) return current;
            return [newOrder, ...current];
          });
          if (!firstLoad.current) queueCall(newOrder);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updatedOrder = payload.new as Order;

          if (updatedOrder.status === "completed") {
            const previousCallCount = knownCallCounts.current.get(updatedOrder.id);
            const currentCallCount = updatedOrder.call_count ?? 0;
            const alreadyKnown = previousCallCount !== undefined;

            setOrders((current) => {
              const exists = current.some((order) => order.id === updatedOrder.id);
              return exists
                ? current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
                : [updatedOrder, ...current];
            });

            knownCallCounts.current.set(updatedOrder.id, currentCallCount);

            if (!firstLoad.current && (!alreadyKnown || currentCallCount > (previousCallCount ?? 0))) {
              queueCall(updatedOrder);
            }
            return;
          }

          setOrders((current) => current.filter((order) => order.id !== updatedOrder.id));
          knownCallCounts.current.delete(updatedOrder.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const deletedId = Number((payload.old as { id: number }).id);
          setOrders((current) => current.filter((order) => order.id !== deletedId));
          knownCallCounts.current.delete(deletedId);
        }
      )
      .subscribe((status) => console.log("본당 TV Realtime 상태:", status));

    const expiryInterval = setInterval(() => {
      const cutoff = Date.now() - DISPLAY_TIME;
      setOrders((current) => current.filter((order) => new Date(order.created_at).getTime() > cutoff));
    }, 30000);

    return () => {
      clearInterval(expiryInterval);
      if (batchTimer.current) clearTimeout(batchTimer.current);
      if (callTimer.current) clearTimeout(callTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  if (callingOrders && callingOrders.length > 0) {
    const names = callingOrders.map((order) => `${order.name}님`).join(" · ");
    return (
      <main className="min-h-screen bg-[#5D4037] text-white flex items-center justify-center px-10">
        <div className="w-full max-w-[1700px] text-center">
          <div className="text-[10rem] leading-none">🔔</div>
          <p className="mt-8 text-5xl font-bold">음료가 나왔습니다!</p>
          <h1 className="mt-10 text-[7rem] font-black leading-tight break-keep">{names}</h1>
          {callingOrders.length > 1 && (
            <p className="mt-6 text-3xl font-bold opacity-90">총 {callingOrders.length}분의 음료가 함께 나왔습니다.</p>
          )}
          <p className="mt-10 text-5xl font-bold">카운터에서 받아가 주세요 😊</p>
          <p className="mt-16 text-xl opacity-70">샬롬커피 · 주님의교회 청년청소년부</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center">
        <div className="text-center">
          <div className="text-8xl">☕</div>
          <h1 className="mt-8 text-6xl font-black text-[#3E2723]">샬롬커피</h1>
          <p className="mt-5 text-3xl text-gray-500">준비 중입니다...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F5EF] flex flex-col">
      <header className="px-8 pt-8 text-center">
        <div className="text-6xl">☕</div>
        <h1 className="mt-2 text-5xl font-black text-[#3E2723]">샬롬커피</h1>
        <p className="mt-3 text-2xl font-semibold text-[#795548]">주님의교회 청년청소년부</p>
      </header>
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        {orders.length === 0 ? (
          <div className="w-full max-w-[1400px] rounded-[3rem] bg-white p-16 text-center shadow-xl">
            <div className="text-9xl">☕</div>
            <h2 className="mt-8 text-6xl font-black text-[#3E2723]">음료를 준비하고 있습니다</h2>
            <p className="mt-6 text-3xl text-gray-500">음료가 준비되면 이 화면에 알려드립니다.</p>
          </div>
        ) : (
          <div className="w-full max-w-[1500px]">
            <div className="mb-8 text-center">
              <h2 className="text-4xl font-black text-[#3E2723]">음료가 준비되었습니다</h2>
              <p className="mt-3 text-2xl text-gray-500">아래 이름을 확인해주세요</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-[2.5rem] bg-white p-8 text-center shadow-xl">
                  <div className="text-6xl">{order.menu === "아메리카노" ? "☕" : "🍎"}</div>
                  <h3 className="mt-5 text-5xl font-black text-[#3E2723]">{order.name}님</h3>
                  <div className="mt-6 rounded-3xl bg-[#F8F5EF] px-6 py-5">
                    <p className="text-3xl font-black text-[#5D4037]">{order.menu}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-500">{order.quantity}잔</p>
                  </div>
                  <p className="mt-5 text-2xl font-black text-[#795548]">음료 나왔습니다!</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="pb-6 text-center">
        <p className="text-lg text-gray-400">음료가 준비된 후 10분 동안 표시됩니다.</p>
      </footer>
    </main>
  );
}
