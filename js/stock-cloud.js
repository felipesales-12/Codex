import { createClient } from "@supabase/supabase-js";
const url = __SUPABASE_URL__,
  key = __SUPABASE_KEY__;
export const configured = Boolean(url && key);
export const cloud = configured
  ? createClient(url, key, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export async function snapshot() {
  const { data, error } = await cloud.rpc("inventory_snapshot");
  if (error) throw new Error(error.message);
  return data;
}
export async function events(before = null) {
  let query = cloud
    .from("inventory_events")
    .select("*")
    .order("id", { ascending: false })
    .limit(100);
  if (before) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
export async function allEvents() {
  const result = [];
  for (;;) {
    const batch = await events(result.at(-1)?.id);
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}
export async function apply(request) {
  if (!navigator.onLine)
    throw new Error(
      "Sem conexão. Reconecte e tente novamente; nenhuma confirmação foi recebida.",
    );
  const { data, error } = await cloud
    .rpc("inventory_apply", request)
    .retry(false);
  if (error) {
    const failure = new Error(error.message);
    failure.definitive = Boolean(
      error.code && /^[A-Z0-9]{5,}$/.test(error.code),
    );
    throw failure;
  }
  if (!data?.confirmed)
    throw new Error("Não foi possível confirmar a gravação. Tente novamente.");
}
export function watch(onRefresh, onStatus) {
  let timer,
    stopped = false;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) onRefresh();
    }, 200);
  };
  const channel = cloud
    .channel("factory-stock")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "inventory_state" },
      schedule,
    )
    .subscribe((status) => {
      if (stopped) return;
      onStatus(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") schedule();
    });
  const poll = setInterval(schedule, 30000);
  const focus = () => {
    if (!document.hidden) schedule();
  };
  window.addEventListener("online", schedule);
  window.addEventListener("focus", focus);
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener("online", schedule);
    window.removeEventListener("focus", focus);
    void cloud.removeChannel(channel);
  };
}
