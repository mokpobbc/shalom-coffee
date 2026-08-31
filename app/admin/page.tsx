"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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

  const fetchOrders = async () => {
    setLoading(true);
    setErrorMessage("");

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
      setErrorMessage(
        "정산 데이터를 불러오지 못했습니다."
      );
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!checkingAuth) {
      fetchOrders();
    }
  }, [selectedDate, checkingAuth]);

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
                  onChange={(event) =>
                    setSelectedDate(event.target.value)
                  }
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

            <button
              onClick={fetchOrders}
              className="rounded-xl bg-white px-5 py-3 font-bold text-[#5D4037] shadow hover:bg-[#F3EAE4]"
            >
              새로고침
            </button>
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
                        className="border-b border-gray-100 last:border-0"
                      >
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
