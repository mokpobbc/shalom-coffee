"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderStatus = "pending" | "confirmed" | "preparing" | "completed" | "picked_up";

type Order = {
  id: number;
  name: string;
  menu: string;
  temperature: string | null;
  taste: string | null;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  completed_at?: string | null;
  call_count: number;
};

const playNewOrderSound = () => {
  try {
    const audio = new Audio("/sounds/new-order.mp3");
    audio.volume = 1.0;
    audio.currentTime = 0;
    void audio.play().catch((error) => {
      console.error("새 주문 알림음 재생 오류:", error);
    });
  } catch (error) {
    console.error("새 주문 알림음 오류:", error);
  }
};

const getOrderTime = (createdAt: string) =>
  new Date(createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

const getElapsedTime = (createdAt: string) => {
  const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 전` : `${seconds}초 전`;
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [pickupId, setPickupId] = useState<number | null>(null);
  const [recallingId, setRecallingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, setCurrentTime] = useState(Date.now());

  const fetchData = async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [activeResult, completedResult] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .in("status", ["pending", "confirmed", "preparing"])
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("*")
        .eq("status", "completed")
        .gte("completed_at", tenMinutesAgo)
        .order("completed_at", { ascending: false }),
    ]);

    if (activeResult.error) {
      console.error("주문 불러오기 오류:", activeResult.error);
    } else {
      setOrders((activeResult.data ?? []) as Order[]);
    }

    if (completedResult.error) {
      console.error("완료 주문 불러오기 오류:", completedResult.error);
    } else {
      setCompletedOrders((completedResult.data ?? []) as Order[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const timeInterval = setInterval(() => setCurrentTime(Date.now()), 1000);

    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as Order;
          if (newOrder.status === "pending") playNewOrderSound();
          setOrders((current) => {
            if (current.some((order) => order.id === newOrder.id)) return current;
            if (!["pending", "confirmed", "preparing"].includes(newOrder.status)) return current;
            return [...current, newOrder].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updatedOrder = payload.new as Order;
          setOrders((current) => {
            const active = ["pending", "confirmed", "preparing"].includes(updatedOrder.status);
            const exists = current.some((order) => order.id === updatedOrder.id);
            if (!active) return current.filter((order) => order.id !== updatedOrder.id);
            return exists
              ? current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
              : [...current, updatedOrder].sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
          });

          if (updatedOrder.status === "completed") {
            setCompletedOrders((current) => {
              const exists = current.some((order) => order.id === updatedOrder.id);
              return exists
                ? current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
                : [updatedOrder, ...current];
            });
          } else if (updatedOrder.status === "picked_up") {
            setCompletedOrders((current) => current.filter((order) => order.id !== updatedOrder.id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const deletedId = Number((payload.old as { id: number }).id);
          setOrders((current) => current.filter((order) => order.id !== deletedId));
          setCompletedOrders((current) => current.filter((order) => order.id !== deletedId));
          setSelectedIds((current) => current.filter((id) => id !== deletedId));
        }
      )
      .subscribe((status) => console.log("주문 Realtime 상태:", status));

    const expiryInterval = setInterval(() => {
      setCompletedOrders((current) =>
        current.filter(
          (order) =>
            order.completed_at &&
            new Date(order.completed_at).getTime() > Date.now() - 10 * 60 * 1000
        )
      );
    }, 30000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(expiryInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (id: number, status: OrderStatus) => {
    setUpdatingId(id);
    const updates: Partial<Order> = { status };
    if (status === "completed") {
      updates.completed_at = new Date().toISOString();
      updates.call_count = 0;
    }

    const { error } = await supabase.from("orders").update(updates).eq("id", id);
    if (error) {
      console.error("주문 상태 변경 오류:", error);
      alert("주문 상태 변경에 실패했습니다.");
      setUpdatingId(null);
      return;
    }

    setOrders((current) =>
      status === "completed" || status === "picked_up"
        ? current.filter((order) => order.id !== id)
        : current.map((order) => (order.id === id ? { ...order, status } : order))
    );
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
    setUpdatingId(null);
  };

  const completeSelectedOrders = async () => {
    if (selectedIds.length === 0) return;
    setBulkUpdating(true);
    const ids = [...selectedIds];
    const completedAt = new Date().toISOString();

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: completedAt, call_count: 0 })
      .in("id", ids)
      .in("status", ["confirmed", "preparing"]);

    if (error) {
      console.error("선택 주문 완료 처리 오류:", error);
      alert("선택한 주문 완료 처리에 실패했습니다.");
      setBulkUpdating(false);
      return;
    }

    setOrders((current) => current.filter((order) => !ids.includes(order.id)));
    setSelectedIds([]);
    await fetchData();
    setBulkUpdating(false);
  };

  const pickupOrder = async (id: number) => {
    setPickupId(id);
    const { error } = await supabase
      .from("orders")
      .update({ status: "picked_up" })
      .eq("id", id)
      .eq("status", "completed");

    if (error) {
      console.error("수령 완료 처리 오류:", error);
      alert("수령 완료 처리에 실패했습니다.");
      setPickupId(null);
      return;
    }

    setCompletedOrders((current) => current.filter((order) => order.id !== id));
    setPickupId(null);
  };

  const recallOrder = async (order: Order) => {
    setRecallingId(order.id);
    const newCallCount = (order.call_count ?? 0) + 1;
    const { error } = await supabase
      .from("orders")
      .update({ call_count: newCallCount })
      .eq("id", order.id)
      .eq("status", "completed");

    if (error) {
      console.error("재호출 오류:", error);
      alert("재호출에 실패했습니다.");
      setRecallingId(null);
      return;
    }

    setCompletedOrders((current) =>
      current.map((item) => (item.id === order.id ? { ...item, call_count: newCallCount } : item))
    );
    setRecallingId(null);
  };

  const activeOrders = orders;
  const confirmOrders = activeOrders.filter((order) => order.status === "pending");
  const preparingOrders = activeOrders.filter(
    (order) => order.status === "confirmed" || order.status === "preparing"
  );

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleAllPreparing = () => {
    const ids = preparingOrders.map((order) => order.id);
    setSelectedIds((current) => (ids.every((id) => current.includes(id)) ? [] : ids));
  };

  return (
    <main className="min-h-screen bg-[#F8F5EF] px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-5xl">☕</span>
              <h1 className="text-4xl font-bold text-[#3E2723]">샬롬커피</h1>
            </div>
            <p className="mt-3 text-xl text-gray-500">제조자 주문 확인</p>
          </div>
          <div className="rounded-2xl bg-white px-6 py-4 shadow">
            <p className="text-sm text-gray-500">현재 주문</p>
            <p className="mt-1 text-3xl font-bold text-[#5D4037]">{activeOrders.length}건</p>
          </div>
        </header>

        {loading ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-xl">
            <div className="text-6xl">☕</div>
            <p className="mt-5 text-2xl font-bold text-gray-700">주문을 불러오는 중...</p>
          </div>
        ) : (
          <>
            <section>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[#3E2723]">🧾 주문 확인</h2>
                <span className="text-gray-500">{confirmOrders.length}건</span>
              </div>

              {confirmOrders.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center shadow">
                  <p className="text-lg text-gray-400">확인할 새 주문이 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {confirmOrders.map((order) => (
                    <div key={order.id} className="rounded-[2rem] bg-white p-8 shadow-xl">
                      <div className="flex items-center justify-between border-b-2 border-gray-100 pb-5">
                        <div>
                          <p className="text-sm text-gray-400">주문자</p>
                          <h2 className="mt-1 text-3xl font-bold text-[#3E2723]">{order.name}님</h2>
                        </div>
                        <div className="rounded-full bg-[#FFF3E8] px-4 py-2 text-sm font-bold text-[#5D4037]">
                          새 주문
                        </div>
                      </div>
                      <div className="py-6">
                        <div className="flex items-center gap-4">
                          <span className="text-6xl">{order.menu === "아메리카노" ? "☕" : "🍎"}</span>
                          <div>
                            <h3 className="text-3xl font-bold text-gray-800">{order.menu}</h3>
                            <p className="mt-2 text-xl text-gray-500">
                              {order.menu === "아메리카노" ? `${order.temperature} · ${order.taste}` : "바로 준비"}
                            </p>
                            <p className="mt-2 text-lg font-bold text-gray-700">{order.quantity}잔 · {getOrderTime(order.created_at)}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => updateStatus(order.id, "confirmed")}
                        disabled={updatingId === order.id}
                        className="w-full rounded-2xl bg-[#5D4037] py-6 text-2xl font-bold text-white disabled:opacity-50"
                      >
                        {updatingId === order.id ? "처리 중..." : "✅ 주문 확인"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-12">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-[#3E2723]">👨‍🍳 제조 중</h2>
                  <p className="mt-1 text-sm text-gray-400">완성한 주문은 여러 개를 선택해서 한 번에 호출할 수 있습니다.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleAllPreparing}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#5D4037] shadow"
                  >
                    {preparingOrders.length > 0 && preparingOrders.every((order) => selectedIds.includes(order.id)) ? "전체 해제" : "전체 선택"}
                  </button>
                  <span className="text-gray-500">{preparingOrders.length}건</span>
                </div>
              </div>

              {preparingOrders.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center shadow">
                  <p className="text-lg text-gray-400">제조 중인 주문이 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {preparingOrders.map((order) => (
                    <div key={order.id} className={`rounded-[2rem] bg-white p-8 shadow-xl ${selectedIds.includes(order.id) ? "ring-4 ring-[#5D4037]" : ""}`}>
                      <div className="flex items-start justify-between gap-4">
                        <label className="flex cursor-pointer items-start gap-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(order.id)}
                            onChange={() => toggleSelected(order.id)}
                            className="mt-1 h-8 w-8 accent-[#5D4037]"
                          />
                          <div>
                            <p className="text-sm text-gray-400">주문자</p>
                            <h2 className="mt-1 text-3xl font-bold text-[#3E2723]">{order.name}님</h2>
                            <p className="mt-2 text-base text-gray-400">{getElapsedTime(order.created_at)}</p>
                          </div>
                        </label>
                        <div className="rounded-full bg-[#F3EAE4] px-4 py-2 text-sm font-bold text-[#5D4037]">{order.status === "confirmed" ? "제조 준비" : "제조 중"}</div>
                      </div>
                      <div className="mt-6 flex items-center gap-4 border-t pt-6">
                        <span className="text-6xl">{order.menu === "아메리카노" ? "☕" : "🍎"}</span>
                        <div>
                          <h3 className="text-3xl font-bold text-gray-800">{order.menu}</h3>
                          <p className="mt-2 text-xl text-gray-500">
                            {order.menu === "아메리카노" ? `${order.temperature} · ${order.taste}` : "바로 준비"}
                          </p>
                          <p className="mt-2 text-xl font-bold text-gray-700">{order.quantity}잔</p>
                        </div>
                      </div>
                      {order.status === "confirmed" ? (
                        <button
                          onClick={() => updateStatus(order.id, "preparing")}
                          disabled={updatingId === order.id}
                          className="mt-6 w-full rounded-2xl bg-[#795548] py-5 text-xl font-bold text-white disabled:opacity-50"
                        >
                          {updatingId === order.id ? "처리 중..." : "▶ 제조 시작"}
                        </button>
                      ) : (
                        <p className="mt-6 rounded-2xl bg-[#F8F5EF] py-4 text-center text-lg font-bold text-[#795548]">제조 중입니다</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={completeSelectedOrders}
                disabled={selectedIds.length === 0 || bulkUpdating}
                className="mt-6 w-full rounded-2xl bg-[#5D4037] py-6 text-2xl font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkUpdating ? "완료 처리 중..." : `✅ 선택한 ${selectedIds.length}개 음료 완성`}
              </button>
            </section>

            <section className="mt-12">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-[#3E2723]">📢 음료 나옴</h2>
                  <p className="mt-1 text-sm text-gray-400">완료 후 10분 동안 재호출할 수 있습니다.</p>
                </div>
                <span className="text-gray-500">{completedOrders.length}건</span>
              </div>

              {completedOrders.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center shadow">
                  <p className="text-lg text-gray-400">최근 완성된 음료가 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {completedOrders.map((order) => (
                    <div key={order.id} className="rounded-[2rem] bg-white p-7 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">음료 완성</p>
                          <h3 className="mt-1 text-3xl font-bold text-[#3E2723]">{order.name}님</h3>
                        </div>
                        <span className="text-5xl">{order.menu === "아메리카노" ? "☕" : "🍎"}</span>
                      </div>
                      <div className="mt-5 rounded-2xl bg-[#F8F5EF] p-5">
                        <p className="text-xl font-bold text-[#5D4037]">{order.menu}</p>
                        {order.menu === "아메리카노" && <p className="mt-1 text-gray-500">{order.temperature} · {order.taste}</p>}
                        <p className="mt-2 text-lg font-bold text-gray-700">{order.quantity}잔</p>
                      </div>
                      <button
                        onClick={() => recallOrder(order)}
                        disabled={recallingId === order.id}
                        className="mt-5 w-full rounded-2xl border-2 border-[#5D4037] bg-white py-5 text-xl font-bold text-[#5D4037] disabled:opacity-50"
                      >
                        {recallingId === order.id ? "호출 중..." : "📢 다시 호출"}
                      </button>
                      <button
                        onClick={() => pickupOrder(order.id)}
                        disabled={pickupId === order.id}
                        className="mt-3 w-full rounded-2xl bg-[#795548] py-5 text-xl font-bold text-white disabled:opacity-50"
                      >
                        {pickupId === order.id ? "처리 중..." : "☕ 수령 완료"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
