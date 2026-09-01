"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  name: string;
  menu: string;
  temperature: string | null;
  taste: string | null;
  quantity: number;
  status: string;
  created_at: string;
  completed_at: string | null;
};

const getLocalDateString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;

  return new Date(now.getTime() - offset)
    .toISOString()
    .slice(0, 10);
};

const getDateRange = (date: string) => {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

export default function AdminPage() {
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(
    getLocalDateString()
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [isCafeOpen, setIsCafeOpen] = useState(true);
  const [updatingCafeOpen, setUpdatingCafeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchOrders = async () => {
    const { start, end } = getDateRange(selectedDate);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, name, menu, temperature, taste, quantity, status, created_at, completed_at"
      )
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("정산 데이터 불러오기 오류:", error);
      setErrorMessage("정산 데이터를 불러오지 못했습니다.");
      setOrders([]);
      return;
    }

    setOrders(data ?? []);
    setErrorMessage("");
  };

  // 관리자 로그인 확인
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/admin/login");
        return;
      }

      setCheckingAuth(false);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/admin/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // 선택한 날짜의 주문 불러오기
  useEffect(() => {
    if (checkingAuth) return;

    setLoading(true);

    fetchOrders().finally(() => {
      setLoading(false);
    });
  }, [selectedDate, checkingAuth]);

  // orders 테이블 Realtime
  // 키친에서 수령 완료 / 음료 완성 / 새 주문 등의 변경이 생기면
  // 관리자 정산 화면도 즉시 다시 불러온다.
  useEffect(() => {
    if (checkingAuth) return;

    const channel = supabase
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe((status) => {
        console.log("관리자 정산 Realtime:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkingAuth, selectedDate]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;

    const totalCups = orders.reduce(
      (sum, order) => sum + Number(order.quantity || 0),
      0
    );

    const americanoCups = orders
      .filter((order) => order.menu === "아메리카노")
      .reduce(
        (sum, order) => sum + Number(order.quantity || 0),
        0
      );

    const peachCups = orders
      .filter((order) => order.menu === "복숭아 아이스티")
      .reduce(
        (sum, order) => sum + Number(order.quantity || 0),
        0
      );

    const pickedUpOrders = orders.filter(
      (order) => order.status === "picked_up"
    );

    const pickedUpCups = pickedUpOrders.reduce(
      (sum, order) => sum + Number(order.quantity || 0),
      0
    );

    const hotCups = orders
      .filter(
        (order) =>
          order.menu === "아메리카노" &&
          order.temperature === "HOT"
      )
      .reduce(
        (sum, order) => sum + Number(order.quantity || 0),
        0
      );

    const iceCups = orders
      .filter(
        (order) =>
          order.menu === "아메리카노" &&
          order.temperature === "ICE"
      )
      .reduce(
        (sum, order) => sum + Number(order.quantity || 0),
        0
      );

    return {
      totalOrders,
      totalCups,
      americanoCups,
      peachCups,
      pickedUpOrders: pickedUpOrders.length,
      pickedUpCups,
      hotCups,
      iceCups,
    };
  }, [orders]);

  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusText = (status: string) => {
    if (status === "pending") return "제조 대기";
    if (status === "completed") return "음료 나옴";
    if (status === "picked_up") return "수령 완료";
    return status;
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.length === orders.length
        ? []
        : orders.map((order) => order.id)
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0 || deleting) return;

    if (
      !window.confirm(
        `선택한 주문 ${selectedIds.length}건을 삭제하시겠습니까?\n삭제하면 정산에서도 사라집니다.`
      )
    ) {
      return;
    }

    setDeleting(true);

    const { error } = await supabase
      .from("orders")
      .delete()
      .in("id", selectedIds);

    if (error) {
      console.error("주문 삭제 오류:", error);
      alert("주문 삭제에 실패했습니다.");
      setDeleting(false);
      return;
    }

    setOrders((prev) =>
      prev.filter((order) => !selectedIds.includes(order.id))
    );
    setSelectedIds([]);
    setDeleting(false);
  };

  const fetchCafeOpenState = async () => {
    const { data, error } = await supabase
      .from("cafe_settings")
      .select("is_open")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("운영 상태 조회 오류:", error);
      return;
    }

    if (data) setIsCafeOpen(data.is_open);
  };

  const toggleCafeOpen = async () => {
    if (updatingCafeOpen) return;

    const nextState = !isCafeOpen;
    const message = nextState
      ? "주문을 다시 받도록 변경할까요?"
      : "주문을 마감할까요?\n새로운 주문은 더 이상 접수되지 않습니다.";

    if (!window.confirm(message)) return;

    setUpdatingCafeOpen(true);

    const { error } = await supabase
      .from("cafe_settings")
      .update({
        is_open: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      console.error("운영 상태 변경 오류:", error);
      alert("운영 상태 변경에 실패했습니다.");
      setUpdatingCafeOpen(false);
      return;
    }

    setIsCafeOpen(nextState);
    setUpdatingCafeOpen(false);
  };

  useEffect(() => {
    fetchCafeOpenState();

    const channel = supabase
      .channel("admin-cafe-settings")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cafe_settings",
          filter: "id=eq.1",
        },
        (payload) => {
          const setting = payload.new as { is_open: boolean };
          setIsCafeOpen(setting.is_open);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-[#F8F5EF] flex items-center justify-center px-6">
        <div className="rounded-3xl bg-white p-10 text-center shadow-xl">
          <div className="text-6xl">🔐</div>
          <p className="mt-4 text-xl font-bold text-gray-600">
            관리자 권한 확인 중...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F5EF] px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3">
            <button
              onClick={toggleCafeOpen}
              disabled={updatingCafeOpen}
              className={`rounded-xl px-5 py-3 font-bold text-white shadow transition disabled:opacity-50 ${
                isCafeOpen
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-gray-500 hover:bg-gray-600"
              }`}
            >
              {updatingCafeOpen
                ? "변경 중..."
                : isCafeOpen
                ? "🟢 주문 받는 중"
                : "🔴 주문 마감"}
            </button>

                <span className="text-5xl">☕</span>

                <h1 className="text-4xl font-bold text-[#3E2723]">
                  샬롬커피 정산
                </h1>
              </div>

              <p className="mt-3 text-xl text-gray-500">
                관리자 전용 정산 페이지
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white px-5 py-4 shadow">
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-500"
                >
                  정산 날짜
                </label>

                <input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedIds([]);
                  }}
                  className="mt-2 rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold text-[#3E2723] outline-none focus:border-[#795548]"
                />
              </div>

              <button
                onClick={handleLogout}
                className="rounded-2xl bg-white px-5 py-4 font-bold text-gray-600 shadow hover:bg-gray-50"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-2xl bg-red-50 p-5 text-center text-red-600">
            {errorMessage}
          </div>
        )}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <p className="text-base text-gray-400">총 주문</p>
            <p className="mt-2 text-4xl font-bold text-[#3E2723]">
              {stats.totalOrders}
              <span className="ml-1 text-xl">건</span>
            </p>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <p className="text-base text-gray-400">총 음료</p>
            <p className="mt-2 text-4xl font-bold text-[#3E2723]">
              {stats.totalCups}
              <span className="ml-1 text-xl">잔</span>
            </p>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <p className="text-base text-gray-400">아메리카노</p>
            <p className="mt-2 text-4xl font-bold text-[#5D4037]">
              {stats.americanoCups}
              <span className="ml-1 text-xl">잔</span>
            </p>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <p className="text-base text-gray-400">
              복숭아 아이스티
            </p>
            <p className="mt-2 text-4xl font-bold text-[#5D4037]">
              {stats.peachCups}
              <span className="ml-1 text-xl">잔</span>
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <h2 className="text-2xl font-bold text-[#3E2723]">
              ☕ 아메리카노 상세
            </h2>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-[#F8F5EF] px-5 py-4">
                <span className="text-gray-500">🔥 HOT</span>
                <span className="text-xl font-bold text-gray-700">
                  {stats.hotCups}잔
                </span>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#F8F5EF] px-5 py-4">
                <span className="text-gray-500">🧊 ICE</span>
                <span className="text-xl font-bold text-gray-700">
                  {stats.iceCups}잔
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow-lg">
            <h2 className="text-2xl font-bold text-[#3E2723]">
              ☕ 수령 현황
            </h2>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#F8F5EF] p-5 text-center">
                <p className="text-sm text-gray-400">
                  수령 주문
                </p>
                <p className="mt-2 text-2xl font-bold text-[#5D4037]">
                  {stats.pickedUpOrders}건
                </p>
              </div>

              <div className="rounded-2xl bg-[#F8F5EF] p-5 text-center">
                <p className="text-sm text-gray-400">
                  수령 음료
                </p>
                <p className="mt-2 text-2xl font-bold text-[#5D4037]">
                  {stats.pickedUpCups}잔
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#3E2723]">
                📋 주문 내역
              </h2>

              <p className="mt-1 text-gray-400">
                선택한 날짜의 전체 주문입니다.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {selectedIds.length > 0 && (
                <span className="rounded-xl bg-[#F3EAE4] px-4 py-3 font-bold text-[#5D4037]">
                  {selectedIds.length}건 선택
                </span>
              )}

              <button
                onClick={handleDeleteSelected}
                disabled={selectedIds.length === 0 || deleting}
                className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {deleting ? "삭제 중..." : "🗑️ 선택 삭제"}
              </button>

              <button
                onClick={fetchOrders}
                className="rounded-xl bg-white px-5 py-3 font-bold text-[#5D4037] shadow hover:bg-[#F3EAE4]"
              >
                새로고침
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
            {loading ? (
              <div className="p-12 text-center text-xl text-gray-400">
                정산 데이터를 불러오는 중...
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl">☕</div>
                <p className="mt-4 text-xl font-bold text-gray-600">
                  해당 날짜의 주문이 없습니다.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-[#FFF8F3] text-left text-sm text-gray-500">
                      <th className="w-28 px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={toggleAll}
                          className="font-bold text-[#5D4037] hover:underline"
                        >
                          {orders.length > 0 && selectedIds.length === orders.length
                            ? "전체 해제"
                            : "전체 선택"}
                        </button>
                      </th>
                      <th className="px-5 py-4">시간</th>
                      <th className="px-5 py-4">주문자</th>
                      <th className="px-5 py-4">메뉴</th>
                      <th className="px-5 py-4">옵션</th>
                      <th className="px-5 py-4">수량</th>
                      <th className="px-5 py-4">상태</th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className={`border-b border-gray-100 last:border-0 ${
                          selectedIds.includes(order.id) ? "bg-red-50" : ""
                        }`}
                      >
                        <td className="px-5 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(order.id)}
                            onChange={() => toggleSelected(order.id)}
                            className="h-6 w-6 cursor-pointer accent-[#5D4037]"
                            aria-label={`${order.name}님 주문 선택`}
                          />
                        </td>

                        <td className="px-5 py-4 font-medium text-gray-700">
                          {formatTime(order.created_at)}
                        </td>

                        <td className="px-5 py-4 font-bold text-[#3E2723]">
                          {order.name}님
                        </td>

                        <td className="px-5 py-4 font-bold text-gray-800">
                          {order.menu === "아메리카노"
                            ? "☕ 아메리카노"
                            : "🍑 복숭아 아이스티"}
                        </td>

                        <td className="px-5 py-4 text-gray-500">
                          {order.menu === "아메리카노"
                            ? `${order.temperature ?? ""} · ${
                                order.taste ?? ""
                              }`
                            : "-"}
                        </td>

                        <td className="px-5 py-4 font-bold text-gray-700">
                          {order.quantity}잔
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                              order.status === "picked_up"
                                ? "bg-green-50 text-green-700"
                                : order.status === "completed"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-yellow-50 text-yellow-700"
                            }`}
                          >
                            {getStatusText(order.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <p className="mt-8 text-center text-sm text-gray-400">
          샬롬커피 · 관리자 정산
        </p>
      </div>
    </main>
  );
}
